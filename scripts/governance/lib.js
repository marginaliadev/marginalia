// Governance helpers for the Safe multisig (Fase 03 / H3).
// Roles after hardening:
//   MagistrateRegister.owner      -> Safe (can rotate the Magistrate, authorise pools)
//   MagistrateRegister.magistrate -> PUBLISHER (a hot key used by the automated Magistrate service; the Safe can replace it)
//   MarginaliaPool.guardian       -> Safe (pause deposits, deposit cap)
// Safe v1.4.1 addresses are the canonical CREATE2 deployments (present on Robinhood Chain Testnet, verified by H3-T0).
const { ethers } = require("ethers");

const SAFE_V141 = {
  singleton: "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762", // SafeL2
  proxyFactory: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
  fallbackHandler: "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99",
};

const SAFE_ABI = [
  "function setup(address[] _owners, uint256 _threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)",
  "function nonce() view returns (uint256)",
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 _nonce) view returns (bytes32)",
  "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool)",
];
const FACTORY_ABI = [
  "function createProxyWithNonce(address _singleton, bytes initializer, uint256 saltNonce) returns (address proxy)",
  "event ProxyCreation(address indexed proxy, address singleton)",
];

const REGISTER_ABI = [
  "function owner() view returns (address)",
  "function magistrate() view returns (address)",
  "function setMagistrate(address)",
  "function transferOwnership(address)",
  "function setPool(address,bool)",
];
const POOL_ABI = [
  "function guardian() view returns (address)",
  "function pendingGuardian() view returns (address)",
  "function transferGuardian(address)",
  "function acceptGuardian()",
  "function setDepositsPaused(bool)",
  "function setMaxDepositAmount(uint256)",
  "function depositsPaused() view returns (bool)",
];

/** Create a Safe (v1.4.1 proxy) with the given owners and threshold. Returns its address. */
async function createSafe(sender, owners, threshold, saltNonce = BigInt(Date.now())) {
  const safeIface = new ethers.Interface(SAFE_ABI);
  const initializer = safeIface.encodeFunctionData("setup", [
    owners, threshold, ethers.ZeroAddress, "0x", SAFE_V141.fallbackHandler, ethers.ZeroAddress, 0, ethers.ZeroAddress,
  ]);
  const factory = new ethers.Contract(SAFE_V141.proxyFactory, FACTORY_ABI, sender);
  const rc = await (await factory.createProxyWithNonce(SAFE_V141.singleton, initializer, saltNonce)).wait();
  for (const log of rc.logs) {
    try {
      const ev = factory.interface.parseLog(log);
      if (ev && ev.name === "ProxyCreation") return ethers.getAddress(ev.args.proxy);
    } catch (_) {}
  }
  throw new Error("Safe creation event not found");
}

/** Hash that the owners must sign for a plain CALL from the Safe. */
async function safeTxHash(safeAddr, provider, to, data, value = 0n) {
  const safe = new ethers.Contract(safeAddr, SAFE_ABI, provider);
  const nonce = await safe.nonce();
  const hash = await safe.getTransactionHash(to, value, data, 0, 0, 0, 0, ethers.ZeroAddress, ethers.ZeroAddress, nonce);
  return { hash, nonce };
}

/** Concatenate ECDSA signatures sorted by signer address ascending (Safe requirement). */
function packSignatures(hash, signerWallets) {
  const sorted = [...signerWallets].sort((a, b) => (BigInt(a.address) < BigInt(b.address) ? -1 : 1));
  return "0x" + sorted.map((w) => {
    const s = w.signingKey.sign(hash);
    return s.r.slice(2) + s.s.slice(2) + (s.v === 27 ? "1b" : "1c");
  }).join("");
}

/** Execute `to.data` as the Safe, signed by `signerWallets`; `sender` pays gas. Returns the receipt. */
async function execViaSafe(safeAddr, sender, signerWallets, to, data, value = 0n) {
  const { hash } = await safeTxHash(safeAddr, sender.provider, to, data, value);
  const sigs = packSignatures(hash, signerWallets);
  const safe = new ethers.Contract(safeAddr, SAFE_ABI, sender);
  const tx = await safe.execTransaction(to, value, data, 0, 0, 0, 0, ethers.ZeroAddress, ethers.ZeroAddress, sigs);
  return tx.wait();
}

/** Calldata helpers for the governance actions (used by scripts and tests). */
const calls = {
  setMagistrate: (addr) => new ethers.Interface(REGISTER_ABI).encodeFunctionData("setMagistrate", [addr]),
  transferOwnership: (addr) => new ethers.Interface(REGISTER_ABI).encodeFunctionData("transferOwnership", [addr]),
  acceptGuardian: () => new ethers.Interface(POOL_ABI).encodeFunctionData("acceptGuardian", []),
  setDepositsPaused: (b) => new ethers.Interface(POOL_ABI).encodeFunctionData("setDepositsPaused", [b]),
  setMaxDepositAmount: (v) => new ethers.Interface(POOL_ABI).encodeFunctionData("setMaxDepositAmount", [v]),
};

/**
 * Either execute a Safe action (testnet: SAFE_SIGNER_KEYS=key1,key2 holds enough owner keys) or print the exact
 * transaction for the owners to sign in the Safe UI (mainnet: keys never touch this machine).
 */
async function runSafeAction({ label, safe, to, data, sender }) {
  const keys = (process.env.SAFE_SIGNER_KEYS || "").split(",").map((k) => k.trim()).filter(Boolean);
  if (keys.length === 0) {
    console.log(`
[${label}] Submit this transaction from the Safe UI (Safe: ${safe}):`);
    console.log(JSON.stringify({ to, value: "0", data, operation: 0 }, null, 2));
    return null;
  }
  const signers = keys.map((k) => new ethers.Wallet(k));
  const rc = await execViaSafe(safe, sender, signers, to, data);
  console.log(`[${label}] executed via Safe, tx ${rc.hash}`);
  return rc;
}

module.exports = {
  runSafeAction, SAFE_V141, SAFE_ABI, REGISTER_ABI, POOL_ABI, createSafe, safeTxHash, packSignatures, execViaSafe, calls };
