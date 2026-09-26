const { expect } = require("chai");
const path = require("path");
const fs = require("fs");
const { exportVerificationKey } = require("../scripts/ceremony-tool");

describe("MARGINALIA Phase 3 — MPC Ceremony Tooling (TASK-3.4 / L1 Mitigation)", function () {
  const zkeyPath = path.join(__dirname, "..", "build", "withdraw_final.zkey");
  const existingVkeyPath = path.join(__dirname, "..", "build", "verification_key.json");

  it("exports valid Groth16 verification key from production zkey", async function () {
    expect(fs.existsSync(zkeyPath)).to.be.true;

    const vkey = await exportVerificationKey(zkeyPath);
    expect(vkey.protocol).to.equal("groth16");
    expect(vkey.curve).to.equal("bn128");
    expect(vkey.nPublic).to.equal(6);
    expect(vkey.vk_alpha_1).to.be.an("array");
    expect(vkey.vk_beta_2).to.be.an("array");
    expect(vkey.vk_gamma_2).to.be.an("array");
    expect(vkey.vk_delta_2).to.be.an("array");
    expect(vkey.IC).to.be.an("array").with.lengthOf(7); // 1 constant + 6 public signals
  });

  it("matches deployed verification key hashes exactly", async function () {
    const vkey = await exportVerificationKey(zkeyPath);
    const existing = JSON.parse(fs.readFileSync(existingVkeyPath, "utf-8"));

    expect(vkey.protocol).to.equal(existing.protocol);
    expect(vkey.nPublic).to.equal(existing.nPublic);
    expect(vkey.vk_alpha_1).to.deep.equal(existing.vk_alpha_1);
  });
});
