// Fase 03 / H6-T1: adversarial tests of the deployed contract surface, promoted from an ad-hoc script into CI.
// Every attack must fail with the SPECIFIC error (not just "some revert"), so a regression cannot hide behind another failure.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const M = require("../lib/marginalia");

const ONE = ethers.parseEther("1");

describe("Security: access control, forged proofs, front-running, double exit", function () {
  this.timeout(300000);
  let owner, magistrate, alice, bob, mallory, relayer;
  let pool, register;

  beforeEach(async function () {
    [owner, magistrate, alice, bob, mallory, relayer] = await ethers.getSigners();
    const { h1, h2, h3 } = await M.deployHashers(owner, ethers);
    const verifier = await (await ethers.getContractFactory("Groth16Verifier")).deploy();
    const rq = await (await ethers.getContractFactory("RagequitVerifier")).deploy();
    register = await (await ethers.getContractFactory("MagistrateRegister")).deploy(magistrate.address);
    pool = await (await ethers.getContractFactory("MarginaliaPool")).deploy(
      await verifier.getAddress(), await rq.getAddress(), await h1.getAddress(), await h2.getAddress(), await h3.getAddress(), await register.getAddress()
    );
    await register.setPool(await pool.getAddress(), true);
  });

  async function deposit(signer, value = ONE) {
    const s = await M.newSecret();
    const rc = await (await pool.connect(signer).deposit(s.precommitment, { value })).wait();
    return M.noteFromDepositReceipt(pool, rc, s);
  }
  async function approved(notes) {
    const labels = notes.map((n) => n.label);
    const tree = await M.buildAspTree(labels);
    await register.connect(magistrate).approveLabels(labels);
    await register.connect(magistrate).publishRoot(tree.root(), "ipfs://x");
    return tree;
  }
  const freshProof = async (note, aspTree, w, value = ONE) =>
    M.proveWithdraw({ note, stateTree: await M.buildStateTree(pool), aspTree, withdrawnValue: value, context: await pool.computeContext(w) });
  const clone = (p) => JSON.parse(JSON.stringify(p));

  describe("MagistrateRegister access control", function () {
    it("only the owner can transfer ownership, change the Magistrate, or authorise pools", async function () {
      await expect(register.connect(mallory).transferOwnership(mallory.address)).to.be.revertedWithCustomError(register, "NotOwner");
      await expect(register.connect(mallory).setMagistrate(mallory.address)).to.be.revertedWithCustomError(register, "NotOwner");
      await expect(register.connect(mallory).setPool(mallory.address, true)).to.be.revertedWithCustomError(register, "NotOwner");
      // even the Magistrate cannot touch governance
      await expect(register.connect(magistrate).setMagistrate(magistrate.address)).to.be.revertedWithCustomError(register, "NotOwner");
    });
    it("only the Magistrate can approve labels or publish roots (both overloads); the owner cannot", async function () {
      await expect(register.connect(mallory).approveLabels([1n])).to.be.revertedWithCustomError(register, "NotMagistrate");
      await expect(register.connect(mallory)["publishRoot(uint256,string)"](1n, "x")).to.be.revertedWithCustomError(register, "NotMagistrate");
      await expect(register.connect(mallory)["publishRoot(uint256,string,uint256[])"](1n, "x", [1n])).to.be.revertedWithCustomError(register, "NotMagistrate");
      await expect(register.connect(owner)["publishRoot(uint256,string)"](1n, "x")).to.be.revertedWithCustomError(register, "NotMagistrate");
      await expect(register.connect(magistrate)["publishRoot(uint256,string)"](0n, "x")).to.be.revertedWithCustomError(register, "ZeroRoot");
    });
    it("markRevoked is restricted to the Magistrate and authorised pools", async function () {
      await expect(register.connect(mallory).markRevoked(1n)).to.be.revertedWithCustomError(register, "NotAuthorised");
    });
  });

  describe("MarginaliaPool access control and input checks", function () {
    it("guardian-only functions reject everyone else, including the deployer once guardianship moved", async function () {
      await expect(pool.connect(mallory).setDepositsPaused(true)).to.be.revertedWithCustomError(pool, "NotGuardian");
      await expect(pool.connect(mallory).setMaxDepositAmount(1n)).to.be.revertedWithCustomError(pool, "NotGuardian");
      await expect(pool.connect(mallory).transferGuardian(mallory.address)).to.be.revertedWithCustomError(pool, "NotGuardian");
      await expect(pool.connect(mallory).acceptGuardian()).to.be.revertedWithCustomError(pool, "NotGuardian");
      await pool.transferGuardian(bob.address);
      await expect(pool.connect(mallory).acceptGuardian()).to.be.revertedWithCustomError(pool, "NotGuardian"); // only the proposed one
      await pool.connect(bob).acceptGuardian();
      await expect(pool.connect(owner).setDepositsPaused(true)).to.be.revertedWithCustomError(pool, "NotGuardian");
    });
    it("rejects zero-value deposits, out-of-field precommitments, and plain ETH transfers", async function () {
      const s = await M.newSecret();
      await expect(pool.connect(alice).deposit(s.precommitment, { value: 0 })).to.be.revertedWithCustomError(pool, "InvalidValue");
      await expect(pool.connect(alice).deposit(M.FIELD, { value: 1 })).to.be.revertedWithCustomError(pool, "NotInField");
      await expect(alice.sendTransaction({ to: await pool.getAddress(), value: 1 })).to.be.reverted;
      await pool.connect(alice).deposit(s.precommitment, { value: 1 });
      await expect(pool.connect(alice).deposit(s.precommitment, { value: 1 })).to.be.revertedWithCustomError(pool, "PrecommitmentReused");
    });
    it("pausing stops deposits only: ragequit still works while paused", async function () {
      const note = await deposit(alice);
      await pool.setDepositsPaused(true);
      const s = await M.newSecret();
      await expect(pool.connect(alice).deposit(s.precommitment, { value: 1 })).to.be.revertedWithCustomError(pool, "DepositsPaused");
      const rq = await M.proveRagequit({ note });
      await expect(pool.connect(alice).ragequit(note.label, alice.address, rq.proof)).to.emit(pool, "Ragequit");
    });
    it("the deposit cap is enforced", async function () {
      await pool.setMaxDepositAmount(ethers.parseEther("0.5"));
      const s = await M.newSecret();
      await expect(pool.connect(alice).deposit(s.precommitment, { value: ONE })).to.be.revertedWithCustomError(pool, "ExceedsMaxDeposit");
    });
  });

  describe("Ragequit", function () {
    it("only the original depositor can ragequit, and only once", async function () {
      const note = await deposit(alice);
      const rq = await M.proveRagequit({ note });
      await expect(pool.connect(mallory).ragequit(note.label, mallory.address, rq.proof)).to.be.revertedWithCustomError(pool, "NotOriginalDepositor");
      await expect(pool.connect(alice).ragequit(777n, alice.address, rq.proof)).to.be.revertedWithCustomError(pool, "NotOriginalDepositor");
      await expect(pool.connect(alice).ragequit(note.label, ethers.ZeroAddress, rq.proof)).to.be.revertedWithCustomError(pool, "InvalidValue");
      await pool.connect(alice).ragequit(note.label, alice.address, rq.proof);
      await expect(pool.connect(alice).ragequit(note.label, alice.address, rq.proof)).to.be.revertedWithCustomError(pool, "AlreadyRagequit");
    });
    it("a ragequit proof for someone else's secret does not match the label's precommitment", async function () {
      const a = await deposit(alice);
      const b = await deposit(alice);
      const rqB = await M.proveRagequit({ note: b });
      await expect(pool.connect(alice).ragequit(a.label, alice.address, rqB.proof)).to.be.revertedWithCustomError(pool, "InvalidPrecommitment");
    });
    it("ragequit -> withdraw and withdraw -> ragequit are both impossible (shared nullifier)", async function () {
      const a = await deposit(alice);
      const b = await deposit(alice);
      const tree = await approved([a, b]);
      const w = { recipient: bob.address, relayer: ethers.ZeroAddress, fee: 0n };
      // ragequit a, then try to withdraw it
      await pool.connect(alice).ragequit(a.label, alice.address, (await M.proveRagequit({ note: a })).proof);
      const pa = await freshProof(a, tree, w);
      await expect(pool.connect(alice).withdraw(w, pa.proof)).to.be.revertedWithCustomError(pool, "NullifierAlreadySpent");
      // withdraw b, then try to ragequit it
      const pb = await freshProof(b, tree, w);
      await pool.connect(alice).withdraw(w, pb.proof);
      await expect(pool.connect(alice).ragequit(b.label, alice.address, (await M.proveRagequit({ note: b })).proof)).to.be.revertedWithCustomError(pool, "NullifierAlreadySpent");
    });
  });

  describe("Withdraw: forged and malleated proofs", function () {
    let note, tree, w, good;
    beforeEach(async function () {
      note = await deposit(alice);
      await deposit(bob);
      tree = await approved([note]);
      w = { recipient: bob.address, relayer: ethers.ZeroAddress, fee: 0n };
      good = (await freshProof(note, tree, w, ethers.parseEther("0.5"))).proof;
    });
    const mutate = (p, i, v) => { const c = clone(p); c.pubSignals[i] = v.toString(); return c; };

    it("control: the honest proof is accepted", async function () {
      await expect(pool.connect(mallory).withdraw(w, good)).to.emit(pool, "Withdrawn");
    });
    it("inflating the withdrawn value invalidates the proof", async function () {
      await expect(pool.withdraw(w, mutate(good, 0, ONE * 10n))).to.be.revertedWithCustomError(pool, "InvalidProof");
    });
    it("an unknown state root and an unpublished ASP root are rejected", async function () {
      await expect(pool.withdraw(w, mutate(good, 1, 12345n))).to.be.revertedWithCustomError(pool, "UnknownStateRoot");
      await expect(pool.withdraw(w, mutate(good, 2, 12345n))).to.be.revertedWithCustomError(pool, "StaleAspRoot");
    });
    it("a proof is bound to recipient, relayer and fee: front-running cannot redirect or tip", async function () {
      await expect(pool.withdraw({ ...w, recipient: mallory.address }, good)).to.be.revertedWithCustomError(pool, "InvalidContext");
      await expect(pool.withdraw({ recipient: bob.address, relayer: mallory.address, fee: 1n }, good)).to.be.revertedWithCustomError(pool, "InvalidContext");
      await expect(pool.withdraw(w, mutate(good, 3, 1n))).to.be.revertedWithCustomError(pool, "InvalidContext");
    });
    it("swapping the nullifier or the new commitment invalidates the proof", async function () {
      await expect(pool.withdraw(w, mutate(good, 4, 1n))).to.be.revertedWithCustomError(pool, "InvalidProof");
      await expect(pool.withdraw(w, mutate(good, 5, 1n))).to.be.revertedWithCustomError(pool, "InvalidProof");
    });
    it("public signals outside the field are rejected (no malleability by adding the modulus)", async function () {
      await expect(pool.withdraw(w, mutate(good, 0, BigInt(good.pubSignals[0]) + M.FIELD))).to.be.revertedWithCustomError(pool, "NotInField");
    });
    it("corrupted / negated / all-zero curve points are rejected", async function () {
      const a = clone(good); a.pA[0] = (BigInt(a.pA[0]) + 1n).toString();
      await expect(pool.withdraw(w, a)).to.be.reverted;
      const c = clone(good); c.pC[1] = (M.FIELD - BigInt(c.pC[1])).toString();
      await expect(pool.withdraw(w, c)).to.be.revertedWithCustomError(pool, "InvalidProof");
      const z = { pA: [0, 0], pB: [[0, 0], [0, 0]], pC: [0, 0], pubSignals: clone(good).pubSignals };
      await expect(pool.withdraw(w, z)).to.be.reverted;
    });
    it("zero recipient, and a fee without a relayer, are rejected", async function () {
      await expect(pool.withdraw({ ...w, recipient: ethers.ZeroAddress }, good)).to.be.revertedWithCustomError(pool, "InvalidValue");
      await expect(pool.withdraw({ recipient: bob.address, relayer: ethers.ZeroAddress, fee: 1n }, good)).to.be.revertedWithCustomError(pool, "FeeTooHigh");
    });
    it("a spent nullifier cannot be reused, even with a freshly generated valid proof", async function () {
      await pool.withdraw(w, good);
      const again = (await freshProof(note, tree, w, ethers.parseEther("0.1"))).proof;
      await expect(pool.withdraw(w, again)).to.be.revertedWithCustomError(pool, "NullifierAlreadySpent");
    });
    it("a proof made for another pool/chain context is useless here", async function () {
      const other = BigInt(ethers.solidityPackedKeccak256(["uint256", "address", "address"], [1, await pool.getAddress(), bob.address])) % M.FIELD;
      const p = await M.proveWithdraw({ note, stateTree: await M.buildStateTree(pool), aspTree: tree, withdrawnValue: ONE, context: other });
      await expect(pool.withdraw(w, p.proof)).to.be.revertedWithCustomError(pool, "InvalidContext");
    });
  });

  describe("Circuit soundness (a cheating prover cannot even build a proof)", function () {
    it("wrong secret, inflated value, and unapproved labels cannot be proven", async function () {
      const note = await deposit(alice);
      const other = await deposit(bob); // never approved
      const tree = await approved([note]);
      const stateTree = await M.buildStateTree(pool);
      const base = { stateTree, aspTree: tree, withdrawnValue: 1n, context: 1n };
      const fails = async (n) => { try { await M.proveWithdraw({ ...base, note: n }); return false; } catch (_) { return true; } };
      expect(await fails({ ...note, sk: note.sk + 1n })).to.equal(true);
      expect(await fails({ ...note, value: note.value + 1n })).to.equal(true);
      expect(await fails(other)).to.equal(true);
      let msg = ""; try { await M.proveWithdraw({ ...base, note, withdrawnValue: note.value + 1n }); } catch (e) { msg = e.message; }
      expect(msg).to.match(/exceeds note value/);
    });
  });
});
