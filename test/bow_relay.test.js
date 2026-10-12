// Courier policy for the 0xbow core: percentage fee, minimum depends on the amount, strict payload validation.
const path = require("path");
const { execFileSync } = require("child_process");
const { expect } = require("chai");

describe("Courier policy for the 0xbow core (frontend/src/lib/bow-relay.ts)", function () {
  this.timeout(60000);
  let r;
  before(function () {
    r = JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "tests/bow-relay.mts"], { cwd: path.join(__dirname, "..", "frontend"), encoding: "utf8" }).trim().split("\n").pop());
  });

  it("quotes the smallest basis-point fee that covers the cost, and it really covers it", function () {
    expect(Number(r.minBps)).to.be.greaterThan(0).and.at.most(100);
    expect(r.covers).to.equal(true);
  });
  it("refuses to quote when the pool cap cannot pay for the gas (tiny amount or gas spike) or the value is zero", function () {
    expect(r.tiny).to.equal(null);
    expect(r.highGas).to.equal(null);
    expect(r.zero).to.equal(null);
  });
  it("rounds the fee down like the contract does", function () {
    expect(r.feeFloor).to.equal("9"); // 999 * 100 / 10000
  });
  it("accepts a fee down to 90% of the exact requirement, not below, and not after the gas price doubled", function () {
    expect(r.tolerance).to.deep.equal({ exact: true, at91: true, at89: false, priceDoubled: false });
  });
  it("relay data round-trips", function () {
    expect(r.roundTrip).to.deep.equal({ recipient: "0x" + "b3".repeat(20), feeRecipient: "0x" + "a2".repeat(20), relayFeeBps: "100" });
  });
  it("validates the payload strictly", function () {
    expect(r.valid.ok).to.equal(true);
    expect(r.valid.bps).to.equal("100");
    expect(r.valid.value).to.equal("800000000000000");
    expect(r.wrongProcessooor.error).to.match(/Entrypoint/);
    expect(r.wrongFeeRecipient.error).to.match(/fee recipient/i);
    expect(r.zeroRecipient.error).to.match(/zero address/);
    expect(r.badSignals.error).to.match(/pubSignals\[8\]/);
    expect(r.badData.error).to.be.a("string");
    expect(r.hugeData.error).to.match(/Malformed withdrawal.data/);
    expect(r.noScope.error).to.match(/Malformed/);
  });
});
