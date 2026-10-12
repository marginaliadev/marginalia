// Pure helpers for the Courier on the 0xbow core (migration plan section 6). No imports of chain state: unit-tested by
// frontend/tests/bow-relay.mts and used by /api/relay/bow.
//
// What differs from our old pool:
//   - the fee is a PERCENTAGE (relayFeeBPS) of the withdrawn value, bound into the proof through `context` (it is inside Withdrawal.data);
//   - the pool configuration caps it (maxRelayFeeBPS); the Entrypoint pays `value * bps / 10_000` to the fee recipient and the rest to the recipient;
//   - so the quote is a MINIMUM PERCENTAGE that depends on the amount: a small withdrawal may not be able to pay for its own gas.
import { ethers } from "ethers";

export const BOW_DEFAULT_GAS = 560_000; // measured on testnet: relay 485k-496k gas; ~13% headroom
export const BOW_MARGIN_BPS = 11_000n; // +10% on the cost, same margin as the old Courier
export const BOW_TOLERANCE_BPS = 9_000n; // a fee down to 90% of the exact requirement is accepted (the gas price can move between quote and relay)
export const BPS = 10_000n;

const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

/** The relay fee in wei the Entrypoint will pay out for this value and basis points (floor, as the contract does). */
export function relayFeeWei(value: bigint, bps: bigint): bigint {
  return (value * bps) / BPS;
}

/** Cost the Courier must recover for one relay: gas * price * margin. */
export function relayCostWei(gas: bigint, gasPrice: bigint): bigint {
  return (gas * gasPrice * BOW_MARGIN_BPS) / BPS;
}

/**
 * Smallest basis-point fee that covers the cost for this value, or null when even the pool cap is not enough
 * (the withdrawal is too small to be relayed: use self-relay).
 */
export function minRelayFeeBps(value: bigint, gas: bigint, gasPrice: bigint, maxRelayFeeBps: bigint): bigint | null {
  if (value <= 0n) return null;
  const cost = relayCostWei(gas, gasPrice);
  let bps = ceilDiv(cost * BPS, value);
  // floor rounding in relayFeeWei could leave the fee a wei short: step up until it covers
  while (relayFeeWei(value, bps) < cost && bps <= maxRelayFeeBps) bps += 1n;
  if (bps < 1n) bps = 1n; // never quote 0 BPS to a Courier
  return bps > maxRelayFeeBps ? null : bps;
}

/** At relay time: does the bound fee cover the exact estimated cost of this transaction (with tolerance)? */
export function feeCoversExactCost(fee: bigint, exactGas: bigint, gasPrice: bigint): boolean {
  return fee >= (relayCostWei(exactGas, gasPrice) * BOW_TOLERANCE_BPS) / BPS;
}

const coder = ethers.AbiCoder.defaultAbiCoder();

export function encodeRelayData(recipient: string, feeRecipient: string, relayFeeBps: bigint): string {
  return coder.encode(["tuple(address recipient, address feeRecipient, uint256 relayFeeBPS)"], [[recipient, feeRecipient, relayFeeBps]]);
}

export function decodeRelayData(data: string): { recipient: string; feeRecipient: string; relayFeeBps: bigint } {
  const [t] = coder.decode(["tuple(address recipient, address feeRecipient, uint256 relayFeeBPS)"], data);
  return { recipient: t[0], feeRecipient: t[1], relayFeeBps: BigInt(t[2]) };
}

const isUint = (v: unknown) => (typeof v === "string" || typeof v === "number" || typeof v === "bigint") && /^\d{1,78}$/.test(String(v));
const isUintArray = (a: unknown, n: number) => Array.isArray(a) && a.length === n && a.every(isUint);

export type BowRelayPayload = {
  withdrawal: { processooor: string; data: string };
  proof: { pA: string[]; pB: string[][]; pC: string[]; pubSignals: string[] };
  scope: string;
};

/** Shape and address checks only; the contract (staticCall) remains the judge of the proof. Returns an error string or the parsed pieces. */
export function validateBowRelayPayload(body: any, entrypoint: string, relayer: string):
  { error: string } | { payload: BowRelayPayload; recipient: string; relayFeeBps: bigint; withdrawnValue: bigint } {
  const w = body?.withdrawal, p = body?.proof;
  if (!w || !p || !isUint(body?.scope)) return { error: "Malformed withdrawal, proof or scope" };
  if (!ethers.isAddress(w.processooor) || w.processooor.toLowerCase() !== entrypoint.toLowerCase()) return { error: "withdrawal.processooor must be the Entrypoint" };
  if (typeof w.data !== "string" || !/^0x[0-9a-fA-F]+$/.test(w.data) || w.data.length > 2 + 2 * 96) return { error: "Malformed withdrawal.data" };
  if (!isUintArray(p.pA, 2) || !isUintArray(p.pC, 2) || !Array.isArray(p.pB) || p.pB.length !== 2 || !p.pB.every((r: unknown) => isUintArray(r, 2)) || !isUintArray(p.pubSignals, 8)) {
    return { error: "Malformed proof: expected pA[2], pB[2][2], pC[2], pubSignals[8]" };
  }
  let d;
  try { d = decodeRelayData(w.data); } catch { return { error: "withdrawal.data is not a RelayData tuple" }; }
  if (d.recipient === ethers.ZeroAddress) return { error: "Recipient is the zero address" };
  if (d.feeRecipient.toLowerCase() !== relayer.toLowerCase()) return { error: `Invalid fee recipient: expected ${relayer}` };
  return { payload: body as BowRelayPayload, recipient: d.recipient, relayFeeBps: d.relayFeeBps, withdrawnValue: BigInt(p.pubSignals[2]) };
}
