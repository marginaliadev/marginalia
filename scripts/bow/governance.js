#!/usr/bin/env node
// Hands the roles of a 0xbow Entrypoint from the deployer to the Safe (OWNER_ROLE) and to the dedicated publisher key (ASP_POSTMAN).
//   dry run (default): checks every precondition and prints the plan
//   CONFIRM=bow-handover SAFE=0x.. PUBLISHER=0x.. node scripts/bow/governance.js deployments/bow-robinhoodTestnet.json
// Order: grant first, renounce last. After the last step the deployer can no longer change anything; this cannot be undone.
// The upstream OWNER_ROLE guards windDownPool, registerPool, withdrawFees and the UUPS upgrade at once; the Safe must be a >= 2-of-3 multisig.
require("dotenv").config();
const fs = require("fs");
const { ethers } = require("ethers");

const file = process.argv[2];
if (!file) { console.error("usage: governance.js <deployment.json>  (env: SAFE, PUBLISHER, CONFIRM=bow-handover)"); process.exit(1); }
const rec = JSON.parse(fs.readFileSync(file, "utf8"));

const ENTRY = [
  "function hasRole(bytes32,address) view returns (bool)",
  "function grantRole(bytes32,address)",
  "function renounceRole(bytes32,address)",
];
const SAFE_ABI = ["function getOwners() view returns (address[])", "function getThreshold() view returns (uint256)"];
const OWNER_ROLE = ethers.id("OWNER_ROLE");
const POSTMAN_ROLE = ethers.id("ASP_POSTMAN");

async function main() {
  const safe = process.env.SAFE, publisher = process.env.PUBLISHER;
  if (!safe || !publisher) throw new Error("SAFE and PUBLISHER are required");
  const mainnet = rec.chainId === 4663;
  if (!mainnet && rec.chainId !== 46630) throw new Error("unsupported chain " + rec.chainId);
  const rpcUrl = mainnet ? (process.env.MAINNET_RPC || "").split(",")[0].trim() : process.env.RH_TESTNET_RPC_URL;
  const keyName = mainnet ? "MAINNET_DEPLOYER_PRIVATE_KEY" : "DEPLOYER_PRIVATE_KEY";
  if (!rpcUrl || !process.env[keyName]) throw new Error((mainnet ? "MAINNET_RPC and " : "RH_TESTNET_RPC_URL and ") + keyName + " are required");
  const provider = new ethers.JsonRpcProvider(rpcUrl, rec.chainId, { staticNetwork: true });
  const me = new ethers.Wallet(process.env[keyName], provider);
  const entry = new ethers.Contract(rec.entrypoint, ENTRY, me);
  const eq = (a, b) => a.toLowerCase() === b.toLowerCase();

  const problems = [];
  if ((await provider.getCode(safe)).length <= 2) problems.push("SAFE has no code");
  else {
    const sc = new ethers.Contract(safe, SAFE_ABI, provider);
    const owners = await sc.getOwners(), threshold = await sc.getThreshold();
    console.log(`Safe ${safe}: ${threshold}-of-${owners.length}`);
    if (owners.length < 3) problems.push(`Safe has ${owners.length} owners, need >= 3`);
    if (threshold < 2n) problems.push(`Safe threshold is ${threshold}, need >= 2`);
    if (owners.some((o) => eq(o, me.address))) problems.push("the deployer must not be a Safe owner");
  }
  if (eq(publisher, me.address) || eq(publisher, safe)) problems.push("PUBLISHER must be a dedicated key: not the deployer and not the Safe");
  if (!(await entry.hasRole(OWNER_ROLE, me.address))) problems.push("the signer does not hold OWNER_ROLE");
  if (problems.length) throw new Error("Preconditions failed:\n - " + problems.join("\n - "));

  console.log("Plan:\n  1. grantRole(ASP_POSTMAN, PUBLISHER)\n  2. grantRole(OWNER_ROLE, SAFE)\n  3. renounceRole(ASP_POSTMAN, deployer)\n  4. renounceRole(OWNER_ROLE, deployer)   <- irreversible");
  if (process.env.CONFIRM !== "bow-handover") return console.log("\nDry run only. Set CONFIRM=bow-handover to execute.");

  const step = async (label, p) => { const r = await (await p).wait(); console.log(`done: ${label}  tx ${r.hash}`); };
  await step("grant postman", entry.grantRole(POSTMAN_ROLE, publisher));
  await step("grant owner", entry.grantRole(OWNER_ROLE, safe));
  if (!(await entry.hasRole(OWNER_ROLE, safe)) || !(await entry.hasRole(POSTMAN_ROLE, publisher))) throw new Error("grants not visible on chain: stopping before the irreversible steps");
  await step("renounce postman (deployer)", entry.renounceRole(POSTMAN_ROLE, me.address));
  await step("renounce owner (deployer)", entry.renounceRole(OWNER_ROLE, me.address));
  console.log(`\nverify with: node scripts/bow/readback.js ${file} --expect-owner ${safe} --expect-postman ${publisher}`);
}
main().catch((e) => { console.error("ERROR:", String(e.message).slice(0, 400)); process.exit(1); });
