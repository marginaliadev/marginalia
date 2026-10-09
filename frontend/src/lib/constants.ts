export const RH_TESTNET = {
  chainId: 46630,
  chainIdHex: "0xb626",
  name: "Robinhood Chain Testnet",
  rpcUrl: process.env.NEXT_PUBLIC_RH_TESTNET_RPC_URL || "https://rpc.testnet.chain.robinhood.com",
  explorerUrl: process.env.NEXT_PUBLIC_EXPLORER_URL || "https://explorer.testnet.chain.robinhood.com",
  poolAddress: (process.env.NEXT_PUBLIC_MARGINALIA_POOL_ADDRESS || "0x340E20C7CBe7eA83d463432ac8FA1e891bdca948") as `0x${string}`,
  symbol: "ETH",
};

export const POOL_ABI = [
  "function deposit(uint256 precommitment) external payable returns (uint256 commitment)",
  "function withdraw((address recipient, address relayer, uint256 fee) w, (uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[6] pubSignals) p) external",
  "function ragequit(uint256 label, address recipient, (uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[2] pubSignals) p) external",
  "function nullifierSpent(uint256 nullifierHash) external view returns (bool)",
  "function isKnownRoot(uint256 root) external view returns (bool)",
  "function nextIndex() external view returns (uint32)",
  "function getLastRoot() external view returns (uint256)",
  "function labelDepositor(uint256 label) external view returns (address)",
  "function hasher1() external view returns (address)",
  "function hasher2() external view returns (address)",
  "function hasher3() external view returns (address)",
];

export const POSEIDON_ABI = {
  1: ["function poseidon(uint256[1] input) external pure returns (uint256)"],
  2: ["function poseidon(uint256[2] input) external pure returns (uint256)"],
  3: ["function poseidon(uint256[3] input) external pure returns (uint256)"],
} as const;

export interface NotePayload {
  sk: string;
  rho: string;
  value: string;
  label: string;
  commitment: string;
}

export interface StatusResponse {
  name: string;
  version: string;
  chain: {
    chainId: number;
    name: string;
    rpcUrl: string;
  };
  contracts: {
    pool: string;
  };
  telemetry: {
    poolBalanceEth: string;
    blockNumber: number | null;
  };
  database: {
    connected: boolean;
    leavesCount: number;
    aspCount: number;
  };
  relayer: {
    address: string;
    status: string;
  };
}
