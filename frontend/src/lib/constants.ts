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
  "function deposit(uint256 commitment, uint256 label) external payable",
  "function withdraw(bytes calldata proof, uint256 root, uint256 nullifierHash, address recipient, address relayer, uint256 fee, uint256 aspRoot) external",
  "function ragequit(bytes calldata proof, uint256 commitment, address recipient) external",
  "function nullifierSpent(uint256 nullifierHash) external view returns (bool)",
  "function isKnownRoot(uint256 root) external view returns (bool)",
  "function nextLeafIndex() external view returns (uint32)",
];

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
