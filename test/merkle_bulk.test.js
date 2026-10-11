// The bulk Merkle build must be indistinguishable from inserting leaf by leaf (roots AND authentication paths),
// because the on-chain tree is built by insertion and proofs are checked against it.
const { expect } = require("chai");
const M = require("../lib/marginalia");

describe("MerkleTree bulk build == incremental insert", function () {
  this.timeout(120000);
  for (const n of [0, 1, 2, 3, 4, 5, 7, 8, 9, 31, 33, 100]) {
    it(`n=${n}: same root and same paths for every leaf`, async function () {
      const H = await M.hasher();
      const leaves = Array.from({ length: n }, (_, i) => BigInt(i + 1) * 7919n);
      const bulk = new M.MerkleTree(M.DEPTH, H, leaves);
      const inc = new M.MerkleTree(M.DEPTH, H, []);
      for (const l of leaves) inc.insert(l);
      expect(bulk.root()).to.equal(inc.root());
      for (let i = 0; i < n; i++) {
        const a = bulk.path(i), b = inc.path(i);
        expect(a.pathElements).to.deep.equal(b.pathElements);
        expect(a.pathIndices).to.deep.equal(b.pathIndices);
      }
    });
  }
  it("a tree built in bulk can still be extended with insert() and stays consistent", async function () {
    const H = await M.hasher();
    const leaves = Array.from({ length: 13 }, (_, i) => BigInt(i + 1) * 104729n);
    const t = new M.MerkleTree(M.DEPTH, H, leaves);
    t.insert(555n);
    const ref = new M.MerkleTree(M.DEPTH, H, []);
    for (const l of [...leaves, 555n]) ref.insert(l);
    expect(t.root()).to.equal(ref.root());
  });
});
