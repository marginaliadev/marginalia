// Lean incremental Merkle tree exactly as the 0xbow core and its SDK build it (a port of lib/bow/lean-imt.js, same known-answer tests):
// a node without a right sibling is carried up unchanged; depth = ceil(log2(leaves)). `hash2` is Poseidon(a, b).
export type Hash2 = (a: bigint, b: bigint) => bigint;

export function depthOf(n: number): number {
  return n <= 1 ? 0 : Math.ceil(Math.log2(n));
}

function levelsOf(leaves: bigint[], hash2: Hash2): bigint[][] {
  const levels: bigint[][] = [leaves.map((l) => BigInt(l))];
  for (let level = 0; level < depthOf(leaves.length); level++) {
    const cur = levels[level];
    const next: bigint[] = [];
    for (let i = 0; i < cur.length; i += 2) next.push(i + 1 < cur.length ? hash2(cur[i], cur[i + 1]) : cur[i]);
    levels.push(next);
  }
  return levels;
}

export function leanRoot(leaves: bigint[], hash2: Hash2): { root: bigint; depth: number; size: number } {
  if (leaves.length === 0) return { root: BigInt(0), depth: 0, size: 0 };
  const levels = levelsOf(leaves, hash2);
  return { root: levels[levels.length - 1][0], depth: levels.length - 1, size: leaves.length };
}

/** Same as the SDK generateMerkleProof, except that a one-leaf path gives index 0 where the SDK returns NaN. */
export function leanProof(leaves: bigint[], leaf: bigint, hash2: Hash2) {
  const target = BigInt(leaf);
  const found = leaves.findIndex((l) => BigInt(l) === target);
  if (found < 0) throw new Error("leaf not found in the leaves array");
  const levels = levelsOf(leaves, hash2);
  const siblings: bigint[] = [];
  const path: number[] = [];
  let i = found;
  for (let level = 0; level < levels.length - 1; level++) {
    const isRight = i & 1;
    const sib = levels[level][isRight ? i - 1 : i + 1];
    if (sib !== undefined) { path.push(isRight); siblings.push(sib); }
    i >>= 1;
  }
  return { root: levels[levels.length - 1][0], leaf: target, index: path.length ? parseInt(path.reverse().join(""), 2) : 0, siblings, depth: levels.length - 1 };
}
