// Deploy a throw-away STAGING register + pool on the testnet for drills (reuses the live verifiers and Poseidon hashers).
//   node scripts/deploy-staging.js [PUBLISHER_ADDRESS]    -> notes/staging-deployment.json
// The staging register's Magistrate is PUBLISHER_ADDRESS (default: the deployer). The live deployment is never touched.
require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

(async () => {
  const live = require("../deployments/robinhoodTestnet.json");
  const provider = new ethers.JsonRpcProvider(process.env.RH_TESTNET_RPC_URL, 46630, { staticNetwork: true });
  const deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  const art = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "artifacts/contracts", `${n}.sol`, `${n}.json`)));
  const publisher = process.argv[2] || deployer.address;
  const lp = new ethers.Contract(live.pool, ["function hasher1() view returns (address)", "function hasher2() view returns (address)", "function hasher3() view returns (address)", "function verifier() view returns (address)", "function ragequitVerifier() view returns (address)"], provider);
  const R = art("MagistrateRegister"), P = art("MarginaliaPool");
  const register = await (await new ethers.ContractFactory(R.abi, R.bytecode, deployer).deploy(publisher)).waitForDeployment();
  const pool = await (await new ethers.ContractFactory(P.abi, P.bytecode, deployer).deploy(
    await lp.verifier(), await lp.ragequitVerifier(), await lp.hasher1(), await lp.hasher2(), await lp.hasher3(), await register.getAddress())).waitForDeployment();
  await (await register.setPool(await pool.getAddress(), true)).wait();
  const rc = await pool.deploymentTransaction().wait();
  const out = { network: "robinhoodTestnet-staging", chainId: 46630, deployer: deployer.address, magistrate: publisher, register: await register.getAddress(), pool: await pool.getAddress(), deployBlock: rc.blockNumber };
  fs.mkdirSync(path.join(__dirname, "..", "notes"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "..", "notes", "staging-deployment.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})().then(() => process.exit(0)).catch((e) => { console.error(e.shortMessage || e.message); process.exit(1); });
