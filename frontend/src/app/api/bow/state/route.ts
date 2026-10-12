import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { makeProvider } from "@/lib/folio";
import { bowClientConfig } from "@/lib/bow-config";
import { fetchAspDocument, parseAspDocument } from "@/lib/aspStore";

// Read side for the /pool page: the state-tree leaves of the 0xbow pool, the current ASP root with its approved labels, and the pool settings.
// The browser does NOT trust this answer: it recomputes both roots and compares them with the chain (see /pool). The leaf scan is cached in memory
// and extended incrementally; on a free RPC plan (10-block eth_getLogs) the first scan can take several calls, so it answers 202 while it syncs.
const POOL_ABI = [
  "event LeafInserted(uint256 _index, uint256 _leaf, uint256 _root)",
  "event Deposited(address indexed _depositor, uint256 _commitment, uint256 _label, uint256 _value, uint256 _precommitmentHash)",
  "function SCOPE() view returns (uint256)",
  "function currentRoot() view returns (uint256)",
  "function currentTreeSize() view returns (uint256)",
];
const ENTRY_ABI = [
  "function latestRoot() view returns (uint256)",
  "function associationSets(uint256) view returns (uint256 root, string ipfsCID, uint256 timestamp)",
  "function assetConfig(address) view returns (address pool, uint256 minimumDepositAmount, uint256 vettingFeeBPS, uint256 maxRelayFeeBPS)",
];
const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

type Dep = { label: string; value: string; precommitment: string };
type Cache = { pool: string; leaves: Map<number, bigint>; deposits: Map<string, Dep>; next: number; setCount: number; chunk?: number };
const g = globalThis as unknown as { __bowState?: Cache };

/** Number of association sets (the contract exposes only the indexed getter): probe doubling, then bisect. */
async function setCount(entry: ethers.Contract, from: number): Promise<number> {
  const exists = async (i: number) => { try { await entry.associationSets(i); return true; } catch { return false; } };
  if (!(await exists(from))) return from; // nothing new
  let lo = from, hi = Math.max(1, from * 2);
  while (await exists(hi)) { lo = hi; hi *= 2; }
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (await exists(mid)) lo = mid; else hi = mid; }
  return lo + 1;
}

export async function GET() {
  const cfg = bowClientConfig();
  if (!cfg.configured) return NextResponse.json({ error: "The 0xbow pool is not configured on this deployment" }, { status: 503 });
  try {
    const provider = makeProvider();
    const logs = process.env.RH_LOGS_RPC_URL ? makeProvider(process.env.RH_LOGS_RPC_URL) : provider;
    const pool = new ethers.Contract(cfg.pool, POOL_ABI, logs);
    const entry = new ethers.Contract(cfg.entrypoint, ENTRY_ABI, provider);
    const iface = new ethers.Interface(POOL_ABI);
    const topics = [[iface.getEvent("LeafInserted")!.topicHash, iface.getEvent("Deposited")!.topicHash]];

    const cache: Cache = g.__bowState && g.__bowState.pool === cfg.pool && g.__bowState.deposits instanceof Map && g.__bowState.leaves instanceof Map ? g.__bowState : (g.__bowState = { pool: cfg.pool, leaves: new Map(), deposits: new Map(), next: cfg.deployBlock, setCount: 0 });
    const head = await logs.getBlockNumber(); // the SAME provider that serves the logs: a lagging log node must not be scanned past its own head
    // Progress is kept in the cache after EVERY successful range, so a slow first sync continues where it stopped on the next call.
    let chunk = cache.chunk || Number(process.env.RH_LOG_CHUNK || (process.env.RH_LOGS_RPC_URL ? 100000 : 10));
    const started = Date.now();
    while (cache.next <= head && Date.now() - started < 20000) {
      const to = Math.min(cache.next + chunk - 1, head);
      try {
        const found = await logs.getLogs({ address: cfg.pool, topics, fromBlock: cache.next, toBlock: to });
        for (const l of found) {
          const p = iface.parseLog(l)!;
          if (p.name === "LeafInserted") cache.leaves.set(Number(p.args._index) - 1, BigInt(p.args._leaf)); // _index is the tree size AFTER the insert (1-based)
          else cache.deposits.set(p.args._commitment.toString(), { label: p.args._label.toString(), value: p.args._value.toString(), precommitment: p.args._precommitmentHash.toString() });
        }
        cache.next = to + 1;
      } catch (e) {
        if (chunk <= 10) throw e;
        chunk = Math.max(10, Math.floor(chunk / 10)); // the provider refused the range: shrink and retry the same blocks
      }
    }
    cache.chunk = chunk;
    const complete = cache.next > head;
    if (!complete) return NextResponse.json({ syncing: true, scannedUpTo: cache.next - 1, deployBlock: cfg.deployBlock, cachedLeaves: cache.leaves.size, head }, { status: 202 });

    // every on-chain read below is pinned to the block the scan stopped at, so a deposit that lands meanwhile cannot create a gap
    const at = { blockTag: head };
    const size = Number(await pool.currentTreeSize(at));
    const stateLeaves: string[] = [];
    for (let i = 0; i < size; i++) {
      const v = cache.leaves.get(i);
      if (v === undefined) { cache.next = Math.max(cfg.deployBlock, cache.next - 2000); return NextResponse.json({ syncing: true, scannedUpTo: cache.next - 1, deployBlock: cfg.deployBlock, cachedLeaves: cache.leaves.size, head, treeSize: size, firstMissingIndex: i }, { status: 202 }); } // rescan the last blocks instead of dropping the cache
      stateLeaves.push(v.toString());
    }

    let aspRoot: string | null = null, aspCid: string | null = null, aspLabels: string[] = [];
    try {
      aspRoot = (await entry.latestRoot()).toString();
      cache.setCount = await setCount(entry, cache.setCount);
      const latest = await entry.associationSets(cache.setCount - 1);
      aspCid = String(latest.ipfsCID);
      aspLabels = parseAspDocument(await fetchAspDocument(aspCid)).map((x) => x.toString());
    } catch { /* no root yet, or the list is not retrievable: the client then shows "not approved yet" */ }

    const cfgAsset = await entry.assetConfig(NATIVE);
    return NextResponse.json({
      chainKey: cfg.chainKey, entrypoint: cfg.entrypoint, pool: cfg.pool, scope: (await pool.SCOPE(at)).toString(),
      minimumDeposit: cfgAsset.minimumDepositAmount.toString(), maxRelayFeeBps: cfgAsset.maxRelayFeeBPS.toString(), vettingFeeBps: cfgAsset.vettingFeeBPS.toString(),
      stateRoot: (await pool.currentRoot(at)).toString(), stateLeaves, deposits: Object.fromEntries(cache.deposits), aspRoot, aspCid, aspLabels, head, fetchedAt: Date.now(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ error: `State unavailable: ${e.shortMessage || e.message || "internal error"}`.slice(0, 200) }, { status: 502 });
  }
}
