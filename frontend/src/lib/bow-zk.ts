// Browser-side client for the unmodified 0xbow core (migration plan, step M3): secrets, notes, trees, circuit inputs and proving.
// The cryptography is upstream: Poseidon from poseidon-lite (same constants as the SDK, checked by known-answer tests), circuits and keys
// pinned by SHA-256 from vendor/0xbow/MANIFEST.json (zk-hashes-bow.ts). Nothing here invents a new scheme.
import { poseidon1, poseidon2, poseidon3 } from "poseidon-lite";
import { AbiCoder, keccak256 } from "ethers";
import { depthOf, leanProof } from "./bow-tree.ts";

export const FIELD = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
const hash2 = (a: bigint, b: bigint) => poseidon2([a, b]);

export function randomField(): bigint {
  const b = new Uint8Array(31); // 31 random bytes are always < FIELD
  crypto.getRandomValues(b);
  return BigInt("0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""));
}

/** Non-zero secrets (the SDK refuses zero). precommitment = Poseidon(nullifier, secret). */
export function newBowSecrets() {
  let nullifier = BigInt(0), secret = BigInt(0);
  while (nullifier === BigInt(0)) nullifier = randomField();
  while (secret === BigInt(0)) secret = randomField();
  return { nullifier, secret, precommitment: poseidon2([nullifier, secret]) };
}

export const bowCommitment = (value: bigint, label: bigint, nullifier: bigint, secret: bigint) =>
  poseidon3([value, label, poseidon2([nullifier, secret])]);

/**
 * The value the pool records as spent (public signal 1 of the withdraw proof) is Poseidon(nullifier).
 * Beware: the upstream SDK field getCommitment(...).nullifierHash is the PRECOMMITMENT hash, not this.
 */
export const bowNullifierHash = (nullifier: bigint) => poseidon1([nullifier]);

// ---------------------------------------------------------------- notes
export interface BowNote {
  chainId: number; asset: string; scope: bigint; value: bigint; label: bigint;
  nullifier: bigint; secret: bigint; precommitment: bigint; commitment: bigint; block?: number; tx?: string;
}
const PREFIX = "marginalia-bow-v1-";
const toB64 = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64 = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));

export function serializeBowNote(n: BowNote): string {
  const plain: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(n)) if (v !== undefined) plain[k] = typeof v === "bigint" ? v.toString() : (v as string | number);
  return PREFIX + toB64(JSON.stringify(plain));
}

export function parseBowNote(str: string): BowNote {
  const s = str.trim();
  if (!s.startsWith(PREFIX)) throw new Error("Invalid note prefix: expected " + PREFIX);
  let o: Record<string, string | number>;
  try { o = JSON.parse(fromB64(s.slice(PREFIX.length))); } catch { throw new Error("Malformed note: payload is not valid base64url JSON."); }
  try {
    const n: BowNote = {
      chainId: Number(o.chainId), asset: String(o.asset), scope: BigInt(o.scope), value: BigInt(o.value), label: BigInt(o.label),
      nullifier: BigInt(o.nullifier), secret: BigInt(o.secret), precommitment: BigInt(o.precommitment), commitment: BigInt(o.commitment),
      block: o.block === undefined ? undefined : Number(o.block), tx: o.tx === undefined ? undefined : String(o.tx),
    };
    const ranged = [n.scope, n.label, n.nullifier, n.secret, n.precommitment, n.commitment].every((x) => x > BigInt(0) && x < FIELD);
    if (!ranged || n.value <= BigInt(0)) throw new Error("range");
    if (poseidon2([n.nullifier, n.secret]) !== n.precommitment || bowCommitment(n.value, n.label, n.nullifier, n.secret) !== n.commitment) {
      throw new Error("tamper");
    }
    return n;
  } catch (e) {
    if (e instanceof Error && e.message === "tamper") throw new Error("Cryptographic tampering detected: the note commitment does not match its secrets.");
    throw new Error("Malformed note: missing or invalid fields.");
  }
}

// ---------------------------------------------------------------- withdrawal context and circuit input
/** keccak256(abi.encode(withdrawal, scope)) % SNARK_FIELD, as PrivacyPool and Entrypoint compute it. */
export function withdrawalContext(w: { processooor: string; data: string }, scope: bigint): bigint {
  const enc = AbiCoder.defaultAbiCoder().encode(["tuple(address processooor, bytes data)", "uint256"], [[w.processooor, w.data], scope]);
  return BigInt(keccak256(enc)) % FIELD;
}

const pad32 = (s: bigint[]) => { const a = [...s]; while (a.length < 32) a.push(BigInt(0)); return a; };
const str = (x: bigint) => x.toString();

export interface WithdrawInputArgs {
  note: BowNote; stateLeaves: bigint[]; aspLabels: bigint[]; withdrawnValue: bigint; context: bigint; newNullifier: bigint; newSecret: bigint;
}

/** Circuit input for withdraw.circom, in the shape the pinned circuit expects (all values as decimal strings). */
export function buildBowWithdrawInput(a: WithdrawInputArgs) {
  if (a.withdrawnValue <= BigInt(0) || a.withdrawnValue > a.note.value) throw new Error("withdrawnValue must be in (0, note value]");
  if (a.newNullifier === BigInt(0) || a.newSecret === BigInt(0)) throw new Error("new secrets must be non-zero");
  const sp = leanProof(a.stateLeaves, a.note.commitment, hash2);
  const ap = leanProof(a.aspLabels, a.note.label, hash2); // throws "leaf not found" when the Magistrate has not approved the label
  return {
    input: {
      withdrawnValue: str(a.withdrawnValue), stateRoot: str(sp.root), stateTreeDepth: String(sp.depth), ASPRoot: str(ap.root), ASPTreeDepth: String(ap.depth),
      context: str(a.context), label: str(a.note.label), existingValue: str(a.note.value), existingNullifier: str(a.note.nullifier), existingSecret: str(a.note.secret),
      newNullifier: str(a.newNullifier), newSecret: str(a.newSecret),
      stateSiblings: pad32(sp.siblings).map(str), stateIndex: String(sp.index), ASPSiblings: pad32(ap.siblings).map(str), ASPIndex: String(ap.index),
    },
    stateRoot: sp.root, aspRoot: ap.root, aspTreeDepth: depthOf(a.aspLabels.length),
    change: { value: a.note.value - a.withdrawnValue, label: a.note.label, nullifier: a.newNullifier, secret: a.newSecret },
  };
}

// ---------------------------------------------------------------- pinned assets and proving
const verified = new Map<string, Promise<Uint8Array>>();
export function loadVerifiedBowAsset(url: string): Promise<Uint8Array> {
  let p = verified.get(url);
  if (!p) {
    p = (async () => {
      const name = url.split("/").pop() as string;
      const { ZK_HASHES_BOW } = await import("./zk-hashes-bow.ts");
      const expected = ZK_HASHES_BOW[name];
      if (!expected) throw new Error("No pinned hash for " + name);
      const r = await fetch(url, { cache: "force-cache" });
      if (!r.ok) throw new Error("Could not download " + name + " (HTTP " + r.status + ")");
      const bytes = new Uint8Array(await r.arrayBuffer());
      const hex = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
      if (hex !== expected) throw new Error("Proving asset " + name + " does not match its pinned hash. Refusing to prove.");
      return bytes;
    })();
    verified.set(url, p);
    p.catch(() => verified.delete(url));
  }
  return p;
}

/** Groth16 proof in the shape /api/relay/bow and Entrypoint.relay expect: pB limbs swapped, 8 public signals. */
export function toRelayProof(proof: any, publicSignals: string[]) {
  const s = (x: unknown) => String(x);
  return {
    pA: [s(proof.pi_a[0]), s(proof.pi_a[1])],
    pB: [[s(proof.pi_b[0][1]), s(proof.pi_b[0][0])], [s(proof.pi_b[1][1]), s(proof.pi_b[1][0])]],
    pC: [s(proof.pi_c[0]), s(proof.pi_c[1])],
    pubSignals: publicSignals.slice(0, 8).map(s),
  };
}

export async function proveBowWithdrawal(input: Record<string, unknown>, base = "/zk-bow") {
  const snarkjs: any = await import("snarkjs");
  const wasm = await loadVerifiedBowAsset(`${base}/withdraw.wasm`);
  const zkey = await loadVerifiedBowAsset(`${base}/withdraw.zkey`);
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, { type: "mem", data: wasm }, { type: "mem", data: zkey });
  return { proof, publicSignals: publicSignals as string[], relayProof: toRelayProof(proof, publicSignals) };
}

/** Circuit input of the commitment circuit used for ragequit (all decimal strings). */
export const bowRagequitInput = (n: { value: bigint; label: bigint; nullifier: bigint; secret: bigint }) => ({ value: n.value.toString(), label: n.label.toString(), nullifier: n.nullifier.toString(), secret: n.secret.toString() });

/** Ragequit proof (commitment circuit): public signals are [commitment, nullifierHash, value, label]. */
export async function proveBowRagequit(note: { value: bigint; label: bigint; nullifier: bigint; secret: bigint }, base = "/zk-bow") {
  const snarkjs: any = await import("snarkjs");
  const wasm = await loadVerifiedBowAsset(`${base}/commitment.wasm`);
  const zkey = await loadVerifiedBowAsset(`${base}/commitment.zkey`);
  const input = bowRagequitInput(note);
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, { type: "mem", data: wasm }, { type: "mem", data: zkey });
  const s = (x: unknown) => String(x);
  return {
    publicSignals: publicSignals as string[],
    ragequitProof: {
      pA: [s(proof.pi_a[0]), s(proof.pi_a[1])],
      pB: [[s(proof.pi_b[0][1]), s(proof.pi_b[0][0])], [s(proof.pi_b[1][1]), s(proof.pi_b[1][0])]],
      pC: [s(proof.pi_c[0]), s(proof.pi_c[1])],
      pubSignals: publicSignals.slice(0, 4).map(s),
    },
  };
}
