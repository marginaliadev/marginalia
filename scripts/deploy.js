// npx hardhat run scripts/deploy.js --network <network>
// Env: MAGISTRATE_ADDRESS (optional, defaults to deployer)
const fs = require("fs");
const { ethers, network } = require("hardhat");
const M = require("../lib/marginalia");
const { DEPLOY_DIR, deploymentFile } = require("./common");

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  if (chainId === 4663) require("./ceremony/mainnet-guard").assertCeremonyBeforeMainnet(); // dev-setup verifiers can never reach mainnet
  const magistrate = process.env.MAGISTRATE_ADDRESS || deployer.address;
  console.log(`Network   : ${network.name} (chainId ${(await ethers.provider.getNetwork()).chainId})`);
  console.log(`Deployer  : ${deployer.address}`);
  console.log(`Magistrate: ${magistrate}`);

  const { h1, h2, h3 } = await M.deployHashers(deployer, ethers);
  console.log(`PoseidonT2 (1 input) : ${await h1.getAddress()}`);
  console.log(`PoseidonT3 (2 inputs): ${await h2.getAddress()}`);
  console.log(`PoseidonT4 (3 inputs): ${await h3.getAddress()}`);

  const verifier = await (await ethers.getContractFactory("Groth16Verifier")).deploy();
  await verifier.waitForDeployment();
  console.log(`Groth16Verifier      : ${await verifier.getAddress()}`);

  const rqVerifier = await (await ethers.getContractFactory("RagequitVerifier")).deploy();
  await rqVerifier.waitForDeployment();
  console.log(`RagequitVerifier     : ${await rqVerifier.getAddress()}`);

  const register = await (await ethers.getContractFactory("MagistrateRegister")).deploy(magistrate);
  await register.waitForDeployment();
  console.log(`MagistrateRegister   : ${await register.getAddress()}`);

  const pool = await (
    await ethers.getContractFactory("MarginaliaPool")
  ).deploy(
    await verifier.getAddress(),
    await rqVerifier.getAddress(),
    await h1.getAddress(),
    await h2.getAddress(),
    await h3.getAddress(),
    await register.getAddress()
  );
  await pool.waitForDeployment();
  const receipt = await pool.deploymentTransaction().wait();
  console.log(`MarginaliaPool       : ${await pool.getAddress()}`);

  // Authorise the pool to revoke labels on ragequit (register owner = deployer).
  await (await register.setPool(await pool.getAddress(), true)).wait();
  console.log(`Register.setPool(pool, true) done`);

  const out = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    magistrate,
    poseidonT3: await h2.getAddress(),
    poseidonT4: await h3.getAddress(),
    verifier: await verifier.getAddress(),
    ragequitVerifier: await rqVerifier.getAddress(),
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
