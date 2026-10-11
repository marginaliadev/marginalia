// The preflight must keep mainnet BLOCKED until the real gates exist, and the mainnet env template must hold no secrets.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { expect } = require("chai");

const ROOT = path.join(__dirname, "..");

describe("Mainnet preflight", function () {
  this.timeout(60000);
  it("exits non-zero and says BLOCKED while ceremony, audit and Safe gates are open", function () {
    const r = spawnSync(process.execPath, [path.join(ROOT, "scripts/mainnet-preflight.js")], { encoding: "utf8", env: { ...process.env, SKIP_NETWORK: "1", CEREMONY_WITHDRAW_TRANSCRIPT: "", CEREMONY_RAGEQUIT_TRANSCRIPT: "" } });
    expect(r.status).to.equal(1);
    expect(r.stdout).to.include("MAINNET IS BLOCKED");
    for (const gate of ["B1 ", "B2 ", "B4 ", "B6 ", "R7 "]) expect(r.stdout).to.match(new RegExp("NO-GO\s+" + gate));
  });
  it("is read-only: it never signs or sends", function () {
    const src = fs.readFileSync(path.join(ROOT, "scripts/mainnet-preflight.js"), "utf8");
    expect(src).to.not.match(/sendTransaction|eth_sendRawTransaction|new ethers\.Wallet|privateKey|DEPLOYER_PRIVATE_KEY/);
  });
  it(".env.mainnet.example contains no secret-looking values", function () {
    const t = fs.readFileSync(path.join(ROOT, ".env.mainnet.example"), "utf8");
    expect(t).to.not.match(/0x[0-9a-fA-F]{64}/);
    expect(t).to.not.match(/^[A-Z_]+=(?!\s*#)[^\s#]{12,}/m); // an uncommented assignment with a long value
  });
});
