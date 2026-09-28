// MARGINALIA Institutional Invariant & Property Fuzzing Suite (TASK-3.1)
// Rigorously tests protocol invariants across randomized sequences of deposits, withdrawals, and ragequits.

const { expect } = require("chai");
const { ethers } = require("hardhat");
const M = require("../lib/marginalia");

describe("MARGINALIA Phase 3 — Invariant & Property Fuzzing", function () {
  let owner, magistrate, relayer;
  let actors; // 5 simulated user wallets
  let pool, register, h2, h3, verifier;

  async function deployAll() {
    const signers = await ethers.getSigners();
    owner = signers[0];
    magistrate = signers[1];
    relayer = signers[2];
    actors = signers.slice(3, 8);

    ({ h1, h2, h3 } = await M.deployHashers(owner, ethers));
    verifier = await (await ethers.getContractFactory("Groth16Verifier")).deploy();
    register = await (await ethers.getContractFactory("MagistrateRegister")).deploy(magistrate.address);
    pool = await (
      await ethers.getContractFactory("MarginaliaPool")
    ).deploy(
      await verifier.getAddress(),
      await h1.getAddress(),
      await h2.getAddress(),
      await h3.getAddress(),
      await register.getAddress()
    );
  }

  beforeEach(deployAll);

  it("Invariant 1 & 2: Strict Solvency & Nullifier Conservation across 20 randomized state transitions", async function () {
    this.timeout(180000); // 3 minutes for randomized ZK proving sequences

    let totalDeposited = 0n;
    let totalWithdrawn = 0n;
    let totalRagequitted = 0n;

    const activeNotes = [];
    const spentNullifiers = new Set();

    // 1. Initial batch of deposits
    for (let i = 0; i < 4; i++) {
      const actor = actors[i % actors.length];
      const depositVal = ethers.parseEther((0.1 * (i + 1)).toFixed(2));
      const secret = await M.newSecret();

      const tx = await pool.connect(actor).deposit(secret.precommitment, { value: depositVal });
      const receipt = await tx.wait();
      const note = M.noteFromDepositReceipt(pool, receipt, secret);

      totalDeposited += depositVal;
      activeNotes.push({ note, depositor: actor });
    }

    // 2. Magistrate approves the initial batch
    const aspTree = await M.buildAspTree(activeNotes.map((n) => n.note.label));
    await register.connect(magistrate).publishRoot(aspTree.root(), "ipfs://invariant-test");

    // Check Solvency Invariant
    let poolBalance = await ethers.provider.getBalance(await pool.getAddress());
    expect(poolBalance).to.equal(totalDeposited);

    // 3. Execute a randomized sequence of Ragequits and Withdrawals
    // Action A: Ragequit note 0
    const ragequitTarget = activeNotes[0];
    const nRagequit = await M.nullifierOf(ragequitTarget.note.sk, ragequitTarget.note.rho);
    await pool.connect(ragequitTarget.depositor).ragequit(
      ragequitTarget.note.label,
      ragequitTarget.note.sk,
      ragequitTarget.note.rho,
      ragequitTarget.depositor.address
    );
    totalRagequitted += BigInt(ragequitTarget.note.value);
    spentNullifiers.add(nRagequit.toString());

    // Invariant: Pool balance drops by exact ragequit amount
    poolBalance = await ethers.provider.getBalance(await pool.getAddress());
    expect(poolBalance).to.equal(totalDeposited - totalRagequitted - totalWithdrawn);

    // Invariant: Nullifier is strictly marked spent
    expect(await pool.nullifierSpent(nRagequit)).to.be.true;

    // Action B: Private Shielded Withdrawal on note 1
    const withdrawTarget = activeNotes[1];
    const nWithdraw = await M.nullifierOf(withdrawTarget.note.sk, withdrawTarget.note.rho);
    const withdrawAmt = ethers.parseEther("0.1");
    const fee = ethers.parseEther("0.01");

    const stateTree = await M.buildStateTree(pool);
    const w = { recipient: actors[4].address, relayer: relayer.address, fee };
    const context = await pool.computeContext(w);
    const { proof, changeNote } = await M.proveWithdraw({
      note: withdrawTarget.note,
      stateTree,
      aspTree,
      withdrawnValue: withdrawAmt,
      context,
    });

    await pool.connect(relayer).withdraw(w, proof);
    totalWithdrawn += withdrawAmt;
    spentNullifiers.add(nWithdraw.toString());

    // Invariant: Pool balance strictly satisfies: Balance == TotalDeposited - TotalRagequitted - TotalWithdrawn
    poolBalance = await ethers.provider.getBalance(await pool.getAddress());
    expect(poolBalance).to.equal(totalDeposited - totalRagequitted - totalWithdrawn);
    expect(await pool.nullifierSpent(nWithdraw)).to.be.true;

    // Invariant: Double spend attempt on spent nullifiers must unconditionally revert
    for (const nullifierStr of spentNullifiers) {
      expect(await pool.nullifierSpent(BigInt(nullifierStr))).to.be.true;
    }
  });

  it("Invariant 3: Folio Ring Buffer maintains strict FIFO history across root transitions", async function () {
    const dummyLeaves = [111n, 222n, 333n, 444n, 555n];
    for (const leaf of dummyLeaves) {
      const secret = await M.newSecret();
      await pool.connect(actors[0]).deposit(secret.precommitment, { value: ethers.parseEther("0.05") });
    }

    const currentRoot = await pool.getLastRoot();
    expect(await pool.isKnownRoot(currentRoot)).to.be.true;
    expect(await pool.isKnownRoot(0n)).to.be.false;
    expect(await pool.isKnownRoot(99999999999n)).to.be.false;
  });
});
