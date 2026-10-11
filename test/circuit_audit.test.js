// Fase 04 / B-TEST1..3: internal adversarial review of the circuits, run against the DEPLOYED witness generators
// (build/withdraw_js, build/ragequit_js). The witness calculator evaluates every constraint, so a mutated input that still
// produces a witness means the circuit would let a cheating prover through. Nothing here needs a proving key.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { expect } = require("chai");
const snarkjs = require("snarkjs");
const M = require("../lib/marginalia");

const ROOT = path.join(__dirname, "..");
const WASM = path.join(ROOT, "build", "withdraw_js", "withdraw.wasm");
const RQ_WASM = path.join(ROOT, "build", "ragequit_js", "ragequit.wasm");
const F = M.FIELD;
const tmp = path.join(os.tmpdir(), "circuit-audit.wtns");

const str = (o) => JSON.parse(JSON.stringify(o, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
/** true when the circuit ACCEPTS the input (a witness exists), false when a constraint rejects it */
async function accepts(wasm, input) {
  try { await snarkjs.wtns.calculate(str(input), wasm, tmp); return true; } catch (_) { return false; }
}
const clone = (o) => JSON.parse(JSON.stringify(o));

describe("Fase 04 / B: circuit audit (withdraw + ragequit)", function () {
  this.timeout(600000);
  let H, input, note, stateTree, aspTree, built;

  before(async function () {
    H = await M.hasher();
    const sk = M.randomField(), rho = M.randomField(), value = 10n ** 18n, label = M.randomField();
    const pre = H([H([sk]), rho]);
    const commitment = H([value, label, pre]);
    note = { sk, rho, value, label, commitment };
    stateTree = new M.MerkleTree(M.DEPTH, H, [M.randomField(), M.randomField(), commitment, M.randomField(), M.randomField()]);
    aspTree = new M.MerkleTree(M.ASP_DEPTH, H, [M.randomField(), label, M.randomField()]);
    built = await M.buildWithdrawInput({ note, stateTree, aspTree, withdrawnValue: 3n * 10n ** 17n, context: 777n });
    input = str(built.input);
  });

  it("control: the honest input is accepted", async function () {
    expect(await accepts(WASM, input)).to.equal(true);
  });

  describe("B-TEST1 withdraw: changing ANY single input is rejected (except the documented one)", function () {
    // `context` is only squared inside the circuit: the witness exists for every value. It is bound to the transaction
    // (recipient, relayer, fee) by MarginaliaPool.computeContext + the Groth16 public-input check, which security_onchain.test.js attacks.
    const UNCONSTRAINED_AT_WITNESS_LEVEL = new Set(["context"]);
    const scalars = ["withdrawnValue", "stateRoot", "aspRoot", "context", "nullifierHash", "newCommitment", "sk", "value", "label", "rho", "newRho"];
    const arrays = ["statePathElements", "statePathIndices", "aspPathElements", "aspPathIndices"];

    for (const key of scalars) {
      it(`${key}: +1, 0 and FIELD-1 ${UNCONSTRAINED_AT_WITNESS_LEVEL.has(key) ? "are accepted by design (see comment)" : "are all rejected"}`, async function () {
        const results = [];
        for (const v of [(BigInt(input[key]) + 1n) % F, 0n, F - 1n]) {
          const m = clone(input); m[key] = v.toString();
          results.push(await accepts(WASM, m));
        }
        if (UNCONSTRAINED_AT_WITNESS_LEVEL.has(key)) expect(results).to.deep.equal([true, true, true]);
        else expect(results, `mutating ${key}`).to.deep.equal([false, false, false]);
      });
    }

    for (const key of arrays) {
      it(`${key}: every one of the 20 entries, mutated one at a time, is rejected`, async function () {
        const bad = [];
        for (let i = 0; i < 20; i++) {
          const m = clone(input);
          m[key][i] = key.endsWith("Indices") ? (m[key][i] === 0 || m[key][i] === "0" ? "1" : "0") : ((BigInt(m[key][i]) + 1n) % F).toString();
          if (await accepts(WASM, m)) bad.push(i);
        }
        expect(bad, `${key} entries accepted after mutation: ${bad}`).to.deep.equal([]);
      });
    }
  });

  describe("B-TEST3 targeted attacks on the withdraw circuit", function () {
    it("path indices must be bits: 2, -1 and a huge value are rejected", async function () {
      for (const v of ["2", (F - 1n).toString(), "1000000"]) {
        for (const key of ["statePathIndices", "aspPathIndices"]) {
          const m = clone(input); m[key][0] = v;
          expect(await accepts(WASM, m), `${key}[0]=${v}`).to.equal(false);
        }
      }
    });
    it("cannot withdraw more than the note holds (remaining would be negative = out of 128 bits)", async function () {
      const m = clone(input); m.withdrawnValue = (note.value + 1n).toString();
      expect(await accepts(WASM, m)).to.equal(false);
    });
    it("cannot overflow the 128-bit range: withdrawnValue = 2^128 or value near the field order", async function () {
      const a = clone(input); a.withdrawnValue = (1n << 128n).toString();
      expect(await accepts(WASM, a)).to.equal(false);
      const b = clone(input); b.withdrawnValue = (F - 5n).toString();
      expect(await accepts(WASM, b)).to.equal(false);
    });
    it("withdrawing exactly the whole note (remaining = 0) and a 1-wei withdrawal are both valid", async function () {
      for (const w of [note.value, 1n]) {
        const b = await M.buildWithdrawInput({ note, stateTree, aspTree, withdrawnValue: w, context: 1n });
        expect(await accepts(WASM, str(b.input)), `withdraw ${w}`).to.equal(true);
      }
    });
    it("a leaf from ANOTHER tree position / another label set cannot be proven (swap the two trees' paths)", async function () {
      const m = clone(input);
      m.statePathElements = input.aspPathElements; m.statePathIndices = input.aspPathIndices;
      expect(await accepts(WASM, m)).to.equal(false);
    });
    it("the nullifier is bound to (sk, rho): a different rho with a matching nullifier but the old commitment is rejected", async function () {
      const rho2 = M.randomField();
      const m = clone(input); m.rho = rho2.toString(); m.nullifierHash = H([note.sk, rho2]).toString();
      expect(await accepts(WASM, m)).to.equal(false); // commitment (in the tree) was built with the original rho
    });
    it("two different notes of one owner yield different nullifiers; a change note never reuses the spent nullifier", async function () {
      expect(built.changeNote.rho).to.not.equal(note.rho);
      expect(H([built.changeNote.sk, built.changeNote.rho])).to.not.equal(built.nullifierHash);
    });
  });

  describe("B-TEST2 differential: circuit public outputs equal the JS reference on random notes", function () {
    it("40 random notes / values: witness exists and its public signals equal the reference computation", async function () {
      for (let i = 0; i < 40; i++) {
        const sk = M.randomField(), rho = M.randomField();
        const value = BigInt("0x" + require("crypto").randomBytes(12).toString("hex")) + 1n; // up to ~2^96
        const label = M.randomField();
        const commitment = H([value, label, H([H([sk]), rho])]);
        const filler = Array.from({ length: i % 7 }, () => M.randomField());
        const st = new M.MerkleTree(M.DEPTH, H, [...filler, commitment]);
        const at = new M.MerkleTree(M.ASP_DEPTH, H, [label]);
        const w = value / BigInt(1 + (i % 5));
        const b = await M.buildWithdrawInput({ note: { sk, rho, value, label, commitment }, stateTree: st, aspTree: at, withdrawnValue: w, context: BigInt(i) });
        await snarkjs.wtns.calculate(str(b.input), WASM, tmp); // throws if any constraint fails
        const wtns = await snarkjs.wtns.exportJson(tmp);
        // public signals are wires 1..6 in declaration order
        const pub = wtns.slice(1, 7).map(String);
        expect(pub).to.deep.equal([w, st.root(), at.root(), BigInt(i), H([sk, rho]), b.changeNote.commitment].map(String));
      }
    });
  });

  describe("B-TEST1/3 ragequit circuit", function () {
    let rq;
    before(function () {
      const sk = M.randomField(), rho = M.randomField();
      rq = { precommitment: H([H([sk]), rho]).toString(), nullifierHash: H([sk, rho]).toString(), sk: sk.toString(), rho: rho.toString() };
    });
    it("control: honest input accepted", async function () { expect(await accepts(RQ_WASM, rq)).to.equal(true); });
    for (const key of ["precommitment", "nullifierHash", "sk", "rho"]) {
      it(`${key}: +1, 0, FIELD-1 are all rejected`, async function () {
        for (const v of [(BigInt(rq[key]) + 1n) % F, 0n, F - 1n]) {
          expect(await accepts(RQ_WASM, { ...rq, [key]: v.toString() }), `${key}=${v}`).to.equal(false);
        }
      });
    }
    it("the ragequit nullifier equals the withdraw nullifier of the same note (the one-exit-only invariant)", async function () {
      const nul = H([BigInt(rq.sk), BigInt(rq.rho)]).toString();
      expect(rq.nullifierHash).to.equal(nul);
    });
    it("a ragequit proof input leaks nothing beyond the two public values (sk and rho are private)", function () {
      const vk = JSON.parse(fs.readFileSync(path.join(ROOT, "build", "ragequit_verification_key.json"), "utf8"));
      expect(vk.nPublic).to.equal(2);
    });
  });
});
