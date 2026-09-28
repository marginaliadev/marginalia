const { expect } = require("chai");
const { ethers } = require("hardhat");
const M = require("../lib/marginalia");
const { FolioIndexer } = require("../lib/indexer");

describe("MARGINALIA Folio Event Indexer (Mitigation for L11)", function () {
  let owner, magistrate, alice, bob;
  let pool, register, h2, h3, verifier;
  const ONE = ethers.parseEther("1");

  async function deployAll() {
    [owner, magistrate, alice, bob] = await ethers.getSigners();
    ({ h1, h2, h3 } = await M.deployHashers(owner, ethers));
    verifier = await (await ethers.getContractFactory("Groth16Verifier")).deploy();
    register = await (await ethers.getContractFactory("MagistrateRegister")).deploy(magistrate.address);
    pool = await (
      await ethers.getContractFactory("MarginaliaPool")
    ).deploy(
      await verifier.getAddress(),
      await (await (await ethers.getContractFactory("RagequitVerifier")).deploy()).getAddress(),
      await h1.getAddress(),
      await h2.getAddress(),
      await h3.getAddress(),
      await register.getAddress()
    );
    await register.setPool(await pool.getAddress(), true);
  }

  beforeEach(deployAll);

  it("syncs empty tree and matches on-chain empty root", async function () {
    const indexer = new FolioIndexer(pool, { startBlock: 0, chunkSize: 10 });
    await indexer.sync();

    const onChainRoot = await pool.getLastRoot();
    expect(indexer.getLatestRoot()).to.equal(onChainRoot);
    expect(indexer.getLeavesCount()).to.equal(0);
  });

  it("syncs multiple deposits in small chunks and maintains 100% root parity", async function () {
    const indexer = new FolioIndexer(pool, { startBlock: 0, chunkSize: 2 }); // Small chunk size to test batching

    const notes = [];
    for (let i = 0; i < 5; i++) {
      const secret = await M.newSecret();
      const tx = await pool.connect(alice).deposit(secret.precommitment, { value: ONE });
      const receipt = await tx.wait();
      notes.push(M.noteFromDepositReceipt(pool, receipt, secret));
    }

    await indexer.sync();

    const onChainRoot = await pool.getLastRoot();
    expect(indexer.getLatestRoot()).to.equal(onChainRoot);
    expect(indexer.getLeavesCount()).to.equal(5);
    expect(indexer.deposits.length).to.equal(5);
  });

  it("generates correct Merkle path witness for private withdrawal", async function () {
    const indexer = new FolioIndexer(pool, { startBlock: 0, chunkSize: 50 });

    const secret = await M.newSecret();
    const tx = await pool.connect(alice).deposit(secret.precommitment, { value: ONE });
    const receipt = await tx.wait();
    const note = M.noteFromDepositReceipt(pool, receipt, secret);

    await indexer.sync();

    const indexerWitness = indexer.getWitness(0);
    const manualTree = await M.buildStateTree(pool);
    const manualWitness = manualTree.path(0);

    expect(indexerWitness.path).to.deep.equal(manualWitness.path);
    expect(indexerWitness.indices).to.deep.equal(manualWitness.indices);
  });
});
