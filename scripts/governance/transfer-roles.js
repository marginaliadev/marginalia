// Move governance from the deployer EOA to the Safe (Fase 03 / H3). Run ONCE, from the current owner/guardian.
//   dry run (default): prints the plan and verifies every precondition
//   CONFIRM=transfer-roles SAFE=0x.. PUBLISHER=0x.. node scripts/governance/transfer-roles.js
// Order matters: the irreversible ownership transfer is the very last step.
require("dotenv").config();
const { ethers } = require("ethers");
const { REGISTER_ABI, POOL_ABI, SAFE_ABI, calls, runSafeAction } = require("./lib");

async function main() {
  const d = require(process.env.DEPLOYMENT_FILE || "../../deployments/robinhoodTestnet.json");
  const register = process.env.REGISTER || d.register;
  const poolAddr = process.env.POOL || d.pool;
  const safeAddr = process.env.SAFE;
  const publisher = process.env.PUBLISHER;
  if (!safeAddr || !publisher) throw new Error("SAFE and PUBLISHER are required");

  const provider = new ethers.JsonRpcProvider(process.env.RH_TESTNET_RPC_URL, 46630, { staticNetwork: true });
  const me = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  const reg = new ethers.Contract(register, REGISTER_ABI, me);
  const pool = new ethers.Contract(poolAddr, POOL_ABI, me);
  const safe = new ethers.Contract(safeAddr, SAFE_ABI, provider);

  // ---- preconditions
  const problems = [];
  if ((await provider.getCode(safeAddr)).length <= 2) problems.push("SAFE has no code");
  else {
    const owners = await safe.getOwners();
    const threshold = await safe.getThreshold();
    if (owners.length < 3) problems.push(`Safe has ${owners.length} owners, need >= 3`);
    if (threshold < 2n) problems.push(`Safe threshold is ${threshold}, need >= 2`);
    if (owners.map((o) => o.toLowerCase()).includes(me.address.toLowerCase())) problems.push("the deployer must not be a Safe owner");
    console.log(`Safe ${safeAddr}: ${threshold}-of-${owners.length}`);
  }
  if (publisher.toLowerCase() === me.address.toLowerCase()) problems.push("PUBLISHER must be a dedicated key, not the deployer");
  if ((await reg.owner()).toLowerCase() !== me.address.toLowerCase()) problems.push(`register owner is ${await reg.owner()}, not the signer`);
  if ((await pool.guardian()).toLowerCase() !== me.address.toLowerCase()) problems.push(`pool guardian is ${await pool.guardian()}, not the signer`);
  if (problems.length) throw new Error("Preconditions failed:\n - " + problems.join("\n - "));

  console.log("Plan:\n  1. register.setMagistrate(PUBLISHER)\n  2. pool.transferGuardian(SAFE)\n  3. Safe: pool.acceptGuardian()\n  4. register.transferOwnership(SAFE)   (irreversible, last)");
  if (process.env.CONFIRM !== "transfer-roles") return console.log("\nDry run only. Set CONFIRM=transfer-roles to execute.");

  await (await reg.setMagistrate(publisher)).wait();
  console.log("1 done: Magistrate =", publisher);
  await (await pool.transferGuardian(safeAddr)).wait();
  console.log("2 done: guardian proposed to the Safe");
  await runSafeAction({ label: "3 acceptGuardian", safe: safeAddr, to: poolAddr, data: calls.acceptGuardian(), sender: me });
  if ((await pool.guardian()).toLowerCase() !== safeAddr.toLowerCase()) {
    console.log("\nThe Safe has not accepted the guardian role yet. Re-run step 4 only after it has (ownership transfer is irreversible).");
    return;
  }
  await (await reg.transferOwnership(safeAddr)).wait();
  console.log("4 done: register owner =", safeAddr);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.shortMessage || e.message); process.exit(1); });
