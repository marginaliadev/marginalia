// Guards the "no modification of the 0xbow core" rule (migration plan section 2.2): the vendored tree must match its
// manifest, the verifier constants must equal the ceremony verification keys, and any edit must be detected.
const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const TOOL = path.join(ROOT, "scripts", "vendor", "0xbow.js");
const VENDOR = path.join(ROOT, "vendor", "0xbow");
const run = (...args) => spawnSync(process.execPath, [TOOL, ...args], { cwd: ROOT, encoding: "utf8" });

describe("vendored 0xbow core", function () {
  this.timeout(60000);

  it("pins tag v1.2.1 at commit a80836a", () => {
    const m = JSON.parse(fs.readFileSync(path.join(VENDOR, "MANIFEST.json"), "utf8"));
    expect(m.tag).to.equal("v1.2.1");
    expect(m.commit).to.equal("a80836a47451e662f127af17e11430ffa976c234");
    expect(Object.keys(m.files).length).to.be.greaterThan(50);
    expect(m.artifacts["withdraw.zkey"].sha256).to.match(/^[0-9a-f]{64}$/);
    expect(m.artifacts["commitment.zkey"].sha256).to.match(/^[0-9a-f]{64}$/);
  });

  it("every vendored file matches the manifest", () => {
    const r = run("verify");
    expect(r.status, r.stderr).to.equal(0);
  });

  it("verifier constants equal the ceremony verification keys", () => {
    const r = run("vkey");
    expect(r.status, r.stderr).to.equal(0);
    expect(r.stdout).to.contain("WithdrawalVerifier");
    expect(r.stdout).to.contain("CommitmentVerifier");
  });

  it("detects a one-character edit of a fund-moving contract", () => {
    const f = path.join(VENDOR, "packages", "contracts", "src", "contracts", "PrivacyPool.sol");
    const original = fs.readFileSync(f);
    try {
      fs.appendFileSync(f, "\n");
      const r = run("verify");
      expect(r.status).to.equal(1);
      expect(r.stderr).to.contain("modified: packages/contracts/src/contracts/PrivacyPool.sol");
    } finally {
      fs.writeFileSync(f, original);
    }
    expect(run("verify").status).to.equal(0);
  });

  it("detects a swapped verification-key constant", () => {
    const f = path.join(VENDOR, "packages", "contracts", "src", "contracts", "verifiers", "WithdrawalVerifier.sol");
    const original = fs.readFileSync(f, "utf8");
    try {
      fs.writeFileSync(f, original.replace(/(uint256 constant alphax\s*=\s*)(\d)/, (_m, a, d) => a + (d === "9" ? "8" : String(Number(d) + 1))));
      const r = run("vkey");
      expect(r.status).to.equal(1);
      expect(r.stderr).to.contain("WithdrawalVerifier.alphax");
    } finally {
      fs.writeFileSync(f, original);
    }
    expect(run("vkey").status).to.equal(0);
  });

  it("refuses to run without a manifest argument it needs", () => {
    expect(run("sync").status).to.equal(1);
  });
});
