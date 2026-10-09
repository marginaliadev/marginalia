export const RH_TESTNET = {
  chainId: 46630,
  chainIdHex: "0xb626",
  name: "Robinhood Chain Testnet",
  rpcUrl: process.env.NEXT_PUBLIC_RH_TESTNET_RPC_URL || "https://rpc.testnet.chain.robinhood.com",
  explorerUrl: process.env.NEXT_PUBLIC_EXPLORER_URL || "https://explorer.testnet.chain.robinhood.com",
  poolAddress: (process.env.NEXT_PUBLIC_MARGINALIA_POOL_ADDRESS || "0x340E20C7CBe7eA83d463432ac8FA1e891bdca948") as `0x${string}`,
  symbol: "ETH",
  registerAddress: (process.env.NEXT_PUBLIC_MAGISTRATE_REGISTER_ADDRESS || "0x9a54AaADB10472a930822D635831Ee7aa3488d75") as `0x${string}`,
};

export const POOL_ABI = [
  "function deposit(uint256 precommitment) external payable returns (uint256 commitment)",
  "function withdraw((address recipient, address relayer, uint256 fee) w, (uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[6] pubSignals) p) external",
  "function ragequit(uint256 label, address recipient, (uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[2] pubSignals) p) external",
  "function nullifierSpent(uint256 nullifierHash) external view returns (bool)",
  "function isKnownRoot(uint256 root) external view returns (bool)",
  "function nextIndex() external view returns (uint32)",
  "function computeContext((address recipient, address relayer, uint256 fee) w) external view returns (uint256)",
  "function getLastRoot() external view returns (uint256)",
  "function labelDepositor(uint256 label) external view returns (address)",
  "function hasher1() external view returns (address)",
  "function hasher2() external view returns (address)",
  "function hasher3() external view returns (address)",
  "error Reentrancy()",
  "error InvalidValue()",
  "error NotInField()",
  "error TreeFull()",
  "error UnknownStateRoot()",
  "error StaleAspRoot()",
  "error NullifierAlreadySpent()",
  "error InvalidContext()",
  "error FeeTooHigh()",
  "error InvalidProof()",
  "error TransferFailed()",
  "error NotOriginalDepositor()",
  "error AlreadyRagequit()",
  "error InvalidPrecommitment()",
  "error PrecommitmentReused()",
  "error DepositsPaused()",
  "error NotGuardian()",
  "error ExceedsMaxDeposit()",
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

export const REGISTER_ABI = [
  "function isValidRoot(uint256 root) external view returns (bool)",
  "function latestRoot() external view returns (uint256)",
  "function rootData(uint256 root) external view returns (string)",
  "function isApproved(uint256 label) external view returns (bool)",
];

export const POOL_EVENTS_ABI = [
  "event LeafInserted(uint256 indexed index, uint256 leaf, uint256 root)",
  "event Deposited(address indexed depositor, uint256 commitment, uint256 label, uint256 value, uint256 precommitment, uint256 index)",
  "event Withdrawn(address indexed recipient, address indexed relayer, uint256 withdrawnValue, uint256 fee, uint256 nullifierHash, uint256 newCommitment)",
  "event Ragequit(address indexed depositor, uint256 indexed label, uint256 value, uint256 nullifierHash, address recipient)",
];

/** Human-readable text for the pool's custom errors. */
export const POOL_ERROR_TEXT: Record<string, string> = {
  InvalidValue: "Invalid value (zero amount or zero address).",
  NotInField: "A value is outside the BN254 field.",
  UnknownStateRoot: "The Folio tree changed; refresh and try again.",
  StaleAspRoot: "The approved-label set is outdated; refresh and try again.",
  NullifierAlreadySpent: "This note was already spent (withdrawn or ragequit).",
  InvalidContext: "The proof does not match the recipient/relayer/fee.",
  FeeTooHigh: "The relayer fee exceeds the withdrawn amount.",
  InvalidProof: "The zero-knowledge proof was rejected.",
  NotOriginalDepositor: "Only the original depositor wallet can ragequit this note.",
  AlreadyRagequit: "This deposit was already ragequit.",
  PrecommitmentReused: "This note secret was already used for a deposit.",
  DepositsPaused: "Deposits are currently paused by the guardian.",
  ExceedsMaxDeposit: "The deposit exceeds the current per-note cap.",
  TreeFull: "The Folio tree is full.",
};
