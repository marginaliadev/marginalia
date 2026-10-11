// One place that says WHICH chain this deployment talks to. Default is the testnet; mainnet is selected with
// NEXT_PUBLIC_CHAIN=mainnet and needs its own contract addresses (there are deliberately no mainnet defaults:
// a mainnet deployment without addresses reports `configured: false` instead of guessing).
// Pure and dependency-free so it can be tested with `node --experimental-strip-types` (frontend/tests/chain.mts).

export type ChainKey = "testnet" | "mainnet";

export interface ChainConfig {
  key: ChainKey;
  chainId: number;
  chainIdHex: string;
  /** Full name used by wallets and APIs. */
  name: string;
  isTestnet: boolean;
  rpcUrl: string;
  /** Public RPC appended as the automatic fallback of the server providers. */
  publicRpcUrl: string;
  explorerUrl: string;
  poolAddress: `0x${string}`;
  registerAddress: `0x${string}`;
  /** First block to scan for pool events when the index is empty. */
  deployBlock: number;
  /** false when a required address (or the deploy block) is missing for this chain. */
  configured: boolean;
  /** Names of the server-side env variables that override the RPC, in priority order. */
  rpcEnvNames: string[];
}

export type ChainEnv = Partial<Record<
  | "NEXT_PUBLIC_CHAIN"
  | "NEXT_PUBLIC_RH_TESTNET_RPC_URL"
  | "NEXT_PUBLIC_RH_MAINNET_RPC_URL"
  | "NEXT_PUBLIC_EXPLORER_URL"
  | "NEXT_PUBLIC_MARGINALIA_POOL_ADDRESS"
  | "NEXT_PUBLIC_MAGISTRATE_REGISTER_ADDRESS"
  | "NEXT_PUBLIC_POOL_DEPLOY_BLOCK",
  string
>>;

const ADDR = /^0x[0-9a-fA-F]{40}$/;
const addr = (v: string | undefined, fallback = ""): `0x${string}` => ((v && ADDR.test(v) ? v : fallback) as `0x${string}`);

const TESTNET = {
  chainId: 46630,
  chainIdHex: "0xb626",
  name: "Robinhood Chain Testnet",
  rpcUrl: "https://rpc.testnet.chain.robinhood.com",
  publicRpcUrl: "https://rpc.testnet.chain.robinhood.com",
  explorerUrl: "https://explorer.testnet.chain.robinhood.com",
  poolAddress: "0x340E20C7CBe7eA83d463432ac8FA1e891bdca948",
  registerAddress: "0x9a54AaADB10472a930822D635831Ee7aa3488d75",
  deployBlock: 129140787,
};

const MAINNET = {
  chainId: 4663,
  chainIdHex: "0x1237",
  name: "Robinhood Chain",
  rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
  publicRpcUrl: "https://robinhood-rpc.publicnode.com",
  explorerUrl: "https://robinhoodchain.blockscout.com",
};

export function resolveChain(env: ChainEnv): ChainConfig {
  if (env.NEXT_PUBLIC_CHAIN === "mainnet") {
    const pool = addr(env.NEXT_PUBLIC_MARGINALIA_POOL_ADDRESS);
    const register = addr(env.NEXT_PUBLIC_MAGISTRATE_REGISTER_ADDRESS);
    const block = Number(env.NEXT_PUBLIC_POOL_DEPLOY_BLOCK);
    return {
      key: "mainnet",
      ...MAINNET,
      isTestnet: false,
      rpcUrl: env.NEXT_PUBLIC_RH_MAINNET_RPC_URL || MAINNET.rpcUrl,
      explorerUrl: env.NEXT_PUBLIC_EXPLORER_URL || MAINNET.explorerUrl,
      poolAddress: pool,
      registerAddress: register,
      deployBlock: Number.isFinite(block) && block > 0 ? block : 0,
      configured: !!pool && !!register && Number.isFinite(block) && block > 0,
      rpcEnvNames: ["RH_MAINNET_RPC_URL", "NEXT_PUBLIC_RH_MAINNET_RPC_URL"],
    };
  }
  const block = Number(env.NEXT_PUBLIC_POOL_DEPLOY_BLOCK);
  return {
    key: "testnet",
    ...TESTNET,
    isTestnet: true,
    rpcUrl: env.NEXT_PUBLIC_RH_TESTNET_RPC_URL || TESTNET.rpcUrl,
    explorerUrl: env.NEXT_PUBLIC_EXPLORER_URL || TESTNET.explorerUrl,
    poolAddress: addr(env.NEXT_PUBLIC_MARGINALIA_POOL_ADDRESS, TESTNET.poolAddress),
    registerAddress: addr(env.NEXT_PUBLIC_MAGISTRATE_REGISTER_ADDRESS, TESTNET.registerAddress),
    deployBlock: Number.isFinite(block) && block > 0 ? block : TESTNET.deployBlock,
    configured: true,
    rpcEnvNames: ["RH_TESTNET_RPC_URL", "NEXT_PUBLIC_RH_TESTNET_RPC_URL"],
  };
}

/** Next inlines NEXT_PUBLIC_* only for literal `process.env.NAME` accesses: do not pass `process.env` as a whole. */
export const CHAIN: ChainConfig = resolveChain({
  NEXT_PUBLIC_CHAIN: process.env.NEXT_PUBLIC_CHAIN,
  NEXT_PUBLIC_RH_TESTNET_RPC_URL: process.env.NEXT_PUBLIC_RH_TESTNET_RPC_URL,
  NEXT_PUBLIC_RH_MAINNET_RPC_URL: process.env.NEXT_PUBLIC_RH_MAINNET_RPC_URL,
  NEXT_PUBLIC_EXPLORER_URL: process.env.NEXT_PUBLIC_EXPLORER_URL,
  NEXT_PUBLIC_MARGINALIA_POOL_ADDRESS: process.env.NEXT_PUBLIC_MARGINALIA_POOL_ADDRESS,
  NEXT_PUBLIC_MAGISTRATE_REGISTER_ADDRESS: process.env.NEXT_PUBLIC_MAGISTRATE_REGISTER_ADDRESS,
  NEXT_PUBLIC_POOL_DEPLOY_BLOCK: process.env.NEXT_PUBLIC_POOL_DEPLOY_BLOCK,
});

/** Short text for headers and badges, e.g. "Robinhood Chain Testnet (46630)". */
export const chainLabel = (c: ChainConfig = CHAIN) => `${c.name} (${c.chainId})`;
