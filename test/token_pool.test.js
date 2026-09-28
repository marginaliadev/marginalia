const { expect } = require("chai");
const { ethers } = require("hardhat");
const M = require("../lib/marginalia");

describe("MARGINALIA Dedicated Token Pool (ERC-20, Hardened Architecture)", function () {
  let owner, magistrate, alice, bob, relayer, mallory;
  let tokenPool, register, h1, h2, h3, verifier, mockToken;
  const ONE_TOKEN = ethers.parseUnits("100", 18);

  async function deployAll() {
    [owner, magistrate, alice, bob, relayer, mallory] = await ethers.getSigners();
    ({ h1, h2, h3 } = await M.deployHashers(owner, ethers));
    verifier = await (await ethers.getContractFactory("Groth16Verifier")).deploy();
    register = await (await ethers.getContractFactory("MagistrateRegister")).deploy(magistrate.address);

    mockToken = await (await ethers.getContractFactory("MockERC20")).deploy("Marginalia USD", "mUSD");

    tokenPool = await (
      await ethers.getContractFactory("MarginaliaTokenPool")
    ).deploy(
      await mockToken.getAddress(),
      await verifier.getAddress(),
      await (await (await ethers.getContractFactory("RagequitVerifier")).deploy()).getAddress(),
      await h1.getAddress(),
      await h2.getAddress(),
      await h3.getAddress(),
      await register.getAddress()
    );
    await register.setPool(await tokenPool.getAddress(), true);

    await mockToken.mint(alice.address, ethers.parseUnits("10000", 18));
    await mockToken.connect(alice).approve(await tokenPool.getAddress(), ethers.MaxUint256);
  }

  async function depositTokenFrom(signer, amount) {
    const secret = await M.newSecret();
    const tx = await tokenPool.connect(signer).deposit(amount, secret.precommitment);
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
    const context = await tokenPool.computeContext(w);
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

    await expect(tokenPool.connect(relayer).withdraw(w, proof)).to.emit(tokenPool, "Withdrawn");

    expect(await mockToken.balanceOf(bob.address)).to.equal(ONE_TOKEN - fee);
    expect(await mockToken.balanceOf(relayer.address)).to.equal(fee);
  });

  it("allows depositor to ragequit ERC-20 deposit and reclaim tokens directly", async function () {
    const note = await depositTokenFrom(alice, ONE_TOKEN);

    const balBefore = await mockToken.balanceOf(alice.address);
    await tokenPool.connect(alice).ragequit(note.label, alice.address, (await M.proveRagequit({ note })).proof);
    const balAfter = await mockToken.balanceOf(alice.address);

    expect(balAfter - balBefore).to.equal(ONE_TOKEN);
    expect(await tokenPool.isRagequit(note.label)).to.be.true;
    expect(await register.isRevoked(note.label)).to.be.true;
  });

  it("REGRESSION: withdraw then ragequit on an ERC-20 note reverts (genuine nullifier burnt)", async function () {
    const note = await depositTokenFrom(alice, ONE_TOKEN);
    const aspTree = await approve([note.label]);
    const w = { recipient: bob.address, relayer: ethers.ZeroAddress, fee: 0n };
    const { proof } = await proveToken(note, aspTree, ONE_TOKEN, w);
    await tokenPool.connect(alice).withdraw(w, proof);

    const rq = await M.proveRagequit({ note });
    await expect(
      tokenPool.connect(alice).ragequit(note.label, alice.address, rq.proof)
    ).to.be.revertedWithCustomError(tokenPool, "NullifierAlreadySpent");
  });

  it("prevents non-depositor from ragequitting ERC-20 deposit", async function () {
    const note = await depositTokenFrom(alice, ONE_TOKEN);
    await expect(
      tokenPool.connect(mallory).ragequit(note.label, mallory.address, (await M.proveRagequit({ note })).proof)
    ).to.be.revertedWithCustomError(tokenPool, "NotOriginalDepositor");
  });
});
