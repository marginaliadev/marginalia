const { expect } = require("chai");
const { ethers } = require("hardhat");
const M = require("../lib/marginalia");

describe("MARGINALIA Multi-Asset Token Pool (ERC-20, Mitigation for L9)", function () {
  let owner, magistrate, alice, bob, relayer;
  let tokenPool, register, h2, h3, verifier, mockToken;
  const ONE_TOKEN = ethers.parseUnits("100", 18);

  async function deployAll() {
    [owner, magistrate, alice, bob, relayer] = await ethers.getSigners();
    ({ h2, h3 } = await M.deployHashers(owner, ethers));
    verifier = await (await ethers.getContractFactory("Groth16Verifier")).deploy();
    register = await (await ethers.getContractFactory("MagistrateRegister")).deploy(magistrate.address);

    tokenPool = await (
      await ethers.getContractFactory("MarginaliaTokenPool")
    ).deploy(await verifier.getAddress(), await h2.getAddress(), await h3.getAddress(), await register.getAddress());

    mockToken = await (await ethers.getContractFactory("MockERC20")).deploy("Marginalia USD", "mUSD");
    await mockToken.mint(alice.address, ethers.parseUnits("10000", 18));
    await mockToken.connect(alice).approve(await tokenPool.getAddress(), ethers.MaxUint256);
  }

  async function depositTokenFrom(signer, amount) {
    const secret = await M.newSecret();
    const tokenAddr = await mockToken.getAddress();
    const tx = await tokenPool.connect(signer).deposit(tokenAddr, amount, secret.precommitment);
    const receipt = await tx.wait();
    return M.noteFromDepositReceipt(tokenPool, receipt, secret);
  }

  async function approve(labels) {
    const aspTree = await M.buildAspTree(labels);
    await register.connect(magistrate).publishRoot(aspTree.root(), "ipfs://dev-erc20");
    return aspTree;
  }

  async function proveToken(note, aspTree, withdrawnValue, w) {
    const stateTree = await M.buildStateTree(tokenPool);
    const tokenAddr = await mockToken.getAddress();
    const context = await tokenPool.computeContext(w, tokenAddr);
    return M.proveWithdraw({ note, stateTree, aspTree, withdrawnValue, context });
  }

  beforeEach(deployAll);

  it("deposits ERC-20 tokens, deducts allowance, and writes leaf into Folio", async function () {
    const balBefore = await mockToken.balanceOf(alice.address);
    const note = await depositTokenFrom(alice, ONE_TOKEN);
    const balAfter = await mockToken.balanceOf(alice.address);

    expect(balBefore - balAfter).to.equal(ONE_TOKEN);
    expect(await mockToken.balanceOf(await tokenPool.getAddress())).to.equal(ONE_TOKEN);
    expect(note.value).to.equal(ONE_TOKEN);
  });

  it("executes shielded withdrawal in ERC-20 token without recipient paying gas", async function () {
    const note = await depositTokenFrom(alice, ONE_TOKEN);
    const aspTree = await approve([note.label]);

    const fee = ethers.parseUnits("1", 18);
    const w = { recipient: bob.address, relayer: relayer.address, fee };
    const { proof } = await proveToken(note, aspTree, ONE_TOKEN, w);

    const tokenAddr = await mockToken.getAddress();
    await expect(tokenPool.connect(relayer).withdraw(w, proof, tokenAddr)).to.emit(tokenPool, "Withdrawn");

    expect(await mockToken.balanceOf(bob.address)).to.equal(ONE_TOKEN - fee);
    expect(await mockToken.balanceOf(relayer.address)).to.equal(fee);
  });

  it("allows depositor to ragequit ERC-20 deposit and reclaim tokens directly", async function () {
    const note = await depositTokenFrom(alice, ONE_TOKEN);
    const nullifier = await M.nullifierOf(note.sk, note.rho);

    const balBefore = await mockToken.balanceOf(alice.address);
    await tokenPool.connect(alice).ragequit(note.label, nullifier, alice.address);
    const balAfter = await mockToken.balanceOf(alice.address);

    expect(balAfter - balBefore).to.equal(ONE_TOKEN);
    expect(await tokenPool.isRagequit(note.label)).to.be.true;
    expect(await tokenPool.nullifierSpent(nullifier)).to.be.true;
  });
});
