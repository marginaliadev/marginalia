// The Magistrate worker ships its own ABIs (no build artifacts on Railway); they must equal the compiled contracts.
const path = require("path");
const { expect } = require("chai");

describe("Magistrate worker ABIs", function () {
  for (const n of ["MagistrateRegister", "MarginaliaPool"]) {
    it(`${n} ABI equals the compiled artifact`, function () {
      const shipped = require(path.join(__dirname, "../services/magistrate/abi", `${n}.json`));
      const compiled = require(path.join(__dirname, "../artifacts/contracts", `${n}.sol`, `${n}.json`)).abi;
      expect(shipped).to.deep.equal(compiled);
    });
  }
});

describe("Magistrate worker entry point", function () {
  const { execFileSync } = require("child_process");
  for (const f of ["index.js", "service.js", "store.js", "policy.js"]) {
    it(`services/magistrate/${f} parses`, function () {
      execFileSync(process.execPath, ["--check", path.join(__dirname, "../services/magistrate", f)]);
    });
  }

  it("the worker starts with Supabase configured and reaches the pinner check (no crash before it)", function () {
    const { spawnSync } = require("child_process");
    const env = { ...process.env, MAGISTRATE_PUBLISHER_KEY: "0x" + "a".repeat(64), MAGISTRATE_STORE: "supabase", SUPABASE_URL: "http://127.0.0.1:9", SUPABASE_SERVICE_ROLE_KEY: "k",
      RH_TESTNET_RPC_URL: "http://127.0.0.1:9", MAGISTRATE_STATE_FILE: path.join(require("os").tmpdir(), "magistrate-entry-test.json") };
    delete env.PINATA_JWT; delete env.IPFS_RPC_URL;
    const r = spawnSync(process.execPath, [path.join(__dirname, "../services/magistrate/index.js"), "--once"], { env, encoding: "utf8", timeout: 30000 });
    expect(r.stderr + r.stdout).to.not.match(/SyntaxError/);
  });
});
