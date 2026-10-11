// Plan B1 (E1/E2): the coordinator queue + the standalone contributor tool, run end to end on the small ragequit circuit
// with a DEV Powers of Tau (proves the workflow, not the security of a real setup).
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const { expect } = require("chai");
const snarkjs = require("snarkjs");
const C = require("../scripts/ceremony/lib");
const { compileCircuit } = require("../scripts/ceremony/compile");

const ROOT = path.join(__dirname, "..");
const BEACON = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";
const node = (script, args, opts = {}) => spawnSync(process.execPath, [path.join(ROOT, script), ...args], { encoding: "utf8", cwd: ROOT, ...opts });

async function devPtau() {
  const dir = path.join(os.tmpdir(), "marginalia-ceremony-cache");
  fs.mkdirSync(dir, { recursive: true });
  const final = path.join(dir, "dev-ptau-12.ptau");
  if (fs.existsSync(final)) return final;
  const { logger } = C.capture();
  const curve = await snarkjs.curves.getCurveFromName("bn128");
  await snarkjs.powersOfTau.newAccumulator(curve, 12, path.join(dir, "p0.ptau"), logger);
  await snarkjs.powersOfTau.contribute(path.join(dir, "p0.ptau"), path.join(dir, "p1.ptau"), "dev", "coordinator-test-" + Date.now(), logger);
  await snarkjs.powersOfTau.preparePhase2(path.join(dir, "p1.ptau"), final, logger);
  return final;
}

describe("Ceremony coordinator + standalone contributor tool (B1 E1/E2)", function () {
  this.timeout(600000);
  let dir, r1cs, ptau;
  const D = () => ["--dir", dir];

  before(async function () {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "marginalia-coord-"));
    r1cs = compileCircuit("ragequit").r1cs;
    ptau = await devPtau();
    fs.writeFileSync(path.join(dir, "people.json"), JSON.stringify([{ name: "Alice" }, { name: "Bob" }, { name: "Carol" }, { name: "Dave" }]));
  });

  it("start: zkey #0 and one pending slot per contributor; duplicate names and re-start are refused", function () {
    const r = node("scripts/ceremony/coordinator.js", ["start", "--circuit", "ragequit", "--r1cs", r1cs, "--ptau", ptau, ...D(), "--contributors", path.join(dir, "people.json")]);
    expect(r.stdout + r.stderr).to.include("started ragequit: 4 slots");
    const again = node("scripts/ceremony/coordinator.js", ["start", "--circuit", "ragequit", "--r1cs", r1cs, "--ptau", ptau, ...D(), "--contributors", path.join(dir, "people.json")]);
    expect(again.status).to.not.equal(0);
    const dup = path.join(dir, "dup.json"); fs.writeFileSync(dup, JSON.stringify([{ name: "A" }, { name: "a" }]));
    expect(node("scripts/ceremony/coordinator.js", ["start", "--circuit", "ragequit", "--r1cs", r1cs, "--ptau", ptau, "--dir", path.join(dir, "x"), "--contributors", dup]).status).to.not.equal(0);
  });

  it("the contributor tool refuses a wrong announced hash, and contributes with the right one", function () {
    const next = JSON.parse(node("scripts/ceremony/coordinator.js", ["next", ...D()]).stdout);
    expect(next.contributor).to.equal("Alice");
    const out = path.join(dir, "alice-out.zkey");
    const bad = node("scripts/ceremony/contribute.js", ["--in", next.send, "--out", out, "--name", "Alice", "--expect-sha256", "00".repeat(32)]);
    expect(bad.status).to.not.equal(0);
    expect(fs.existsSync(out)).to.equal(false);
    const ok = node("scripts/ceremony/contribute.js", ["--in", next.send, "--out", out, "--name", "Alice", "--expect-sha256", next.sha256]);
    expect(ok.status, ok.stderr).to.equal(0);
    expect(ok.stdout).to.include("PUBLISH THESE THREE VALUES");
    const hash = (ok.stdout.match(/contribution hash : (.*)/) || [])[1];
    const rec = node("scripts/ceremony/coordinator.js", ["receive", ...D(), "--file", out, "--name", "Alice", "--contribution-hash", hash]);
    expect(rec.stdout).to.include("ACCEPTED round 1 from Alice");
  });

  it("a replayed (unchanged) zkey and a wrong announced contribution hash are rejected; the chain keeps the last good file", function () {
    // Bob "contributes" by returning the previous file unchanged
    const replay = node("scripts/ceremony/coordinator.js", ["receive", ...D(), "--file", path.join(dir, "0001.zkey"), "--name", "Bob"]);
    expect(replay.status).to.not.equal(0);
    expect(replay.stdout).to.include("REJECTED");
    const state = JSON.parse(fs.readFileSync(path.join(dir, "state.json"), "utf8"));
    expect(state.lastGood.file).to.equal("0001.zkey");
    expect(state.slots.find((s) => s.name === "Bob").status).to.equal("rejected");
    // Carol contributes properly but announces a hash that is not the one inside her zkey
    const out = path.join(dir, "carol-out.zkey");
    const r = node("scripts/ceremony/contribute.js", ["--in", path.join(dir, "0001.zkey"), "--out", out, "--name", "Carol"]);
    expect(r.status, r.stderr).to.equal(0);
    const wrong = node("scripts/ceremony/coordinator.js", ["receive", ...D(), "--file", out, "--name", "Carol", "--contribution-hash", "deadbeef"]);
    expect(wrong.status).to.not.equal(0);
    expect(fs.existsSync(path.join(dir, "0002.zkey"))).to.equal(false);
  });

  it("skip, accept the next contributors, then seal needs the minimum and produces a transcript that the public verifier accepts", function () {
    // Carol was rejected above (wrong hash); Dave contributes; Carol is not retried: she is the 3rd slot
    const out = path.join(dir, "dave-out.zkey");
    expect(node("scripts/ceremony/contribute.js", ["--in", path.join(dir, "0001.zkey"), "--out", out, "--name", "Dave"]).status).to.equal(0);
    expect(node("scripts/ceremony/coordinator.js", ["receive", ...D(), "--file", out, "--name", "Dave"]).stdout).to.include("ACCEPTED round 2 from Dave");

    const tooFew = node("scripts/ceremony/coordinator.js", ["seal", ...D(), "--hash", BEACON, "--source", "test beacon"]);
    expect(tooFew.status).to.not.equal(0);
    expect(tooFew.stderr).to.include("mainnet guard needs 15");

    const weak = node("scripts/ceremony/coordinator.js", ["seal", ...D(), "--hash", BEACON, "--source", "test beacon", "--min", "2", "--iterations", "5"]);
    expect(weak.status).to.not.equal(0);
    expect(weak.stderr).to.include("between 10 and 63");

    const seal = node("scripts/ceremony/coordinator.js", ["seal", ...D(), "--hash", BEACON, "--source", "test beacon", "--min", "2", "--iterations", "10", "--contract", "RagequitVerifier"]);
    expect(seal.status, seal.stderr + seal.stdout).to.equal(0);
    const v = node("scripts/ceremony/cli.js", ["verify", "--transcript", path.join(dir, "transcript.json"), "--r1cs", r1cs, "--ptau", ptau, "--zkey", path.join(dir, "final.zkey"), "--verifier", path.join(dir, "out", "RagequitVerifier.sol"), "--min", "2"]);
    expect(v.stdout, v.stdout + v.stderr).to.include("TRANSCRIPT VERIFIED");
    const t = JSON.parse(fs.readFileSync(path.join(dir, "transcript.json"), "utf8"));
    expect(t.rounds.map((r) => r.contributor)).to.deep.equal(["Alice", "Dave"]);
  });

  it("publish (E3): the public status lists rounds and the seal but never a contributor contact", function () {
    // give one contributor a contact in state.json to prove it is stripped
    const st = JSON.parse(fs.readFileSync(path.join(dir, "state.json"), "utf8"));
    st.slots[0].contact = "alice-secret@example.org";
    fs.writeFileSync(path.join(dir, "state.json"), JSON.stringify(st, null, 2));
    const meta = path.join(dir, "meta.json");
    fs.writeFileSync(meta, JSON.stringify({ window: "test window", beacon: { source: "drand quicknet", round: 123, iterationsExp: 10 } }));
    const out = path.join(dir, "public", "status.json");
    const r = node("scripts/ceremony/coordinator.js", ["publish", "--dirs", dir, "--out", out, "--meta", meta]);
    expect(r.status, r.stderr).to.equal(0);
    const raw = fs.readFileSync(out, "utf8");
    expect(raw).to.not.include("alice-secret");
    expect(raw).to.not.include("contact");
    const pub = JSON.parse(raw);
    expect(pub.phase).to.equal("sealed");
    expect(pub.beacon.round).to.equal(123);
    const c = pub.circuits[0];
    expect(c.rounds.map((x) => x.contributor)).to.deep.equal(["Alice", "Dave"]);
    expect(c.slots.find((x) => x.name === "Bob").status).to.equal("rejected");
    expect(c.sealed.contractName).to.equal("RagequitVerifier");
    expect(c.sealed.beacon.hash).to.equal(BEACON);
  });
});
