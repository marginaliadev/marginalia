// Browser-side MARGINALIA SDK: notes, Merkle trees and Groth16 proving.
// Mirrors lib/marginalia.js (Node SDK). Poseidon comes from poseidon-lite, which uses the same
// circomlib BN254 constants, so hashes are identical to the circuits and on-chain hashers.
import { poseidon1, poseidon2, poseidon3 } from "poseidon-lite";
import { solidityPackedKeccak256 } from "ethers";

export const FIELD = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
export const DEPTH = 20;
export const ASP_DEPTH = 20;

const WITHDRAW_WASM = "/zk/withdraw.wasm";
const WITHDRAW_ZKEY = "/zk/withdraw_final.zkey";
const RAGEQUIT_WASM = "/zk/ragequit.wasm";
const RAGEQUIT_ZKEY = "/zk/ragequit_final.zkey";

export interface Note {
  sk: bigint;
  rho: bigint;
  value: bigint;
  label: bigint;
  commitment: bigint;
}

export function randomField(): bigint {
  // 31 random bytes is always < FIELD
  const b = new Uint8Array(31);
  crypto.getRandomValues(b);
  return BigInt("0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""));
}

export function newSecret() {
  const sk = randomField();
  const rho = randomField();
  const precommitment = poseidon2([poseidon1([sk]), rho]);
  return { sk, rho, precommitment };
}

export function nullifierOf(sk: bigint, rho: bigint): bigint {
  return poseidon2([sk, rho]);
}

export function commitmentOf(value: bigint, label: bigint, sk: bigint, rho: bigint): bigint {
  return poseidon3([value, label, poseidon2([poseidon1([sk]), rho])]);
}

// ---------------------------------------------------------------- notes (same wire format as the CLI)
const PREFIX = "marginalia-note-v1-";

export function serializeNote(n: Note): string {
  const plain = Object.fromEntries(Object.entries(n).map(([k, v]) => [k, v.toString()]));
  const b64 = btoa(JSON.stringify(plain)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return PREFIX + b64;
}

export function parseNote(str: string): Note {
  const s = str.trim();
  if (!s.startsWith(PREFIX)) throw new Error("Invalid Note Prefix: Expected 'marginalia-note-v1-' prefix.");
  let obj: Record<string, string>;
  try {
    const b64 = s.slice(PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
    obj = JSON.parse(atob(b64));
  } catch {
    throw new Error("Malformed Note: payload is not valid base64url JSON.");
  }
  try {
    const n: Note = {
      sk: BigInt(obj.sk),
      rho: BigInt(obj.rho),
      value: BigInt(obj.value),
      label: BigInt(obj.label),
      commitment: BigInt(obj.commitment),
    };
    if (n.sk >= FIELD || n.rho >= FIELD || n.value <= BigInt(0)) throw new Error("range");
    if (commitmentOf(n.value, n.label, n.sk, n.rho) !== n.commitment) {
      throw new Error("Cryptographic Tampering Detected: note commitment does not match its secrets.");
    }
    return n;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Cryptographic")) throw e;
    throw new Error("Malformed Note: missing or invalid fields (sk, rho, value, label, commitment).");
  }
}

// ---------------------------------------------------------------- Merkle tree (mirrors MarginaliaPool._insert)
export class MerkleTree {
  depth: number;
  zeros: bigint[] = [BigInt(0)];
  layers: bigint[][];

  constructor(depth: number, leaves: bigint[] = []) {
    this.depth = depth;
    for (let i = 1; i <= depth; i++) this.zeros.push(poseidon2([this.zeros[i - 1], this.zeros[i - 1]]));
    this.layers = Array.from({ length: depth + 1 }, () => []);
    // Bulk build level by level (~2n hashes instead of 20n); identical to repeated insert().
    if (leaves.length > 0) {
      this.layers[0] = [...leaves];
      for (let lvl = 0; lvl < depth; lvl++) {
        const cur = this.layers[lvl];
        const next: bigint[] = [];
        for (let i = 0; i < cur.length; i += 2) next.push(poseidon2([cur[i], cur[i + 1] ?? this.zeros[lvl]]));
        this.layers[lvl + 1] = next;
      }
    }
  }
  insert(leaf: bigint) {
    let idx = this.layers[0].length;
    this.layers[0].push(leaf);
    for (let lvl = 0; lvl < this.depth; lvl++) {
      const parent = idx >> 1;
      const left = this.layers[lvl][parent * 2];
      const right = this.layers[lvl][parent * 2 + 1] ?? this.zeros[lvl];
      this.layers[lvl + 1][parent] = poseidon2([left, right]);
      idx = parent;
    }
  }
  root(): bigint {
    return this.layers[this.depth][0] ?? this.zeros[this.depth];
  }
  indexOf(leaf: bigint): number {
    return this.layers[0].findIndex((l) => l === leaf);
  }
  path(index: number) {
    if (index < 0 || index >= this.layers[0].length) throw new Error("leaf not in tree");
    const pathElements: bigint[] = [];
    const pathIndices: number[] = [];
    let idx = index;
    for (let lvl = 0; lvl < this.depth; lvl++) {
      pathElements.push(this.layers[lvl][idx ^ 1] ?? this.zeros[lvl]);
      pathIndices.push(idx & 1);
      idx >>= 1;
    }
    return { pathElements, pathIndices };
  }
}

// ---------------------------------------------------------------- proving
export interface SolidityProof {
  pA: [string, string];
  pB: [[string, string], [string, string]];
  pC: [string, string];
  pubSignals: string[];
}

async function loadSnarkjs() {
  // Cap prover worker threads: every worker reserves a large WASM heap, which exhausts memory on
  // low-RAM machines. 4 workers is plenty for these circuits.
  if (typeof navigator !== "undefined" && navigator.hardwareConcurrency > 4) {
    try {
      Object.defineProperty(navigator, "hardwareConcurrency", { value: 4, configurable: true });
    } catch {}
  }
  return await import("snarkjs");
}

function toSolidity(proof: any, publicSignals: string[]): SolidityProof {
  return {
    pA: [proof.pi_a[0], proof.pi_a[1]],
    pB: [
      [proof.pi_b[0][1], proof.pi_b[0][0]],
      [proof.pi_b[1][1], proof.pi_b[1][0]],
    ],
    pC: [proof.pi_c[0], proof.pi_c[1]],
    pubSignals: publicSignals,
  };
}

const str = (o: unknown) => JSON.parse(JSON.stringify(o, (_, v) => (typeof v === "bigint" ? v.toString() : v)));

export async function proveWithdraw(args: {
  note: Note;
  stateTree: MerkleTree;
  aspTree: MerkleTree;
  withdrawnValue: bigint;
  context: bigint;
}) {
  const { note, stateTree, aspTree, withdrawnValue, context } = args;
  if (withdrawnValue <= BigInt(0) || withdrawnValue > note.value) throw new Error("Withdrawal amount must be between 0 and the note value.");
  const leafIndex = stateTree.indexOf(note.commitment);
  if (leafIndex < 0) throw new Error("Note commitment not found in the Folio tree.");
  const labelIndex = aspTree.indexOf(note.label);
  if (labelIndex < 0) throw new Error("This deposit has not been approved by the Magistrate yet (label not in the ASP set).");

  const sp = stateTree.path(leafIndex);
  const ap = aspTree.path(labelIndex);
  const newRho = randomField();
  const remaining = note.value - withdrawnValue;
  const P = poseidon1([note.sk]);
  const newCommitment = poseidon3([remaining, note.label, poseidon2([P, newRho])]);
  const nullifierHash = nullifierOf(note.sk, note.rho);

  const input = {
    withdrawnValue,
    stateRoot: stateTree.root(),
    aspRoot: aspTree.root(),
    context,
    nullifierHash,
    newCommitment,
    sk: note.sk,
    value: note.value,
    label: note.label,
    rho: note.rho,
    statePathElements: sp.pathElements,
    statePathIndices: sp.pathIndices,
    aspPathElements: ap.pathElements,
    aspPathIndices: ap.pathIndices,
    newRho,
  };

  const snarkjs: any = await loadSnarkjs();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(str(input), WITHDRAW_WASM, WITHDRAW_ZKEY);
  const changeNote: Note = { sk: note.sk, rho: newRho, value: remaining, label: note.label, commitment: newCommitment };
  return { proof: toSolidity(proof, publicSignals), changeNote, nullifierHash };
}

export async function proveRagequit(note: Note) {
  const precommitment = poseidon2([poseidon1([note.sk]), note.rho]);
  const nullifierHash = nullifierOf(note.sk, note.rho);
  const input = {
    precommitment: precommitment.toString(),
    nullifierHash: nullifierHash.toString(),
    sk: note.sk.toString(),
    rho: note.rho.toString(),
  };
  const snarkjs: any = await loadSnarkjs();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, RAGEQUIT_WASM, RAGEQUIT_ZKEY);
  return { proof: toSolidity(proof, publicSignals), nullifierHash };
}

// ---------------------------------------------------------------- crash recovery
/**
 * Rebuild a deposit note from its secret alone (sk, rho, value). The pool derives
 * label = keccak256(chainId, pool, depositNonce) % FIELD, and depositNonce can never exceed the leaf count,
 * so the commitment can be found by scanning candidate nonces against the Folio leaves.
 * Lets a user recover funds even if the page died after the deposit tx but before the note was shown.
 */
export function recoverNote(
  secret: { sk: bigint; rho: bigint; value: bigint },
  leaves: bigint[],
  chainId: number,
  pool: string
): Note | null {
  const known = new Set(leaves);
  const pre = poseidon2([poseidon1([secret.sk]), secret.rho]);
  for (let n = 0; n <= leaves.length; n++) {
    const label = BigInt(solidityPackedKeccak256(["uint256", "address", "uint256"], [chainId, pool, n])) % FIELD;
    const commitment = poseidon3([secret.value, label, pre]);
    if (known.has(commitment)) return { sk: secret.sk, rho: secret.rho, value: secret.value, label, commitment };
  }
  return null;
}
