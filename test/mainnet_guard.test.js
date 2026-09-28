// MARGINALIA Phase 4 — Guarded Launch & Emergency Drill Test Suite
// Verifies guarded deposit caps, emergency pause guardian, unpausable withdrawals, and telemetry sentinel.

const { expect } = require("chai");
const { ethers } = require("hardhat");
const M = require("../lib/marginalia");
const { SolvencySentinel } = require("../lib/monitoring");

describe("MARGINALIA Phase 4 — Mainnet Guarded Launch & Emergency Drill", function () {
  let owner, magistrate, guardian, alice, bob, relayer;
  let pool, register, h2, h3, verifier, sentinel;
  const ONE = ethers.parseEther("1");

  async function deployAll() {
    [owner, magistrate, guardian, alice, bob, relayer] = await ethers.getSigners();
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

    // Transfer guardian to dedicated guardian signer via 2-step process
    await pool.connect(owner).transferGuardian(guardian.address);
    await pool.connect(guardian).acceptGuardian();

    sentinel = new SolvencySentinel(pool, { largeTxThreshold: ethers.parseEther("5") });
  }

  async function depositFrom(signer, value) {
    const secret = await M.newSecret();
    const tx = await pool.connect(signer).deposit(secret.precommitment, { value });
    const receipt = await tx.wait();
    sentinel.recordDeposit({ args: { value }, transactionHash: tx.hash });
    return M.noteFromDepositReceipt(pool, receipt, secret);
  }

  async function approve(labels) {
    const aspTree = await M.buildAspTree(labels);
    await register.connect(magistrate).publishRoot(aspTree.root(), "ipfs://drill");
    return aspTree;
  }

  beforeEach(deployAll);

  it("enforces guarded deposit cap and rejects deposits exceeding threshold", async function () {
    const cap = ethers.parseEther("2");
    await pool.connect(guardian).setMaxDepositAmount(cap);

    const secret = await M.newSecret();

    // 1 ETH succeeds (below cap)
    await expect(pool.connect(alice).deposit(secret.precommitment, { value: ethers.parseEther("1") })).to.emit(
      pool,
      "Deposited"
    );

    // 3 ETH fails (above cap)
    await expect(
      pool.connect(alice).deposit(secret.precommitment, { value: ethers.parseEther("3") })
    ).to.be.revertedWithCustomError(pool, "ExceedsMaxDeposit");
  });

  it("emergency pause halts new deposits, BUT withdrawals and ragequits remain 100% operational", async function () {
    // 1. Alice deposits 1 ETH before pause
    const noteAlice = await depositFrom(alice, ONE);
    // 2. Bob deposits 1 ETH before pause
    const noteBob = await depositFrom(bob, ONE);

    const aspTree = await approve([noteAlice.label, noteBob.label]);

    // 3. Emergency Trigger: Guardian pauses the pool
    await pool.connect(guardian).setDepositsPaused(true);
    expect(await pool.depositsPaused()).to.be.true;

    // 4. New deposits are immediately blocked
    const freshSecret = await M.newSecret();
    await expect(
      pool.connect(alice).deposit(freshSecret.precommitment, { value: ONE })
    ).to.be.revertedWithCustomError(pool, "DepositsPaused");

    // 5. CRITICAL GUARANTEE: Alice can STILL withdraw privately with ZK proof!
    const stateTree = await M.buildStateTree(pool);
    const w = { recipient: bob.address, relayer: ethers.ZeroAddress, fee: 0n };
    const context = await pool.computeContext(w);
    const { proof } = await M.proveWithdraw({
      note: noteAlice,
      stateTree,
      aspTree,
      withdrawnValue: ONE,
      context,
    });

    await expect(pool.withdraw(w, proof)).to.emit(pool, "Withdrawn");

    // 6. CRITICAL GUARANTEE: Bob can STILL emergency exit (ragequit)!
    await expect(
      pool.connect(bob).ragequit(noteBob.label, noteBob.sk, noteBob.rho, bob.address)
    ).to.emit(pool, "Ragequit");

    // 7. Unpause restores normal operations
    await pool.connect(guardian).setDepositsPaused(false);
    expect(await pool.depositsPaused()).to.be.false;
    await expect(pool.connect(alice).deposit(freshSecret.precommitment, { value: ONE })).to.emit(
      pool,
      "Deposited"
    );
  });

  it("solvency sentinel confirms 100% on-chain accounting parity", async function () {
    await depositFrom(alice, ONE);
    await depositFrom(bob, ONE);

    const audit = await sentinel.verifyOnChainSolvency();
    expect(audit.solvent).to.be.true;
    expect(audit.poolBalance).to.equal(ethers.parseEther("2"));
    expect(audit.anomaliesCount).to.equal(0);
  });
});
