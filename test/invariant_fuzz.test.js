// Fase 04 / A-TEST3: seeded stateful fuzzing of the pool with a shadow model. Random sequences of deposits, approvals,
// partial/full withdrawals (with real proofs), ragequits and ATTACKS; after EVERY step the invariants are re-checked:
//   I1  pool ETH balance == deposits - withdrawn - ragequit        (no value is created or lost)
//   I2  every nullifier works exactly once                          (replays revert)
//   I3  a note can leave by exactly one door                        (withdraw XOR ragequit)
//   I4  Folio root rebuilt from events == on-chain root; nextIndex == deposits + withdrawals
// Echidna/Foundry would run millions of steps; this is the in-repo smoke version (a few hundred real proofs per CI run).
const { expect } = require("chai");
const { ethers } = require("hardhat");
const M = require("../lib/marginalia");

function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

describe("Stateful invariant fuzzing (shadow model)", function () {
  this.timeout(1_800_000);
  const SEEDS = (process.env.FUZZ_SEEDS || "1,2,3").split(",").map(Number);
  const STEPS = Number(process.env.FUZZ_STEPS || 28);

  for (const seed of SEEDS) {
    it(`seed ${seed}: ${STEPS} random steps keep every invariant`, async function () {
      const R = rng(seed);
      const pick = (arr) => arr[Math.floor(R() * arr.length)];
      const signers = await ethers.getSigners();
      const [owner, magistrate, relayer, ...users] = signers;
      const { h1, h2, h3 } = await M.deployHashers(owner, ethers);
      const verifier = await (await ethers.getContractFactory("Groth16Verifier")).deploy();
      const rq = await (await ethers.getContractFactory("RagequitVerifier")).deploy();
      const register = await (await ethers.getContractFactory("MagistrateRegister")).deploy(magistrate.address);
      const pool = await (await ethers.getContractFactory("MarginaliaPool")).deploy(
        await verifier.getAddress(), await rq.getAddress(), await h1.getAddress(), await h2.getAddress(), await h3.getAddress(), await register.getAddress());
      await register.setPool(await pool.getAddress(), true);
      const poolAddr = await pool.getAddress();

      const model = { deposited: 0n, withdrawn: 0n, ragequit: 0n, deposits: 0, withdrawals: 0 };
      const notes = []; // { note, depositor, spent: bool, how, root: true if it is the ORIGINAL deposit (can ragequit) }
      const log = [];
      let aspLabels = [];
      let aspTree = null;

      async function publishAll() {
        const labels = [...new Set(notes.map((n) => n.note.label.toString()))].map(BigInt);
        if (labels.length === aspLabels.length) return;
        aspLabels = labels;
        aspTree = await M.buildAspTree(labels);
        await register.connect(magistrate).approveLabels(labels);
        await register.connect(magistrate)["publishRoot(uint256,string)"](aspTree.root(), "ipfs://fuzz");
      }
      async function checkInvariants(step) {
        const bal = await ethers.provider.getBalance(poolAddr);
        expect(bal, `I1 at step ${step} (${log[log.length - 1]})`).to.equal(model.deposited - model.withdrawn - model.ragequit);
        expect(Number(await pool.nextIndex()), `I4 nextIndex at step ${step}`).to.equal(model.deposits + model.withdrawals);
        if (step % 6 === 0) expect((await M.buildStateTree(pool)).root(), `I4 root at step ${step}`).to.equal(await pool.getLastRoot());
      }

      for (let step = 1; step <= STEPS; step++) {
        const unspent = notes.filter((n) => !n.spent);
        const r = R();
        if (unspent.length === 0 || r < 0.3) {
          // ---- deposit
          const depositor = pick(users);
          const value = BigInt(1 + Math.floor(R() * 1000)) * 10n ** 12n;
          const s = await M.newSecret();
          const rc = await (await pool.connect(depositor).deposit(s.precommitment, { value })).wait();
          const note = M.noteFromDepositReceipt(pool, rc, s);
          notes.push({ note, depositor, spent: false, original: true });
          model.deposited += value; model.deposits++;
          log.push(`deposit ${value}`);
        } else if (r < 0.65) {
          // ---- withdraw (partial or full, optional relayer fee)
          await publishAll();
          const n = pick(unspent);
          const amount = R() < 0.4 ? n.note.value : BigInt(1 + Math.floor(R() * Number(n.note.value / 10n ** 6n))) * 10n ** 6n;
          const w0 = amount > n.note.value ? n.note.value : amount;
          const fee = R() < 0.4 && w0 > 1000n ? w0 / 10n : 0n;
          const w = { recipient: pick(users).address, relayer: fee ? relayer.address : ethers.ZeroAddress, fee };
          const stateTree = await M.buildStateTree(pool);
          const { proof, changeNote } = await M.proveWithdraw({ note: n.note, stateTree, aspTree, withdrawnValue: w0, context: await pool.computeContext(w) });
          await (await pool.connect(pick(users)).withdraw(w, proof)).wait();
          n.spent = true; n.how = "withdraw";
          model.withdrawn += w0; model.withdrawals++;
          notes.push({ note: changeNote, depositor: n.depositor, spent: changeNote.value === 0n, how: changeNote.value === 0n ? "dust" : undefined, original: false });
          log.push(`withdraw ${w0} fee ${fee}`);
          // I2: the SAME proof can never be replayed
          await expect(pool.connect(owner).withdraw(w, proof)).to.be.revertedWithCustomError(pool, "NullifierAlreadySpent");
          // I3: the original deposit can no longer be ragequit
          if (n.original) {
            const rqp = (await M.proveRagequit({ note: n.note })).proof;
            await expect(pool.connect(n.depositor).ragequit(n.note.label, n.depositor.address, rqp)).to.be.revertedWithCustomError(pool, "NullifierAlreadySpent");
          }
        } else if (r < 0.85) {
          // ---- ragequit an original, untouched deposit
          const cand = unspent.filter((n) => n.original);
          if (cand.length === 0) { step--; continue; }
          const n = pick(cand);
          const rqp = (await M.proveRagequit({ note: n.note })).proof;
          // attack first: someone else cannot exit it
          await expect(pool.connect(owner).ragequit(n.note.label, owner.address, rqp)).to.be.revertedWithCustomError(pool, "NotOriginalDepositor");
          await (await pool.connect(n.depositor).ragequit(n.note.label, n.depositor.address, rqp)).wait();
          n.spent = true; n.how = "ragequit";
          model.ragequit += n.note.value;
          log.push(`ragequit ${n.note.value}`);
          // I3: it can no longer be withdrawn, even though its label is approved
          await publishAll();
          const w = { recipient: owner.address, relayer: ethers.ZeroAddress, fee: 0n };
          const { proof } = await M.proveWithdraw({ note: n.note, stateTree: await M.buildStateTree(pool), aspTree, withdrawnValue: 1n, context: await pool.computeContext(w) });
          await expect(pool.connect(owner).withdraw(w, proof)).to.be.revertedWithCustomError(pool, "NullifierAlreadySpent");
          await expect(pool.connect(n.depositor).ragequit(n.note.label, n.depositor.address, rqp)).to.be.revertedWithCustomError(pool, "AlreadyRagequit");
        } else {
          // ---- pure attack steps that must not change any balance
          const n = pick(notes);
          const rqp = (await M.proveRagequit({ note: n.note })).proof;
          if (n.original) await expect(pool.connect(owner).ragequit(n.note.label, owner.address, rqp)).to.be.reverted;
          const s = await M.newSecret();
          await expect(pool.connect(pick(users)).deposit(s.precommitment, { value: 0 })).to.be.revertedWithCustomError(pool, "InvalidValue");
          log.push("attack (no-op)");
        }
        await checkInvariants(step);
      }

      // final accounting: everything still in the pool belongs to unspent notes
      const owed = notes.filter((n) => !n.spent).reduce((a, n) => a + n.note.value, 0n);
      expect(await ethers.provider.getBalance(poolAddr), "pool holds exactly the unspent notes").to.equal(owed);
      console.log(`      seed ${seed}: ${STEPS} steps, ${model.deposits} deposits, ${model.withdrawals} withdrawals, ${notes.filter((n) => n.how === "ragequit").length} ragequits; pool holds ${owed} wei = unspent notes`);
    });
  }
});
