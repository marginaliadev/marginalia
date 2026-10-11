// Replace the Magistrate publisher key (compromise or planned rotation). Executed BY THE SAFE.
//   NEW_PUBLISHER=0x.. [SAFE_SIGNER_KEYS=k1,k2 on testnet] node scripts/governance/rotate-magistrate.js
require("dotenv").config();
const { ethers } = require("ethers");
const { calls, runSafeAction } = require("./lib");
const d = require(process.env.DEPLOYMENT_FILE || "../../deployments/robinhoodTestnet.json");

(async () => {
  const next = process.env.NEW_PUBLISHER;
  if (!ethers.isAddress(next)) throw new Error("NEW_PUBLISHER must be an address");
  const provider = new ethers.JsonRpcProvider(process.env.RH_TESTNET_RPC_URL, 46630, { staticNetwork: true });
  const sender = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider); // only pays gas; has no authority
  await runSafeAction({ label: "setMagistrate", safe: process.env.SAFE, to: process.env.REGISTER || d.register, data: calls.setMagistrate(next), sender });
})().then(() => process.exit(0)).catch((e) => { console.error(e.shortMessage || e.message); process.exit(1); });
