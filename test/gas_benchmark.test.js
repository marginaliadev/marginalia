// Fase 03 / H5-T1: gas benchmark + regression guard.
// Measures the gas of the three user-facing operations on a fresh local chain and fails if any exceeds the committed
// baseline by more than 2%. After an intentional change run:  UPDATE_GAS_BASELINE=1 npx hardhat test test/gas_benchmark.test.js
const fs = require("fs");
const path = require("path");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const M = require("../lib/marginalia");

const BASELINE_FILE = path.join(__dirname, "gas-baseline.json");
const TOLERANCE = 1.02;

describe("Gas benchmark (regression guard)", function () {
  this.timeout(300000);
  let pool, register, magistrate, alice, bob;
  const ONE = ethers.parseEther("1");

  before(async function () {
    let owner;
    [owner, magistrate, alice, bob] = await ethers.getSigners();
    const { h1, h2, h3 } = await M.deployHashers(owner, ethers);
    const verifier = await (await ethers.getContractFactory("Groth16Verifier")).deploy();
    const rq = await (await ethers.getContractFactory("RagequitVerifier")).deploy();
    register = await (await ethers.getContractFactory("MagistrateRegister")).deploy(magistrate.address);
    pool = await (await ethers.getContractFactory("MarginaliaPool")).deploy(
      await verifier.getAddress(), await rq.getAddress(), await h1.getAddress(), await h2.getAddress(), await h3.getAddress(), await register.getAddress()
    );
    await register.setPool(await pool.getAddress(), true);
  });

  async function deposit(signer) {
    const secret = await M.newSecret();
    const tx = await pool.connect(signer).deposit(secret.precommitment, { value: ONE });
    const rc = await tx.wait();
    return { note: M.noteFromDepositReceipt(pool, rc, secret), gas: Number(rc.gasUsed) };
  }

  it("deposit / withdraw / ragequit gas stays within 2% of the baseline", async function () {
    await deposit(alice); // warm the tree: measure a steady-state insert, not the very first one
    const a = await deposit(alice);
    const b = await deposit(bob);

    const aspTree = await M.buildAspTree([a.note.label]);
    await register.connect(magistrate).approveLabels([a.note.label]);
    await register.connect(magistrate).publishRoot(aspTree.root(), "ipfs://bench");

    const w = { recipient: bob.address, relayer: ethers.ZeroAddress, fee: 0n };
    const stateTree = await M.buildStateTree(pool);
    const { proof } = await M.proveWithdraw({ note: a.note, stateTree, aspTree, withdrawnValue: ONE, context: await pool.computeContext(w) });
    const wRc = await (await pool.connect(alice).withdraw(w, proof)).wait();

    const rqProof = (await M.proveRagequit({ note: b.note })).proof;
    const rRc = await (await pool.connect(bob).ragequit(b.note.label, bob.address, rqProof)).wait();

    const measured = { deposit: a.gas, withdraw: Number(wRc.gasUsed), ragequit: Number(rRc.gasUsed) };
    console.log("      measured gas:", JSON.stringify(measured));

    if (process.env.UPDATE_GAS_BASELINE === "1" || !fs.existsSync(BASELINE_FILE)) {
      fs.writeFileSync(BASELINE_FILE, JSON.stringify(measured, null, 2) + "\n");
      console.log("      baseline written:", BASELINE_FILE);
      return;
    }
    const base = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
    for (const k of Object.keys(measured)) {
      expect(measured[k], `${k} gas regressed vs baseline ${base[k]}`).to.be.at.most(Math.floor(base[k] * TOLERANCE));
    }
  });
});
