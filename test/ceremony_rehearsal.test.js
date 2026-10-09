// Fase 04 / D-T3: a complete DRESS REHEARSAL of the Phase-2 ceremony on the real ragequit circuit, plus attack tests on the
// verification tooling. Uses a throw-away DEV Powers of Tau (power 12): this proves the plumbing and the checks, not the
// security of a real setup. Production uses the public Hermez/PSE ptau and independent contributors.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const snarkjs = require("snarkjs");
const solc = require("solc");
const M = require("../lib/marginalia");
const C = require("../scripts/ceremony/lib");
const { compileCircuit } = require("../scripts/ceremony/compile");

const ROOT = path.join(__dirname, "..");
const BEACON = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20"; // stand-in for a pre-announced drand round
const NAMES = ["Alice", "Bob", "Carol", "Dave", "Erin"];

async function devPtau() {
  const dir = path.join(os.tmpdir(), "marginalia-ceremony-cache");
  fs.mkdirSync(dir, { recursive: true });
  const final = path.join(dir, "dev-ptau-12.ptau");
  if (fs.existsSync(final)) return final;
  const { logger } = C.capture();
  const curve = await snarkjs.curves.getCurveFromName("bn128");
  await snarkjs.powersOfTau.newAccumulator(curve, 12, path.join(dir, "p0.ptau"), logger);
  await snarkjs.powersOfTau.contribute(path.join(dir, "p0.ptau"), path.join(dir, "p1.ptau"), "dev", "rehearsal-entropy-" + Date.now(), logger);
  await snarkjs.powersOfTau.preparePhase2(path.join(dir, "p1.ptau"), final, logger);
  return final;
}

function compileVerifier(source, name) {
  const out = JSON.parse(solc.compile(JSON.stringify({
    language: "Solidity", sources: { "V.sol": { content: source } },
    settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
  })));
  const errs = (out.errors || []).filter((e) => e.severity === "error");
  if (errs.length) throw new Error(errs.map((e) => e.formattedMessage).join("\n"));
  const c = out.contracts["V.sol"][name];
  return { abi: c.abi, bytecode: "0x" + c.evm.bytecode.object };
}

async function proveWith(zkey, note) {
  const H = await M.hasher();
  const pre = H([H([note.sk]), note.rho]);
  const nul = H([note.sk, note.rho]);
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    { precommitment: pre.toString(), nullifierHash: nul.toString(), sk: note.sk.toString(), rho: note.rho.toString() },
    path.join(ROOT, "build", "ragequit_js", "ragequit.wasm"), zkey);
  return [
    [proof.pi_a[0], proof.pi_a[1]],
    [[proof.pi_b[0][1], proof.pi_b[0][0]], [proof.pi_b[1][1], proof.pi_b[1][0]]],
    [proof.pi_c[0], proof.pi_c[1]],
    publicSignals,
  ];
}

describe("Fase 04 / D: Phase-2 ceremony rehearsal (ragequit circuit)", function () {
  this.timeout(900000);
  let dir, r1cs, ptau;
  const files = []; // 0000..0005, then beacon
  const rounds = [];
  let beacon, finalZkey, fin, transcript;

  before(async function () {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ceremony-rehearsal-"));
    ({ r1cs } = compileCircuit("ragequit"));
    ptau = await devPtau();

    const z0 = path.join(dir, "ragequit_0000.zkey");
    await C.init({ r1cs, ptau, out: z0 });
    files.push(z0);
    for (let i = 0; i < NAMES.length; i++) {
      const out = path.join(dir, `ragequit_${String(i + 1).padStart(4, "0")}.zkey`);
      const r = await C.contribute({ inZkey: files[files.length - 1], outZkey: out, name: NAMES[i], entropy: `secret-${NAMES[i]}-${Math.random()}` });
      files.push(out);
      rounds.push({ contributor: NAMES[i], file: out, contributionHash: r.contributionHash, attestation: `https://example.org/attestation/${NAMES[i]}` });
    }
    finalZkey = path.join(dir, "ragequit_final.zkey");
    beacon = await C.applyBeacon({ inZkey: files[files.length - 1], outZkey: finalZkey, beaconHashHex: BEACON, iterationsExp: 10 });
    fin = await C.finalize({ zkey: finalZkey, outDir: path.join(dir, "out"), circuit: "ragequit", contractName: "RagequitVerifier" });
    fin.contractName = "RagequitVerifier";
    transcript = await C.buildTranscript({
      circuit: "ragequit", r1cs, ptau, ptauSource: "DEV ptau generated for the rehearsal (NOT for production)", rounds,
      beacon: { hash: BEACON, source: "fixed test value standing in for a drand round", iterationsExp: 10, contributionHash: beacon.contributionHash },
      finalZkey, finalization: fin,
    });
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("D-TEST1a honest chain: every step adds exactly one contribution and keeps the history", async function () {
    const r = await C.verifyChain({ r1cs, ptau, files: [...files, finalZkey] });
    expect(r.ok, JSON.stringify(r.reports.filter((x) => !x.ok))).to.equal(true);
    expect(r.reports.map((x) => x.contributions)).to.deep.equal([0, 1, 2, 3, 4, 5, 6]);
  });

  it("D-TEST1b a single flipped byte in any contribution is detected", async function () {
    const bad = path.join(dir, "tampered.zkey");
    const buf = Buffer.from(fs.readFileSync(files[3]));
    buf[Math.floor(buf.length * 0.6)] ^= 0x01;
    fs.writeFileSync(bad, buf);
    const r = await C.verifyChain({ r1cs, ptau, files: [files[0], files[1], files[2], bad] }).catch((e) => ({ ok: false, error: e.message }));
    expect(r.ok).to.equal(false);
  });

  it("D-TEST1c skipping a contribution, or presenting a forked history, is detected", async function () {
    const skip = await C.verifyChain({ r1cs, ptau, files: [files[0], files[1], files[3]] });
    expect(skip.ok).to.equal(false);
    expect(skip.reports[2].problems.join(" ")).to.match(/expected 2 contributions/);
    // a rival branch: contributes on top of #1 but claims to follow #2
    const fork = path.join(dir, "fork.zkey");
    await C.contribute({ inZkey: files[1], outZkey: fork, name: "Mallory", entropy: "evil" });
    const forked = await C.verifyChain({ r1cs, ptau, files: [files[0], files[1], files[2], fork] });
    expect(forked.ok).to.equal(false);
    expect(forked.reports[3].problems.join(" ")).to.match(/history rewritten/);
  });

  it("D-TEST1d a zkey for a DIFFERENT circuit cannot be passed off as this one", async function () {
    const other = path.join(ROOT, "build", "withdraw_final.zkey");
    let rejected = false;
    try { const r = await C.inspect({ r1cs, ptau, zkey: other }); rejected = !r.ok; } catch (_) { rejected = true; }
    expect(rejected).to.equal(true);
  });

  it("D-TEST2 beacon: deterministic for the same value, different for another, and it must be the LAST contribution", async function () {
    const again = path.join(dir, "beacon2.zkey");
    const other = path.join(dir, "beacon3.zkey");
    await C.applyBeacon({ inZkey: files[files.length - 1], outZkey: again, beaconHashHex: BEACON, iterationsExp: 10 });
    await C.applyBeacon({ inZkey: files[files.length - 1], outZkey: other, beaconHashHex: "ff".repeat(32), iterationsExp: 10 });
    expect(await C.hashFile(again)).to.equal(await C.hashFile(finalZkey));
    expect(await C.hashFile(other)).to.not.equal(await C.hashFile(finalZkey));
    let msg = ""; try { await C.applyBeacon({ inZkey: files[0], outZkey: path.join(dir, "x.zkey"), beaconHashHex: "zz" }); } catch (e) { msg = e.message; }
    expect(msg).to.match(/hex string/);
  });

  it("D-TEST3a the public verifier accepts the honest transcript from public files only", async function () {
    const r = await C.verifyTranscript(transcript, { r1cs, ptau, zkey: finalZkey, verifierSol: fin.solFile, minContributors: 5 });
    expect(r.ok, JSON.stringify(r.checks.filter((c) => !c.ok))).to.equal(true);
    expect(r.checks.length).to.be.greaterThan(10);
  });

  describe("D-TEST3b the public verifier rejects every kind of forgery", function () {
    const cloneT = () => JSON.parse(JSON.stringify(transcript));
    const run = (t, over = {}) => C.verifyTranscript(t, { r1cs, ptau, zkey: finalZkey, minContributors: 5, ...over });
    const failing = (r) => r.checks.filter((c) => !c.ok).map((c) => c.name).join(" | ");

    it("an announced contribution that is not in the zkey", async function () {
      const t = cloneT(); t.rounds[2].contributionHash = "00".repeat(8) + t.rounds[2].contributionHash.slice(16);
      const r = await run(t); expect(r.ok).to.equal(false); expect(failing(r)).to.match(/every announced contribution/);
    });
    it("contributions announced in the wrong order", async function () {
      const t = cloneT(); [t.rounds[0], t.rounds[1]] = [t.rounds[1], t.rounds[0]];
      expect((await run(t)).ok).to.equal(false);
    });
    it("fewer contributors than required", async function () {
      const r = await run(cloneT(), { minContributors: 6 }); expect(r.ok).to.equal(false); expect(failing(r)).to.match(/at least 6/);
    });
    it("duplicate contributor identities", async function () {
      const t = cloneT(); t.rounds[1].contributor = t.rounds[0].contributor;
      const r = await run(t); expect(failing(r)).to.match(/unique/);
    });
    it("a zkey that was not sealed by a beacon", async function () {
      const t = cloneT(); t.final.zkeyBlake2b = await C.hashFile(files[files.length - 1]);
      const r = await C.verifyTranscript(t, { r1cs, ptau, zkey: files[files.length - 1], minContributors: 5 });
      expect(r.ok).to.equal(false); expect(failing(r)).to.match(/beacon/);
    });
    it("a different beacon value than the one announced", async function () {
      const t = cloneT(); t.beacon.hash = "ee".repeat(32);
      expect(failing(await run(t))).to.match(/beacon value/);
    });
    it("a different ptau than the pinned public Phase-1 file", async function () {
      const r = await run(cloneT(), { expectedPtauBlake2b: "ab".repeat(64) }); expect(failing(r)).to.match(/pinned public Phase 1/);
    });
    it("a modified Solidity verifier (e.g. an extra backdoor line)", async function () {
      const evil = path.join(dir, "evil.sol");
      fs.writeFileSync(evil, fs.readFileSync(fin.solFile, "utf8").replace("contract RagequitVerifier {", "contract RagequitVerifier {\n    address private backdoor = address(0xdead);"));
      const r = await C.verifyTranscript(transcript, { r1cs, ptau, zkey: finalZkey, verifierSol: evil, minContributors: 5 });
      expect(r.ok).to.equal(false); expect(failing(r)).to.match(/verifier source you hold/);
    });
    it("a transcript whose key/verifier hashes were edited", async function () {
      const t = cloneT(); t.final.vkeyHash = "00".repeat(64);
      expect(failing(await run(t))).to.match(/verification key/);
    });
  });

  describe("D-TEST4/6 the exported verifier on a real chain", function () {
    let verifier, note;
    before(async function () {
      const compiled = compileVerifier(fs.readFileSync(fin.solFile, "utf8"), "RagequitVerifier");
      const [owner] = await ethers.getSigners();
      verifier = await new ethers.ContractFactory(compiled.abi, compiled.bytecode, owner).deploy();
      note = { sk: M.randomField(), rho: M.randomField() };
    });

    it("D-TEST4 a proof made with the ceremony zkey is accepted; any tampering is rejected", async function () {
      const [pA, pB, pC, pub] = await proveWith(finalZkey, note);
      expect(await verifier.verifyProof(pA, pB, pC, pub)).to.equal(true);
      const bad = [...pub]; bad[1] = (BigInt(bad[1]) + 1n).toString();
      expect(await verifier.verifyProof(pA, pB, pC, bad)).to.equal(false);
    });

    it("D-TEST6 proofs from the old DEV zkey are rejected by the ceremony verifier (and vice versa)", async function () {
      const [pA, pB, pC, pub] = await proveWith(path.join(ROOT, "build", "ragequit_final.zkey"), note);
      expect(await verifier.verifyProof(pA, pB, pC, pub), "dev-setup proof must not verify under the ceremony key").to.equal(false);
      const oldVerifier = await (await ethers.getContractFactory("RagequitVerifier")).deploy();
      const [qA, qB, qC, qpub] = await proveWith(finalZkey, note);
      expect(await oldVerifier.verifyProof(qA, qB, qC, qpub), "ceremony proof must not verify under the dev verifier").to.equal(false);
      expect(await oldVerifier.verifyProof(pA, pB, pC, pub), "control: dev proof verifies under the dev verifier").to.equal(true);
    });
  });
});
