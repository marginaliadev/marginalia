const { expect } = require("chai");
const { ethers } = require("hardhat");
const M = require("../lib/marginalia");
const { MersenneRelayer } = require("../lib/relayer");

describe("MARGINALIA Mersenne Courier Relayer (Mitigation for L7)", function () {
  let owner, magistrate, alice, bob, relayerSigner;
  let pool, register, h2, h3, verifier, relayerDaemon;
  const ONE = ethers.parseEther("1");

  async function deployAll() {
    [owner, magistrate, alice, bob, relayerSigner] = await ethers.getSigners();
    ({ h2, h3 } = await M.deployHashers(owner, ethers));
    verifier = await (await ethers.getContractFactory("Groth16Verifier")).deploy();
    register = await (await ethers.getContractFactory("MagistrateRegister")).deploy(magistrate.address);
    pool = await (
      await ethers.getContractFactory("MarginaliaPool")
    ).deploy(await verifier.getAddress(), await h2.getAddress(), await h3.getAddress(), await register.getAddress());

    relayerDaemon = new MersenneRelayer(relayerSigner, pool, { marginBps: 1000 });
  }

  async function depositFrom(signer, value) {
    const secret = await M.newSecret();
    const tx = await pool.connect(signer).deposit(secret.precommitment, { value });
    const receipt = await tx.wait();
    return M.noteFromDepositReceipt(pool, receipt, secret);
  }

  async function approve(labels) {
    const aspTree = await M.buildAspTree(labels);
    await register.connect(magistrate).publishRoot(aspTree.root(), "ipfs://dev");
    return aspTree;
  }

  async function prove(note, aspTree, withdrawnValue, w) {
    const stateTree = await M.buildStateTree(pool);
    const context = await pool.computeContext(w);
    return M.proveWithdraw({ note, stateTree, aspTree, withdrawnValue, context });
  }

  beforeEach(deployAll);

  it("calculates accurate fee quote with configured margin", async function () {
    const gasPrice = ethers.parseUnits("10", "gwei");
    const quote = await relayerDaemon.quoteFee(gasPrice);
    // Base cost: 1,150,000 * 10 gwei = 0.0115 ETH. Margin 10% = 0.00115 ETH. Total = 0.01265 ETH
    const expected = (1150000n * gasPrice * 11000n) / 10000n;
    expect(quote).to.equal(expected);
  });

  it("rejects withdrawal request directed to another relayer address", async function () {
    const note = await depositFrom(alice, ONE);
    const aspTree = await approve([note.label]);
    const fee = ethers.parseEther("0.02");

    const w = { recipient: bob.address, relayer: bob.address, fee }; // Wrong relayer
    const { proof } = await prove(note, aspTree, ONE, w);

    await expect(relayerDaemon.validate(w, proof)).to.be.rejectedWith("Invalid relayer address");
  });

  it("rejects withdrawal request offering insufficient fee", async function () {
    const note = await depositFrom(alice, ONE);
    const aspTree = await approve([note.label]);
    const relayerAddr = await relayerDaemon.getAddress();

    const w = { recipient: bob.address, relayer: relayerAddr, fee: 100n }; // Trivial fee
    const { proof } = await prove(note, aspTree, ONE, w);

    await expect(relayerDaemon.validate(w, proof)).to.be.rejectedWith("Insufficient relayer fee");
  });

  it("successfully relays valid withdrawal without bob touching the pool or paying gas", async function () {
    const note = await depositFrom(alice, ONE);
    const aspTree = await approve([note.label]);
    const relayerAddr = await relayerDaemon.getAddress();
    const fee = ethers.parseEther("0.05");

    const w = { recipient: bob.address, relayer: relayerAddr, fee };
    const { proof } = await prove(note, aspTree, ONE, w);

    const bobBalBefore = await ethers.provider.getBalance(bob.address);
    const relayerBalBefore = await ethers.provider.getBalance(relayerAddr);

    const result = await relayerDaemon.relay(w, proof);
    expect(result.txHash).to.be.properHex(64);
    expect(result.feeReceived).to.equal(fee);

    const bobBalAfter = await ethers.provider.getBalance(bob.address);
    const relayerBalAfter = await ethers.provider.getBalance(relayerAddr);

    // Bob receives exactly withdrawnValue - fee
    expect(bobBalAfter - bobBalBefore).to.equal(ONE - fee);
    // Relayer balance increases by fee minus actual gas cost
    expect(relayerBalAfter - relayerBalBefore).to.equal(result.netProfit);
  });
});
