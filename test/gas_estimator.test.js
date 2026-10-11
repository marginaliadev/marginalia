// Fase 03 / H4-T1: the Courier's gas model (frontend/src/lib/gas-estimator.ts, run as TypeScript).
const path = require("path");
const { execFileSync } = require("child_process");
const { expect } = require("chai");

describe("Courier gas model (empirical quote + exact-cost check)", function () {
  this.timeout(60000);
  let r;
  before(function () {
    r = JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "tests/gas-estimator.mts"], { cwd: path.join(__dirname, "..", "frontend"), encoding: "utf8" }));
  });

  it("with fewer than 3 observed relays it uses the measured constant (1,150,000)", function () {
    expect(r.noSamples).to.deep.equal({ gas: 1150000, source: "default", samples: 0 });
    expect(r.twoSamples).to.deep.equal({ gas: 1150000, source: "default", samples: 2 });
  });

  it("with enough relays it quotes the 90th percentile plus 5% headroom", function () {
    expect(r.observed.source).to.equal("observed");
    expect(r.observed.samples).to.equal(10);
    expect(r.observed.gas).to.equal(Math.ceil(1_095_000 * 1.05)); // p90 of the ten samples
  });

  it("the estimate is clamped and implausible samples never poison it", function () {
    expect(r.tooHigh.gas).to.equal(2_000_000);
    expect(r.lowButPlausible).to.deep.equal({ gas: 700000, source: "observed", samples: 5 }); // clamped up to the floor
    expect(r.implausible).to.deep.equal({ gas: 1150000, source: "default", samples: 0 }); // discarded as implausible
    expect(r.garbage.samples).to.equal(2); // NaN, negatives, zero, Infinity, strings, null, 1e12 are all discarded
    expect(r.garbage.source).to.equal("default");
  });

  it("only the last 20 samples count, and the percentile function is exact", function () {
    expect(r.window).to.equal(20);
    expect(r.p90).to.equal(9);
  });

  it("quote = gas x price x 110%", function () {
    expect(BigInt(r.quote.fee)).to.equal((1_150_000n * 10_000_000n * 11_000n) / 10_000n);
  });

  it("relay-time check: the fee must cover the EXACT cost of this transaction (90% tolerance), and a price jump is refused", function () {
    expect(r.covers.exactFee).to.equal(true);
    expect(r.covers.at91).to.equal(true);
    expect(r.covers.at89).to.equal(false);
    expect(r.covers.zero).to.equal(false);
    expect(r.covers.priceDoubled).to.equal(false);
  });
});
