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

/**
 * Public (browser-visible) configuration of the 0xbow deployment the /pool page talks to. The testnet defaults are the recorded
 * deployment (deployments/bow-robinhoodTestnet.json); mainnet has NO defaults: without all three variables the page refuses to transact.
 */
export interface BowClientConfig { chainKey: "testnet" | "mainnet"; entrypoint: string; pool: string; deployBlock: number; configured: boolean }
export function bowClientConfig(env: Record<string, string | undefined> = {
  NEXT_PUBLIC_CHAIN: process.env.NEXT_PUBLIC_CHAIN,
  NEXT_PUBLIC_BOW_ENTRYPOINT: process.env.NEXT_PUBLIC_BOW_ENTRYPOINT,
  NEXT_PUBLIC_BOW_POOL: process.env.NEXT_PUBLIC_BOW_POOL,
  NEXT_PUBLIC_BOW_DEPLOY_BLOCK: process.env.NEXT_PUBLIC_BOW_DEPLOY_BLOCK,
}): BowClientConfig {
  const mainnet = env.NEXT_PUBLIC_CHAIN === "mainnet";
  const addr = (v?: string) => (v && ethers.isAddress(v) ? ethers.getAddress(v) : "");
  const block = Number(env.NEXT_PUBLIC_BOW_DEPLOY_BLOCK);
  const d = mainnet
    ? { entrypoint: "", pool: "", deployBlock: 0 }
    : { entrypoint: "0xf2CE4EF0cB98786faEd7978a8120BeEa0E275980", pool: "0xF54A4fad2AA50E63700973DFC7639B20f2E42dD8", deployBlock: 133595873 };
  const entrypoint = addr(env.NEXT_PUBLIC_BOW_ENTRYPOINT) || d.entrypoint;
  const pool = addr(env.NEXT_PUBLIC_BOW_POOL) || d.pool;
  const deployBlock = Number.isInteger(block) && block > 0 ? block : d.deployBlock;
  return { chainKey: mainnet ? "mainnet" : "testnet", entrypoint, pool, deployBlock, configured: !!entrypoint && !!pool && deployBlock > 0 };
}
