// Incident response: pause (or resume) NEW deposits. Withdrawals and ragequit can never be paused. Executed BY THE SAFE.
//   PAUSED=true|false [SAFE_SIGNER_KEYS=k1,k2 on testnet] node scripts/governance/pause-deposits.js
require("dotenv").config();
const { ethers } = require("ethers");
const { calls, runSafeAction } = require("./lib");
const d = require(process.env.DEPLOYMENT_FILE || "../../deployments/robinhoodTestnet.json");

(async () => {
  if (!["true", "false"].includes(process.env.PAUSED)) throw new Error("PAUSED must be true or false");
  const provider = new ethers.JsonRpcProvider(process.env.RH_TESTNET_RPC_URL, 46630, { staticNetwork: true });
  const sender = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  await runSafeAction({ label: "setDepositsPaused", safe: process.env.SAFE, to: process.env.POOL || d.pool, data: calls.setDepositsPaused(process.env.PAUSED === "true"), sender });
})().then(() => process.exit(0)).catch((e) => { console.error(e.shortMessage || e.message); process.exit(1); });
