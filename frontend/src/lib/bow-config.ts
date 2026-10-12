// Server-side configuration of the 0xbow deployment the Courier relays into (migration plan section 6). Nothing is guessed:
// without BOW_ENTRYPOINT the bow routes answer 503. The old pool routes are untouched until the cutover (step M6).
import { ethers } from "ethers";

export const NATIVE_ASSET = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export const BOW_ENTRYPOINT_ABI = [
  "function relay((address processooor, bytes data) w, (uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[8] pubSignals) p, uint256 scope)",
  "function assetConfig(address asset) view returns (address pool, uint256 minimumDepositAmount, uint256 vettingFeeBPS, uint256 maxRelayFeeBPS)",
  "function latestRoot() view returns (uint256)",
];

export function bowEntrypoint(env: Record<string, string | undefined> = process.env): string | null {
  const a = env.BOW_ENTRYPOINT;
  return a && ethers.isAddress(a) ? ethers.getAddress(a) : null;
}
