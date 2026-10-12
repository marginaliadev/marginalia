// Browser client for the 0xbow core: known answers from the upstream SDK, strict note parsing, circuit input guards, and (when the pinned
// proving assets were fetched) a real proof verified with the ceremony verification key.
const path = require("path");
const { execFileSync } = require("child_process");
const { expect } = require("chai");

describe("Browser client for the 0xbow core (frontend/src/lib/bow-zk.ts)", function () {
  this.timeout(300000);
  let r;
  before(function () {
    const out = execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "tests/bow-zk.mts"], { cwd: path.join(__dirname, "..", "frontend"), encoding: "utf8", maxBuffer: 1 << 24 });
    r = JSON.parse(out.trim().split("\n").pop());
  });

  it("reproduces the SDK precommitment, commitment, withdrawal context and lean tree proofs", function () {
    expect(r.precommitmentOk).to.equal(true);
    expect(r.commitmentOk).to.equal(true);
    expect(r.contextOk).to.equal(true);
    expect(r.lean).to.equal(true);
  });
  it("the spent-nullifier hash is not the SDK field called nullifierHash (that one is the precommitment)", function () {
    expect(r.nullifierHashIsNotPrecommitment).to.equal(true);
  });
  it("notes round-trip and every tamper or malformation is refused", function () {
    expect(r.noteRoundTrip).to.equal(true);
    expect(r.tamperValue).to.match(/tampering/i);
    expect(r.tamperNullifier).to.match(/tampering/i);
    expect(r.zeroValue).to.match(/Malformed/);
    expect(r.missing).to.match(/Malformed/);
    expect(r.badPrefix).to.match(/prefix/i);
    expect(r.secretsOk).to.equal(true);
  });
  it("builds a correctly shaped circuit input and refuses unsafe requests", function () {
    expect(r.inputShape.siblings).to.equal(true);
    expect(r.inputShape.allStrings).to.equal(true);
    expect(r.changeValue).to.equal(true);
    expect(r.tooMuch).to.match(/withdrawnValue/);
    expect(r.zeroAmount).to.match(/withdrawnValue/);
    expect(r.notApproved).to.match(/not found/);
    expect(r.notInState).to.match(/not found/);
  });
  it("a real proof verifies with the ceremony key and carries the expected public signals (needs the fetched assets)", function () {
    if (r.proofSkipped) return this.skip();
    expect(r.assetsMatchPins).to.equal(true);
    expect(r.verifies).to.equal(true);
    expect(r.signals).to.deep.equal({ newCommitment: true, nullifierHash: true, withdrawnValue: true, stateRoot: true, stateDepth: true, aspRoot: true, aspDepth: true, context: true });
    expect(r.relayShape).to.equal(true);
    expect(r.tamperedRejected).to.equal(true);
  });
});
