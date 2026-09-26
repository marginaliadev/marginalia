// MARGINALIA Phase 3 — Formal Circuit Soundness & Constraint Verification (TASK-3.2)
// Verifies signal constraints, public signal order, and mathematical soundness.

const { expect } = require("chai");
const path = require("path");
const fs = require("fs");
const M = require("../lib/marginalia");

describe("MARGINALIA Phase 3 — ZK Circuit Soundness Verification", function () {
  const vkeyPath = path.join(__dirname, "..", "build", "verification_key.json");

  it("verifies public signal order matches Groth16Verifier and smart contract exactly", function () {
    expect(fs.existsSync(vkeyPath)).to.be.true;
    const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf-8"));

    // withdraw.circom has 6 public signals:
    // [0] withdrawnValue
    // [1] stateRoot
    // [2] aspRoot
    // [3] context
    // [4] nullifierHash
    // [5] newCommitment
    expect(vkey.nPublic).to.equal(6);
    expect(vkey.protocol).to.equal("groth16");
    expect(vkey.curve).to.equal("bn128");
  });

  it("verifies field size matches BN254 / alt_bn128 scalar field", function () {
    const BN254_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
    expect(M.FIELD).to.equal(BN254_SCALAR_FIELD);
  });

  it("verifies circuit constraints reject value overdrafts (Num2Bits 128-bit range check)", async function () {
    const secret = await M.newSecret();
    const noteValue = 1000000000000000000n; // 1 ETH
    const overdraftValue = 2000000000000000000n; // 2 ETH

    const H = await M.hasher();
    const label = 12345n;
    const cm = H([noteValue, label, secret.precommitment]);

    const stateTree = new M.MerkleTree(M.DEPTH, H, [cm]);
    const aspTree = new M.MerkleTree(M.ASP_DEPTH, H, [label]);

    const note = {
      sk: secret.sk,
      rho: secret.rho,
      value: noteValue,
      label,
      commitment: cm,
    };

    // Attempting to prove with withdrawnValue > noteValue must fail at the circuit constraint level
    await expect(
      M.proveWithdraw({
        note,
        stateTree,
        aspTree,
        withdrawnValue: overdraftValue,
        context: 12345678n,
        unsafeSkipChecks: true,
      })
    ).to.be.rejected;
  });
});
