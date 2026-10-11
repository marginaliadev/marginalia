// The front end selects its chain in one place (frontend/src/lib/chain.ts): testnet by default, mainnet only when asked and configured.
const path = require("path");
const { execFileSync } = require("child_process");
const { expect } = require("chai");

describe("Front-end chain configuration", function () {
  this.timeout(60000);
  let r;
  before(function () {
    r = JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "tests/chain.mts"], { cwd: path.join(__dirname, "..", "frontend"), encoding: "utf8" }));
  });
  it("defaults to the testnet exactly as before", function () {
    expect(r.t).to.include({ key: "testnet", chainId: 46630, chainIdHex: "0xb626", isTestnet: true, configured: true, deployBlock: 129140787 });
    expect(r.t.poolAddress).to.equal("0x340E20C7CBe7eA83d463432ac8FA1e891bdca948");
    expect(r.t.registerAddress).to.equal("0x9a54AaADB10472a930822D635831Ee7aa3488d75");
    expect(r.t.rpcEnvNames[0]).to.equal("RH_TESTNET_RPC_URL");
  });
  it("testnet overrides apply, and an invalid address falls back to the default instead of being used", function () {
    expect(r.tOverride).to.include({ rpcUrl: "https://rpc.example", deployBlock: 5 });
    expect(r.tOverride.poolAddress).to.equal("0x" + "ab".repeat(20));
    expect(r.tBad.poolAddress).to.equal("0x340E20C7CBe7eA83d463432ac8FA1e891bdca948");
  });
  it("mainnet is chain 4663 and NOT configured without addresses and a deploy block (no guessed defaults)", function () {
    expect(r.mBare).to.include({ key: "mainnet", chainId: 4663, chainIdHex: "0x1237", isTestnet: false, configured: false, poolAddress: "", registerAddress: "" });
    expect(r.mHalf.configured).to.equal(false); // deploy block missing
    expect(r.mBare.rpcEnvNames[0]).to.equal("RH_MAINNET_RPC_URL");
  });
  it("mainnet becomes configured only with pool, register and deploy block; its RPC and explorer are mainnet ones", function () {
    expect(r.mFull).to.include({ configured: true, deployBlock: 123456, rpcUrl: "https://paid.example", explorerUrl: "https://robinhoodchain.blockscout.com", publicRpcUrl: "https://robinhood-rpc.publicnode.com" });
  });
  it("only the exact word 'mainnet' switches chain (a typo stays on the safe testnet default)", function () {
    expect(r.typo.key).to.equal("testnet");
  });
});
