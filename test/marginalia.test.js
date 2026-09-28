const { expect } = require("chai");
const { ethers } = require("hardhat");
const M = require("../lib/marginalia");

describe("MARGINALIA shielded pool", function () {
  let owner, magistrate, alice, bob, relayer, mallory;
  let pool, register, h2, h3, verifier;
  const ONE = ethers.parseEther("1");

  async function deployAll() {
    [owner, magistrate, alice, bob, relayer, mallory] = await ethers.getSigners();
    ({ h1, h2, h3 } = await M.deployHashers(owner, ethers));
    verifier = await (await ethers.getContractFactory("Groth16Verifier")).deploy();
    register = await (await ethers.getContractFactory("MagistrateRegister")).deploy(magistrate.address);
    pool = await (
      await ethers.getContractFactory("MarginaliaPool")
    ).deploy(
      await verifier.getAddress(),
      await (await (await ethers.getContractFactory("RagequitVerifier")).deploy()).getAddress(),
      await h1.getAddress(),
      await h2.getAddress(),
      await h3.getAddress(),
      await register.getAddress()
    );
    await register.setPool(await pool.getAddress(), true);
  }

  async function depositFrom(signer, value, secret) {
    secret = secret || (await M.newSecret());
    const tx = await pool.connect(signer).deposit(secret.precommitment, { value });
    const receipt = await tx.wait();
    return M.noteFromDepositReceipt(pool, receipt, secret);
  }

  async function approve(labels) {
    const aspTree = await M.buildAspTree(labels);
    await register.connect(magistrate).approveLabels(labels);
    await register.connect(magistrate).publishRoot(aspTree.root(), "ipfs://dev");
    return aspTree;
  }

  async function prove(note, aspTree, withdrawnValue, w) {
    const stateTree = await M.buildStateTree(pool);
    const context = await pool.computeContext(w);
    return M.proveWithdraw({ note, stateTree, aspTree, withdrawnValue, context });
  }

  beforeEach(deployAll);

  it("off-chain Merkle tree matches the on-chain Folio (empty + after inserts)", async function () {
    const H = await M.hasher();
    expect(new M.MerkleTree(M.DEPTH, H).root()).to.equal(await pool.getLastRoot());
    for (let i = 0; i < 3; i++) await depositFrom(alice, ONE);
    const tree = await M.buildStateTree(pool);
    expect(tree.root()).to.equal(await pool.getLastRoot());
  });

  it("on-chain commitment equals Poseidon(value, label, precommitment)", async function () {
    const note = await depositFrom(alice, ONE);
    const secret = await M.newSecret(note.sk, note.rho);
    expect(note.commitment).to.equal(await M.commitmentOf(ONE, note.label, secret.precommitment));
  });

  it("full withdrawal to a fresh address via a relayer", async function () {
    const note = await depositFrom(alice, ONE);
    await depositFrom(mallory, ONE); // some other traffic in the Circle
    const aspTree = await approve([note.label]);

    const fee = ethers.parseEther("0.01");
    const w = { recipient: bob.address, relayer: relayer.address, fee };
    const { proof } = await prove(note, aspTree, ONE, w);

    const bobBefore = await ethers.provider.getBalance(bob.address);
    const relBefore = await ethers.provider.getBalance(relayer.address);
    // submitted by the relayer: bob never touches the pool
    await expect(pool.connect(relayer).withdraw(w, proof)).to.emit(pool, "Withdrawn");
    expect((await ethers.provider.getBalance(bob.address)) - bobBefore).to.equal(ONE - fee);
    expect(await ethers.provider.getBalance(relayer.address)).to.be.gt(relBefore); // fee minus gas
  });

  it("partial withdrawal, then spend the change note", async function () {
    const note = await depositFrom(alice, ethers.parseEther("2"));
    const aspTree = await approve([note.label]);

    const w1 = { recipient: bob.address, relayer: ethers.ZeroAddress, fee: 0n };
    const r1 = await prove(note, aspTree, ethers.parseEther("0.5"), w1);
    await pool.connect(alice).withdraw(w1, r1.proof);
    expect(r1.changeNote.value).to.equal(ethers.parseEther("1.5"));

    const w2 = { recipient: bob.address, relayer: ethers.ZeroAddress, fee: 0n };
    const r2 = await prove(r1.changeNote, aspTree, ethers.parseEther("1.5"), w2);
    const before = await ethers.provider.getBalance(bob.address);
    await pool.connect(alice).withdraw(w2, r2.proof);
    expect((await ethers.provider.getBalance(bob.address)) - before).to.equal(ethers.parseEther("1.5"));
  });

  it("Axiom I: a Wax Seal cannot be broken twice (double-spend)", async function () {
    const note = await depositFrom(alice, ONE);
    const aspTree = await approve([note.label]);
    const w = { recipient: bob.address, relayer: ethers.ZeroAddress, fee: 0n };
    const { proof } = await prove(note, aspTree, ethers.parseEther("0.4"), w);
    await pool.withdraw(w, proof);
    await expect(pool.withdraw(w, proof)).to.be.revertedWithCustomError(pool, "NullifierAlreadySpent");

    // a fresh proof for the same note also has the same nullifier
    const again = await prove(note, aspTree, ethers.parseEther("0.4"), w);
    await expect(pool.withdraw(w, again.proof)).to.be.revertedWithCustomError(pool, "NullifierAlreadySpent");
  });

  it("Axiom III: an unapproved label cannot produce a proof against the Register", async function () {
    const good = await depositFrom(alice, ONE);
    const bad = await depositFrom(mallory, ONE);
    const aspTree = await approve([good.label]);
    const w = { recipient: mallory.address, relayer: ethers.ZeroAddress, fee: 0n };
    await expect(prove(bad, aspTree, ONE, w)).to.be.rejectedWith(/not approved/);

    // even if mallory builds her own ASP tree containing her label, the root is not the published one
    const fakeAsp = await M.buildAspTree([bad.label]);
    const { proof } = await prove(bad, fakeAsp, ONE, w);
    await expect(pool.withdraw(w, proof)).to.be.revertedWithCustomError(pool, "StaleAspRoot");
  });

  it("front-running: changing recipient or fee invalidates the proof", async function () {
    const note = await depositFrom(alice, ONE);
    const aspTree = await approve([note.label]);
    const w = { recipient: bob.address, relayer: relayer.address, fee: ethers.parseEther("0.01") };
    const { proof } = await prove(note, aspTree, ONE, w);

    const stolen = { ...w, recipient: mallory.address };
    await expect(pool.withdraw(stolen, proof)).to.be.revertedWithCustomError(pool, "InvalidContext");

    // forcing the context to match the new params breaks the SNARK itself
    const forged = { ...proof, pubSignals: [...proof.pubSignals] };
    forged.pubSignals[3] = (await pool.computeContext(stolen)).toString();
    await expect(pool.withdraw(stolen, forged)).to.be.revertedWithCustomError(pool, "InvalidProof");
  });

  it("cannot withdraw more than the note holds", async function () {
    const note = await depositFrom(alice, ONE);
    const aspTree = await approve([note.label]);
    const w = { recipient: bob.address, relayer: ethers.ZeroAddress, fee: 0n };
    // SDK guard
    await expect(prove(note, aspTree, ONE + 1n, w)).to.be.rejectedWith(/exceeds/);
    // and the circuit itself refuses (remaining would wrap around the field and fail the 128-bit range check)
    const stateTree = await M.buildStateTree(pool);
    const context = await pool.computeContext(w);
    await expect(
      M.proveWithdraw({ note, stateTree, aspTree, withdrawnValue: ONE + 1n, context, unsafeSkipChecks: true })
    ).to.be.rejected;
  });

  it("reports gas for deposit and withdraw", async function () {
    const secret = await M.newSecret();
    const dep = await (await pool.connect(alice).deposit(secret.precommitment, { value: ONE })).wait();
    const note = M.noteFromDepositReceipt(pool, dep, secret);
    const aspTree = await approve([note.label]);
    const w = { recipient: bob.address, relayer: ethers.ZeroAddress, fee: 0n };
    const { proof } = await prove(note, aspTree, ONE, w);
    const wd = await (await pool.withdraw(w, proof)).wait();
    console.log(`      gas: deposit=${dep.gasUsed} withdraw=${wd.gasUsed}`);
  });

  it("tampered public signals are rejected by the verifier", async function () {
    const note = await depositFrom(alice, ONE);
    await depositFrom(bob, ONE);
    const aspTree = await approve([note.label]);
    const w = { recipient: bob.address, relayer: ethers.ZeroAddress, fee: 0n };
    const { proof } = await prove(note, aspTree, ethers.parseEther("0.5"), w);
    const tampered = { ...proof, pubSignals: [...proof.pubSignals] };
    tampered.pubSignals[0] = ONE.toString(); // claim more than proven
    await expect(pool.withdraw(w, tampered)).to.be.revertedWithCustomError(pool, "InvalidProof");
  });

  it("rejects withdrawal to zero address (burn prevention)", async function () {
    const note = await depositFrom(alice, ONE);
    const aspTree = await approve([note.label]);
    const w = { recipient: ethers.ZeroAddress, relayer: ethers.ZeroAddress, fee: 0n };
    const { proof } = await prove(note, aspTree, ONE, w);
    await expect(pool.withdraw(w, proof)).to.be.revertedWithCustomError(pool, "InvalidValue");
  });

  it("only the Magistrate can publish Register roots", async function () {
    await expect(register.connect(mallory).publishRoot(123n, "")).to.be.revertedWithCustomError(
      register,
      "NotMagistrate"
    );
  });

  it("note serialization round-trips", async function () {
    const note = await depositFrom(alice, ONE);
    const back = M.parseNote(M.serializeNote(note));
    expect(back.commitment).to.equal(note.commitment);
    expect(back.sk).to.equal(note.sk);
  });

  describe("Ragequit (ZK-proven, burns the genuine nullifier)", function () {
    const rq = (note) => M.proveRagequit({ note }).then((r) => r.proof);

    async function zkWithdraw(note, aspTree, value = ONE) {
      const w = { recipient: bob.address, relayer: ethers.ZeroAddress, fee: 0n };
      const { proof } = await prove(note, aspTree, value, w);
      return pool.connect(alice).withdraw(w, proof);
    }
    const poolBal = async () => ethers.provider.getBalance(await pool.getAddress());

    it("allows original depositor to ragequit and recover funds", async function () {
      const note = await depositFrom(alice, ONE);
      const before = await ethers.provider.getBalance(alice.address);
      const receipt = await (await pool.connect(alice).ragequit(note.label, alice.address, await rq(note))).wait();
      const gas = receipt.gasUsed * receipt.gasPrice;
      expect((await ethers.provider.getBalance(alice.address)) + gas - before).to.equal(ONE);
      expect(await pool.isRagequit(note.label)).to.be.true;
      expect(await pool.nullifierSpent(await M.nullifierOf(note.sk, note.rho))).to.be.true;
      expect(await register.isRevoked(note.label)).to.be.true;
    });

    it("prevents non-depositor from ragequitting (even with a valid copied proof)", async function () {
      const note = await depositFrom(alice, ONE);
      await expect(pool.connect(mallory).ragequit(note.label, mallory.address, await rq(note)))
        .to.be.revertedWithCustomError(pool, "NotOriginalDepositor");
    });

    it("prevents double ragequit", async function () {
      const note = await depositFrom(alice, ONE);
      const proof = await rq(note);
      await pool.connect(alice).ragequit(note.label, alice.address, proof);
      await expect(pool.connect(alice).ragequit(note.label, alice.address, proof))
        .to.be.revertedWithCustomError(pool, "AlreadyRagequit");
    });

    it("rejects a proof for a different note's precommitment", async function () {
      const a = await depositFrom(alice, ONE);
      const other = await depositFrom(alice, ONE);
      await expect(pool.connect(alice).ragequit(a.label, alice.address, await rq(other)))
        .to.be.revertedWithCustomError(pool, "InvalidPrecommitment");
    });

    it("rejects a forged nullifier (tampered public signal)", async function () {
      const note = await depositFrom(alice, ONE);
      const proof = await rq(note);
      proof.pubSignals = [proof.pubSignals[0], "12345"];
      await expect(pool.connect(alice).ragequit(note.label, alice.address, proof))
        .to.be.revertedWithCustomError(pool, "InvalidProof");
    });

    it("zero secrets in calldata", async function () {
      const note = await depositFrom(alice, ONE);
      const tx = await pool.connect(alice).ragequit(note.label, alice.address, await rq(note));
      const data = tx.data.toLowerCase();
      expect(data.includes(note.sk.toString(16).toLowerCase())).to.be.false;
      expect(data.includes(note.rho.toString(16).toLowerCase())).to.be.false;
    });

    it("prevents approval of a label that was already ragequitted", async function () {
      const note = await depositFrom(alice, ONE);
      await pool.connect(alice).ragequit(note.label, alice.address, await rq(note));
      await register.connect(magistrate).approveLabels([note.label]);
      expect(await register.isApproved(note.label)).to.be.false;
    });

    // ---------------- regressions for the audit PoCs (all must REVERT) ----------------
    it("REGRESSION A: withdraw -> ragequit reverts (2-arg publishRoot flow used by scripts)", async function () {
      await depositFrom(mallory, ONE); // victim funds
      const note = await depositFrom(alice, ONE);
      const aspTree = await M.buildAspTree([note.label]);
      await register.connect(magistrate)["publishRoot(uint256,string)"](aspTree.root(), "x");
      await zkWithdraw(note, aspTree);
      await expect(pool.connect(alice).ragequit(note.label, alice.address, await rq(note)))
        .to.be.revertedWithCustomError(pool, "NullifierAlreadySpent");
      expect(await poolBal()).to.equal(ONE);
    });

    it("REGRESSION B: nobody can call register.markRevoked directly", async function () {
      const note = await depositFrom(alice, ONE);
      await expect(register.connect(mallory).markRevoked(note.label))
        .to.be.revertedWithCustomError(register, "NotAuthorised");
    });

    it("REGRESSION C: ragequit -> withdraw with a still-valid ASP root reverts", async function () {
      await depositFrom(mallory, ONE);
      const note = await depositFrom(alice, ONE);
      const aspTree = await approve([note.label]);
      await pool.connect(alice).ragequit(note.label, alice.address, await rq(note));
      await expect(zkWithdraw(note, aspTree)).to.be.revertedWithCustomError(pool, "NullifierAlreadySpent");
      expect(await poolBal()).to.equal(ONE);
    });

    it("REGRESSION: partial withdraw -> ragequit of the original deposit reverts", async function () {
      await depositFrom(mallory, ONE);
      const note = await depositFrom(alice, ethers.parseEther("2"));
      const aspTree = await approve([note.label]);
      await zkWithdraw(note, aspTree, ethers.parseEther("0.5"));
      await expect(pool.connect(alice).ragequit(note.label, alice.address, await rq(note)))
        .to.be.revertedWithCustomError(pool, "NullifierAlreadySpent");
    });

    it("REGRESSION: precommitment-copy griefing is blocked (victim's note cannot be frozen)", async function () {
      const secret = await M.newSecret();
      const note = await depositFrom(alice, ONE, secret);
      // mallory tries to open a dust deposit under alice's public precommitment
      await expect(pool.connect(mallory).deposit(secret.precommitment, { value: 1n }))
        .to.be.revertedWithCustomError(pool, "PrecommitmentReused");
      // alice's exit path is untouched
      await expect(pool.connect(alice).ragequit(note.label, alice.address, await rq(note))).to.emit(pool, "Ragequit");
    });

    it("REGRESSION: front-runner copying a pending ragequit gains nothing", async function () {
      const note = await depositFrom(alice, ONE);
      await approve([note.label]);
      const proof = await rq(note);
      // mallory replays alice's exact calldata args
      await expect(pool.connect(mallory).ragequit(note.label, mallory.address, proof))
        .to.be.revertedWithCustomError(pool, "NotOriginalDepositor");
      // and the proof reveals no sk/rho, so mallory cannot build a withdraw proof either
      await expect(pool.connect(alice).ragequit(note.label, alice.address, proof)).to.emit(pool, "Ragequit");
    });
  });

  describe("Sliding-Window ASP Root Buffer (L5 Mitigation)", function () {
    it("accepts proof generated against a previous root within the 16-root historical window", async function () {
      const note = await depositFrom(alice, ONE);
      const aspTree1 = await approve([note.label]);

      const w = { recipient: bob.address, relayer: ethers.ZeroAddress, fee: 0n };
      const { proof } = await prove(note, aspTree1, ONE, w);

      // Now Magistrate publishes 3 new roots after Alice generated her proof
      for (let i = 1; i <= 3; i++) {
        await register.connect(magistrate).publishRoot(BigInt(990000 + i), `ipfs://root-${i}`);
      }

      // Alice's proof uses aspTree1.root(), which is no longer latestRoot but is within the last 16 roots
      expect(await register.latestRoot()).to.not.equal(aspTree1.root());
      expect(await register.isValidRoot(aspTree1.root())).to.be.true;

      await expect(pool.withdraw(w, proof)).to.emit(pool, "Withdrawn");
    });
  });
});


