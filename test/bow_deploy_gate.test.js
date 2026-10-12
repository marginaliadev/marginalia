// The mainnet deploy path of the 0xbow core must be unable to send a transaction unless every gate is green AND the owner confirms.
// These tests run the real script with an unreachable RPC and fake keys, so any attempt to send would fail loudly instead of reaching a chain.
const { expect } = require("chai");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SCRIPT = path.join(ROOT, "scripts", "bow", "deploy.js");
const KEY = "0x" + "11".repeat(32);
const run = (args, env = {}) => spawnSync(process.execPath, [SCRIPT, ...args], {
  cwd: ROOT, encoding: "utf8", timeout: 60000,
  env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SKIP_NETWORK: "1", ...env },
});

describe("0xbow mainnet deploy gate", function () {
  this.timeout(90000);

  it("refuses an unknown network", () => {
    const r = run(["--artifacts", "x", "--network", "devnet", "--out", "x.json"]);
    expect(r.status).to.equal(1);
    expect(r.stderr).to.match(/--network must be testnet or mainnet/);
  });

  it("mainnet needs its own RPC and its own key (the testnet key is not accepted)", () => {
    let r = run(["--artifacts", "x", "--network", "mainnet"], { DEPLOYER_PRIVATE_KEY: KEY });
    expect(r.status).to.equal(1);
    expect(r.stderr).to.match(/MAINNET_RPC is not set/);
    r = run(["--artifacts", "x", "--network", "mainnet"], { MAINNET_RPC: "http://127.0.0.1:9", DEPLOYER_PRIVATE_KEY: KEY });
    expect(r.status).to.equal(1);
    expect(r.stderr).to.match(/MAINNET_DEPLOYER_PRIVATE_KEY is not set/);
  });

  it("an unreachable or wrong-chain RPC is refused before anything else", () => {
    const r = run(["--artifacts", "x", "--network", "mainnet"], { MAINNET_RPC: "http://127.0.0.1:9", MAINNET_DEPLOYER_PRIVATE_KEY: KEY });
    expect(r.status).to.equal(1);
    expect(r.stdout + r.stderr).to.not.match(/deployer 0x/); // never reached the deployment banner
  });

  it("the old testnet path still names its own chain requirement", () => {
    const r = run(["--artifacts", "x", "--out", "x.json"], { RH_TESTNET_RPC_URL: "http://127.0.0.1:9", DEPLOYER_PRIVATE_KEY: KEY });
    expect(r.status).to.equal(1);
    expect(r.stdout + r.stderr).to.not.match(/wrote /);
  });

  it("the script text keeps the three safeguards (separate key, preflight with D1 ignored, explicit confirmation)", () => {
    const src = require("fs").readFileSync(SCRIPT, "utf8");
    expect(src).to.contain("MAINNET_DEPLOYER_PRIVATE_KEY");
    expect(src).to.match(/preflight\.js"\), "--ignore", "D1"/);
    expect(src).to.contain("CONFIRM !== \"deploy-bow-mainnet\"");
    expect(src).to.contain("a mainnet record is never overwritten");
  });
});
