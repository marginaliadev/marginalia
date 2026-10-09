// Mersenne Courier policy: fee quoting, relayer wallet health and serialization of relays.
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";
import { estimateGas, quoteFee, cleanSamples, MAX_SAMPLES, type GasEstimate } from "@/lib/gas-estimator";

/** Quoted minimum = gas * price * 110% */
export const QUOTE_MARGIN_BPS = BigInt(11000);
/** The relay accepts a fee down to 90% of the current minimum, so a small gas-price move between quote and relay does not void a proof. */
export const FEE_TOLERANCE_BPS = BigInt(9000);
/** A relayer fee above half of the withdrawn value is almost certainly a mistake (or an attack on the user). */
export const MAX_FEE_SHARE_BPS = BigInt(5000);

const BPS = BigInt(10000);

// ---- empirical gas model: what the Courier actually spent on recent relays (see gas-estimator.ts for the reasoning)
const gs = globalThis as unknown as { __relayerGasSamples?: number[]; __relayerGasWarm?: Promise<void> };
const samples = (): number[] => (gs.__relayerGasSamples ??= []);

/** Remember the gas of a confirmed relay (also persisted in relayer_jobs by the relay route). */
export function recordGasSample(gasUsed: number | bigint) {
  const all = cleanSamples([...samples(), Number(gasUsed)]);
  gs.__relayerGasSamples = all.slice(-MAX_SAMPLES);
}

/** After a restart: reload the last relays' gas from relayer_jobs (best effort, read-only key is enough). */
export function warmGasSamples(): Promise<void> {
  return (gs.__relayerGasWarm ??= (async () => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) return;
    try {
      const { data } = await createClient(url, key, { auth: { persistSession: false } })
        .from("relayer_jobs").select("gas_used").eq("status", "CONFIRMED").not("gas_used", "is", null).order("created_at", { ascending: false }).limit(MAX_SAMPLES);
      if (data && data.length) gs.__relayerGasSamples = cleanSamples([...data.map((r) => r.gas_used).reverse(), ...samples()]).slice(-MAX_SAMPLES);
    } catch {}
  })());
}

/** Current gas estimate used by the quote: observed p90 + headroom, or the measured constant until there are enough samples. */
export function currentGasEstimate(): GasEstimate {
  return estimateGas(samples());
}

export function minFeeFor(gasPrice: bigint, gas: number = currentGasEstimate().gas): bigint {
  return quoteFee(gas, gasPrice);
}
export function feeAcceptable(fee: bigint, minFee: bigint): boolean {
  return fee >= (minFee * FEE_TOLERANCE_BPS) / BPS;
}
export function feeWithinShare(fee: bigint, withdrawnValue: bigint): boolean {
  return fee * BPS <= withdrawnValue * MAX_FEE_SHARE_BPS;
}

export function minBalanceWei(): bigint {
  try {
    return ethers.parseEther(process.env.RELAYER_MIN_BALANCE_ETH || "0.0005");
  } catch {
    return ethers.parseEther("0.0005");
  }
}

export interface RelayerHealth {
  address: string | null;
  configured: boolean;
  balanceWei: bigint | null;
  healthy: boolean;
  reason: string | null;
}

const g = globalThis as unknown as { __relayerAlertAt?: number; __relayerChain?: Promise<unknown> };

async function alertLowBalance(msg: string) {
  const url = process.env.ALERT_WEBHOOK_URL;
  console.warn(`[relayer] ${msg}`);
  if (!url) return;
  const now = Date.now();
  if (g.__relayerAlertAt && now - g.__relayerAlertAt < 10 * 60_000) return; // at most one alert per 10 minutes
  g.__relayerAlertAt = now;
  try {
    await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: `MARGINALIA relayer: ${msg}`, content: `MARGINALIA relayer: ${msg}` }) });
  } catch {}
}

/** Address + balance + whether the Courier should be offered. Never throws. */
export async function relayerHealth(provider: ethers.Provider): Promise<RelayerHealth> {
  const pk = process.env.RELAYER_PRIVATE_KEY;
  if (!pk) return { address: null, configured: false, balanceWei: null, healthy: false, reason: "not-configured" };
  let address: string;
  try {
    address = new ethers.Wallet(pk).address;
  } catch {
    return { address: null, configured: false, balanceWei: null, healthy: false, reason: "invalid-key" };
  }
  try {
    const balanceWei = await provider.getBalance(address);
    if (balanceWei < minBalanceWei()) {
      await alertLowBalance(`balance ${ethers.formatEther(balanceWei)} ETH is below ${ethers.formatEther(minBalanceWei())} ETH (${address})`);
      return { address, configured: true, balanceWei, healthy: false, reason: "low-balance" };
    }
    return { address, configured: true, balanceWei, healthy: true, reason: null };
  } catch {
    // cannot read the balance: do not claim healthy
    return { address, configured: true, balanceWei: null, healthy: false, reason: "rpc-unavailable" };
  }
}

/** Run relays one at a time: a single hot wallet must not race its own nonce. */
export function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const prev = (g.__relayerChain ?? Promise.resolve()) as Promise<unknown>;
  const run = prev.then(fn, fn);
  g.__relayerChain = run.catch(() => undefined);
  return run;
}
