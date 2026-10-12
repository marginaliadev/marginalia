// Known-answer test: roots and proofs from the pinned upstream SDK (@0xbow/privacy-pools-core-sdk 0.1.15, generateMerkleProof)
// for leaves 1000 + 7919*i, proving the LAST leaf. lib/bow/lean-imt.js must reproduce them exactly (one-leaf index NaN there, 0 here).
const { expect } = require("chai");
const M = require("../lib/marginalia");
const { leanRoot, leanProof, depthOf } = require("../lib/bow/lean-imt");
const KAT = require("./fixtures/bow_lean_imt_kat.json");

describe("lib/bow/lean-imt (same tree as the 0xbow SDK)", function () {
  this.timeout(60000);
  let hash2;
  before(async () => { const H = await M.hasher(); hash2 = (a, b) => H([a, b]); });

  for (const n of Object.keys(KAT)) {
    it(`matches the SDK for ${n} leaf/leaves`, () => {
      const leaves = Array.from({ length: Number(n) }, (_, i) => BigInt(1000 + i * 7919));
      const want = KAT[n];
      const p = leanProof(leaves, leaves[leaves.length - 1], hash2);
      expect(p.root.toString()).to.equal(want.root);
      expect(p.siblings.map(String)).to.deep.equal(want.siblings);
      expect(String(p.index)).to.equal(want.index === "NaN" ? "0" : want.index);
      expect(leanRoot(leaves, hash2).root.toString()).to.equal(want.root);
    });
  }

  it("depth is ceil(log2(n)) and an empty tree has root 0", () => {
    expect([0, 1, 2, 3, 4, 5, 8, 9].map(depthOf)).to.deep.equal([0, 0, 1, 2, 2, 3, 3, 4]);
    expect(leanRoot([], hash2).root).to.equal(0n);
  });

  it("rejects a leaf that is not in the tree", () => {
    expect(() => leanProof([1n, 2n], 3n, hash2)).to.throw(/not found/);
  });
});
