// Gas model for the Mersenne Courier quote. Pure functions, no imports (unit-tested by frontend/tests/gas-estimator.mts).
//
// Why two layers: the fee is bound into the proof (it is part of `context`), so it must be chosen BEFORE the proof exists, and an
// eth_estimateGas of the real withdraw is impossible at that point (there is no proof to simulate). So:
//   1. QUOTE (before proving): empirical estimate = a high percentile of the gas the Courier actually consumed on recent relays,
//      with headroom; falls back to a conservative constant until enough samples exist. This tracks real conditions, including the
//      L1-data component that Arbitrum-style chains fold into "gas used".
//   2. RELAY (proof in hand): eth_estimateGas of the exact transaction; the fee must cover THAT cost (feeCoversCost).

export const DEFAULT_GAS = 1_150_000; // measured: a relayed withdraw uses ~1.07-1.10M gas
export const MIN_SAMPLES = 3;
export const MAX_SAMPLES = 20;
export const GAS_FLOOR = 700_000;
export const GAS_CEILING = 2_000_000;
export const QUOTE_PERCENTILE = 0.9;
export const HEADROOM_BPS = 10_500; // +5% on top of the percentile
export const MARGIN_BPS = 11_000; // +10% profit/volatility margin on the cost (same as before)
export const TOLERANCE_BPS = 9_000; // a fee down to 90% of the exact requirement is accepted (price may move between quote and relay)

export type GasEstimate = { gas: number; source: "observed" | "default"; samples: number };

/** Keep only plausible samples (finite, in [GAS_FLOOR/2, 2*GAS_CEILING]) and at most the last MAX_SAMPLES. */
export function cleanSamples(raw: unknown[]): number[] {
  return raw
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n >= GAS_FLOOR / 2 && n <= GAS_CEILING * 2)
    .slice(-MAX_SAMPLES);
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

export function estimateGas(rawSamples: unknown[]): GasEstimate {
  const s = cleanSamples(rawSamples);
  if (s.length < MIN_SAMPLES) return { gas: DEFAULT_GAS, source: "default", samples: s.length };
  const withHeadroom = Math.ceil((percentile(s, QUOTE_PERCENTILE) * HEADROOM_BPS) / 10_000);
  return { gas: Math.min(GAS_CEILING, Math.max(GAS_FLOOR, withHeadroom)), source: "observed", samples: s.length };
}

/** Minimum fee (wei) the quote asks for: gas * price * margin. */
export function quoteFee(gas: number, gasPrice: bigint): bigint {
  return (BigInt(gas) * gasPrice * BigInt(MARGIN_BPS)) / BigInt(10_000);
}

/** At relay time: does `fee` cover the EXACT estimated cost of this transaction (with the tolerance)? */
export function feeCoversCost(fee: bigint, exactGas: bigint, gasPrice: bigint): boolean {
  const needed = (exactGas * gasPrice * BigInt(MARGIN_BPS)) / BigInt(10_000);
  return fee >= (needed * BigInt(TOLERANCE_BPS)) / BigInt(10_000);
}
export function requiredFee(exactGas: bigint, gasPrice: bigint): bigint {
  return (exactGas * gasPrice * BigInt(MARGIN_BPS)) / BigInt(10_000);
}
