// Server-side Folio (commitment tree) + ASP set provider for the browser prover.
// Leaves come from an index (Supabase and/or an in-memory record of verified txs), the gap to the chain head
// is filled from LeafInserted logs, and the result is only served if it reproduces the pool's on-chain root.
import fs from "fs";
import path from "path";
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";
import { RH_TESTNET, POOL_ABI, REGISTER_ABI, POOL_EVENTS_ABI } from "@/lib/constants";
import { MerkleTree, DEPTH, ASP_DEPTH } from "@/lib/zk";

const DEPLOY_BLOCK = Number(process.env.POOL_DEPLOY_BLOCK || 129140787);
const SCAN_BUDGET_MS = 25_000;

export function rpcUrl() {
  return process.env.RH_TESTNET_RPC_URL || process.env.NEXT_PUBLIC_RH_TESTNET_RPC_URL || RH_TESTNET.rpcUrl;
}
export function makeProvider(url = rpcUrl()) {
  // fixed network: no eth_chainId detection round trips (and no retry noise) on every request
  return new ethers.JsonRpcProvider(url, RH_TESTNET.chainId, { staticNetwork: true });
}
export function poolAddress() {
  return process.env.MARGINALIA_POOL_ADDRESS || RH_TESTNET.poolAddress;
}
export function registerAddress() {
  return process.env.MAGISTRATE_REGISTER_ADDRESS || RH_TESTNET.registerAddress;
}

interface LeafRec { index: number; leaf: bigint; block: number; tx: string }

// Leaves verified from receipts by /api/folio/record (survive until the process restarts).
// Kept on globalThis: Next can bundle each route separately, which would give every route its own module state.
const g = globalThis as unknown as { __folioRecorded?: Map<number, LeafRec>; __folioCache?: { at: number; data: FolioData } | null };
const recorded: Map<number, LeafRec> = (g.__folioRecorded ??= new Map());

export interface FolioData {
  pool: string;
  register: string;
  nextIndex: number;
  root: string;
  leaves: string[];
  aspRoot: string;
  aspLabels: string[];
}

function supabaseClient(write = false) {
  const url = process.env.SUPABASE_URL;
  const key = (write && process.env.SUPABASE_SERVICE_ROLE_KEY) || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function dbLeaves(): Promise<LeafRec[]> {
  const sb = supabaseClient();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from("folio_leaves")
      .select("leaf_index, leaf_commitment, block_number, tx_hash, pool_address")
      .order("leaf_index", { ascending: true });
    if (error || !data) return [];
    return data
      .filter((r) => !r.pool_address || r.pool_address.toLowerCase() === poolAddress().toLowerCase())
      .map((r) => ({ index: Number(r.leaf_index), leaf: BigInt(r.leaf_commitment), block: Number(r.block_number), tx: r.tx_hash }));
  } catch {
    return [];
  }
}

export async function persistLeaves(recs: LeafRec[]) {
  for (const r of recs) recorded.set(r.index, r);
  g.__folioCache = null;
  const sb = supabaseClient(true);
  if (!sb || !process.env.SUPABASE_SERVICE_ROLE_KEY) return false; // anon key is read-only under RLS
  try {
    const { error } = await sb.from("folio_leaves").upsert(
      recs.map((r) => ({
        leaf_index: r.index,
        leaf_commitment: r.leaf.toString(),
        pool_address: poolAddress().toLowerCase(),
        block_number: r.block,
        tx_hash: r.tx,
      }))
    );
    return !error;
  } catch {
    return false;
  }
}

/** Extract verified LeafInserted records for this pool from a mined tx. */
export async function leavesFromTx(provider: ethers.Provider, txHash: string): Promise<LeafRec[]> {
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt || receipt.status !== 1) throw new Error("Transaction not found or failed");
  const iface = new ethers.Interface(POOL_EVENTS_ABI);
  const out: LeafRec[] = [];
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== poolAddress().toLowerCase()) continue;
    try {
      const ev = iface.parseLog(log);
      if (ev && ev.name === "LeafInserted") {
        out.push({ index: Number(ev.args.index), leaf: BigInt(ev.args.leaf), block: receipt.blockNumber, tx: txHash });
      }
    } catch {}
  }
  if (out.length === 0) throw new Error("No Folio leaf was inserted by this transaction");
  return out;
}

async function scanLogs(provider: ethers.JsonRpcProvider, from: number, to: number): Promise<LeafRec[]> {
  const iface = new ethers.Interface(POOL_EVENTS_ABI);
  const topic = iface.getEvent("LeafInserted")!.topicHash;
  // Free-tier RPCs cap eth_getLogs at 10 blocks. Set RH_LOG_CHUNK (and RH_LOGS_RPC_URL) for RPCs that allow more.
  const chunk = Math.max(1, parseInt(process.env.RH_LOG_CHUNK || "10", 10));
  const logsProvider = process.env.RH_LOGS_RPC_URL ? new ethers.JsonRpcProvider(process.env.RH_LOGS_RPC_URL) : provider;
  const started = Date.now();
  const out: LeafRec[] = [];
  for (let f = from; f <= to; f += chunk) {
    if (Date.now() - started > SCAN_BUDGET_MS) throw new Error("Folio log scan exceeded its time budget; sync the index (scripts/sync-folio.js)");
    const t = Math.min(f + chunk - 1, to);
    const logs = await logsProvider.getLogs({ address: poolAddress(), topics: [topic], fromBlock: f, toBlock: t });
    for (const log of logs) {
      const ev = iface.parseLog(log)!;
      out.push({ index: Number(ev.args.index), leaf: BigInt(ev.args.leaf), block: log.blockNumber, tx: log.transactionHash });
    }
  }
  return out;
}

const DEFAULT_ASP_URL = "https://raw.githubusercontent.com/marginaliadev/marginalia/main/asp/robinhoodTestnet.labels.json";

function parseLabels(j: any): bigint[] {
  return (j.labels as string[]).map((l) => BigInt(l));
}

/** Candidate approved-label lists, in order: local file (dev), then a published URL (deployments without the repo). */
async function aspCandidates(): Promise<Array<{ source: string; load: () => Promise<bigint[]> }>> {
  const file = process.env.ASP_LABELS_FILE || path.join(process.cwd(), "..", "asp", "robinhoodTestnet.labels.json");
  const url = process.env.ASP_LABELS_URL || DEFAULT_ASP_URL;
  return [
    { source: `file ${file}`, load: async () => parseLabels(JSON.parse(fs.readFileSync(file, "utf8"))) },
    {
      source: `url ${url}`,
      load: async () => {
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return parseLabels(await r.json());
      },
    },
  ];
}

/** First candidate whose Merkle root the Magistrate's register accepts. Never serves an unverified set. */
async function loadVerifiedAsp(register: ethers.Contract): Promise<{ labels: bigint[]; root: bigint }> {
  const problems: string[] = [];
  for (const c of await aspCandidates()) {
    try {
      const labels = await c.load();
      const root = new MerkleTree(ASP_DEPTH, labels).root();
      if (await register.isValidRoot(root)) return { labels, root };
      problems.push(`${c.source}: root not published by the Magistrate`);
    } catch (e: any) {
      problems.push(`${c.source}: ${e.message}`);
    }
  }
  throw new Error(`No approved-label list matches the Magistrate's on-chain root (${problems.join("; ")})`);
}

export async function getFolio(force = false): Promise<FolioData> {
  if (!force && g.__folioCache && Date.now() - g.__folioCache.at < 10_000) return g.__folioCache.data;

  const provider = makeProvider();
  const pool = new ethers.Contract(poolAddress(), POOL_ABI, provider);
  const register = new ethers.Contract(registerAddress(), REGISTER_ABI, provider);
  const [nextIndexBn, onchainRoot] = await Promise.all([pool.nextIndex(), pool.getLastRoot()]);
  const nextIndex = Number(nextIndexBn);

  // 1. known leaves (index + verified records), contiguous from 0
  const byIndex = new Map<number, LeafRec>();
  for (const r of await dbLeaves()) byIndex.set(r.index, r);
  for (const r of recorded.values()) byIndex.set(r.index, r);
  let known = 0;
  while (known < nextIndex && byIndex.has(known)) known++;

  // 2. fill the gap from chain logs
  if (known < nextIndex) {
    const head = await provider.getBlockNumber();
    const lastBlock = known > 0 ? byIndex.get(known - 1)!.block : DEPLOY_BLOCK;
    const found = await scanLogs(provider, known > 0 ? lastBlock : DEPLOY_BLOCK, head);
    for (const r of found) byIndex.set(r.index, r);
    persistLeaves(found).catch(() => {});
    known = 0;
    while (known < nextIndex && byIndex.has(known)) known++;
  }
  if (known < nextIndex) throw new Error(`Folio incomplete: have ${known} of ${nextIndex} leaves`);

  const leaves = Array.from({ length: nextIndex }, (_, i) => byIndex.get(i)!.leaf);
  const tree = new MerkleTree(DEPTH, leaves);
  if (tree.root() !== BigInt(onchainRoot)) {
    // index is poisoned or stale: drop in-memory records and fail closed
    recorded.clear();
    throw new Error("Folio index does not reproduce the on-chain root");
  }

  // 3. ASP set (verified against the register)
  const { labels: aspLabels, root: aspRoot } = await loadVerifiedAsp(register);

  const data: FolioData = {
    pool: poolAddress(),
    register: registerAddress(),
    nextIndex,
    root: tree.root().toString(),
    leaves: leaves.map((l) => l.toString()),
    aspRoot: aspRoot.toString(),
    aspLabels: aspLabels.map((l) => l.toString()),
  };
  g.__folioCache = { at: Date.now(), data };
  return data;
}
