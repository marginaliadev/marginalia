// Prints results of the pure gas model (frontend/src/lib/gas-estimator.ts) as JSON for the mocha wrapper.
import * as G from "../src/lib/gas-estimator.ts";

const out: any = {};
out.constants = { DEFAULT_GAS: G.DEFAULT_GAS, MIN_SAMPLES: G.MIN_SAMPLES, MAX_SAMPLES: G.MAX_SAMPLES };
out.noSamples = G.estimateGas([]);
out.twoSamples = G.estimateGas([1_000_000, 1_010_000]);
out.observed = G.estimateGas([1_050_000, 1_060_000, 1_070_000, 1_080_000, 1_100_000, 1_090_000, 1_075_000, 1_065_000, 1_085_000, 1_095_000]);
out.tooHigh = G.estimateGas(Array(5).fill(1_950_000)); // 1.95M * 1.05 > ceiling
out.lowButPlausible = G.estimateGas(Array(5).fill(400_000)); // kept (>= floor/2) but the quote never goes below the floor
out.implausible = G.estimateGas(Array(5).fill(100_000)); // < floor/2: discarded -> default
out.garbage = G.estimateGas([NaN, -5, 0, Infinity, "abc", null, undefined, 1e12, 1_000_000, 1_000_000]); // only 2 valid
out.window = G.cleanSamples(Array.from({ length: 50 }, (_, i) => 1_000_000 + i)).length;
out.p90 = G.percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9);
const price = 10_000_000n; // 0.01 gwei
out.quote = { fee: G.quoteFee(1_150_000, price).toString() };
const exact = 1_070_000n;
out.required = G.requiredFee(exact, price).toString();
out.covers = {
  exactFee: G.feeCoversCost(G.requiredFee(exact, price), exact, price),
  at91: G.feeCoversCost((G.requiredFee(exact, price) * 91n) / 100n, exact, price),
  at89: G.feeCoversCost((G.requiredFee(exact, price) * 89n) / 100n, exact, price),
  zero: G.feeCoversCost(0n, exact, price),
  priceDoubled: G.feeCoversCost(G.requiredFee(exact, price), exact, price * 2n), // gas price doubled after the quote: must be refused
};
console.log(JSON.stringify(out));
