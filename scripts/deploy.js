// npx hardhat run scripts/deploy.js --network <network>
// Env: MAGISTRATE_ADDRESS (optional, defaults to deployer)
const fs = require("fs");
const { ethers, network } = require("hardhat");
const M = require("../lib/marginalia");
const { DEPLOY_DIR, deploymentFile } = require("./common");

async function main() {
  const [deployer] = await ethers.getSigners();
  const magistrate = process.env.MAGISTRATE_ADDRESS || deployer.address;
  console.log(`Network   : ${network.name} (chainId ${(await ethers.provider.getNetwork()).chainId})`);
  console.log(`Deployer  : ${deployer.address}`);
  console.log(`Magistrate: ${magistrate}`);

  const { h2, h3 } = await M.deployHashers(deployer, ethers);
  console.log(`PoseidonT3 (2 inputs): ${await h2.getAddress()}`);
  console.log(`PoseidonT4 (3 inputs): ${await h3.getAddress()}`);

  const verifier = await (await ethers.getContractFactory("Groth16Verifier")).deploy();
  await verifier.waitForDeployment();
  console.log(`Groth16Verifier      : ${await verifier.getAddress()}`);

  const register = await (await ethers.getContractFactory("MagistrateRegister")).deploy(magistrate);
  await register.waitForDeployment();
  console.log(`MagistrateRegister   : ${await register.getAddress()}`);

  const pool = await (
    await ethers.getContractFactory("MarginaliaPool")
  ).deploy(await verifier.getAddress(), await h2.getAddress(), await h3.getAddress(), await register.getAddress());
  await pool.waitForDeployment();
  const receipt = await pool.deploymentTransaction().wait();
  console.log(`MarginaliaPool       : ${await pool.getAddress()}`);

  const out = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    magistrate,
    poseidonT3: await h2.getAddress(),
    poseidonT4: await h3.getAddress(),
    verifier: await verifier.getAddress(),
    register: await register.getAddress(),
    pool: await pool.getAddress(),
    deployBlock: receipt.blockNumber,
  };
  fs.mkdirSync(DEPLOY_DIR, { recursive: true });
  fs.writeFileSync(deploymentFile(), JSON.stringify(out, null, 2));
  console.log(`\nSaved -> ${deploymentFile()}`);
}

main()
  .then(() => process.exit(0)) // snarkjs keeps worker threads alive
  .catch((e) => {
  console.error(e);
  process.exit(1);
});
