// Lean incremental Merkle tree exactly as used by the 0xbow core and its SDK (@zk-kit/lean-imt with Poseidon(a, b)):
// a node without a right sibling is carried up unchanged, and the depth is ceil(log2(leaves)). Needed to publish the same ASP root the
// SDK computes (migration plan section 5: "root built by the publisher == SDK root for the same input").
// `hash2` is injected (a Poseidon of two field elements returning a bigint), so this file has no dependency.

function depthOf(n) { return n <= 1 ? 0 : Math.ceil(Math.log2(n)); }

function buildLevels(leaves, hash2) {
  const levels = [leaves.map(BigInt)];
  for (let level = 0; level < depthOf(leaves.length); level++) {
    const cur = levels[level], next = [];
    for (let i = 0; i < cur.length; i += 2) next.push(i + 1 < cur.length ? hash2(cur[i], cur[i + 1]) : cur[i]);
    levels.push(next);
  }
  return levels;
}

/** { root, depth, size }. An empty tree has root 0n (the Entrypoint rejects a zero root, so callers must not publish it). */
function leanRoot(leaves, hash2) {
  if (leaves.length === 0) return { root: 0n, depth: 0, size: 0 };
  const levels = buildLevels(leaves, hash2);
  return { root: levels[levels.length - 1][0], depth: levels.length - 1, size: leaves.length };
}

/** Same shape as the SDK's generateMerkleProof, except that a one-leaf path gives index 0 where the SDK returns NaN. */
function leanProof(leaves, leaf, hash2) {
  const target = BigInt(leaf);
  let index = leaves.findIndex((l) => BigInt(l) === target);
  if (index < 0) throw new Error("leaf not found in the leaves array");
  const levels = buildLevels(leaves, hash2);
  const siblings = [], path = [];
  let i = index;
  for (let level = 0; level < levels.length - 1; level++) {
    const isRight = i & 1;
    const sib = levels[level][isRight ? i - 1 : i + 1];
    if (sib !== undefined) { path.push(isRight); siblings.push(sib); }
    i >>= 1;
  }
  return { root: levels[levels.length - 1][0], leaf: target, index: path.length ? parseInt(path.reverse().join(""), 2) : 0, siblings, depth: levels.length - 1 };
}

module.exports = { depthOf, leanRoot, leanProof };
