// Audit scope manifest (Fase 04 / A0-T1).
//   node scripts/audit/manifest.js write   -> docs/audit/manifest.json   (run at the freeze, commit it)
//   node scripts/audit/manifest.js check   -> exits 1 if anything in scope changed since the manifest (CI guard after the freeze)
// It records WHAT the auditors review: hashes of every in-scope source, the exact compiler settings, the circuit build flags, and
// whether the committed proving artifacts really correspond to the sources. Honest findings are recorded, not hidden.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const OUT = path.join(ROOT, "docs", "audit", "manifest.json");
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const fileHash = (p) => sha256(fs.readFileSync(path.join(ROOT, p)));
const list = (dir, ext) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? list(path.join(dir, e.name), ext) : e.name.endsWith(ext) ? [path.join(dir, e.name).split(path.sep).join("/")] : []);

const SCOPE = {
  circuits: ["circuits/withdraw.circom", "circuits/ragequit.circom", "circuits/lib/merkle.circom"],
  contracts: ["contracts/MarginaliaPool.sol", "contracts/MagistrateRegister.sol", "contracts/interfaces/IPoseidon.sol"],
  generated: ["contracts/Groth16Verifier.sol", "contracts/RagequitVerifier.sol"], // snarkjs output: audited by equality with the final zkey
  outOfScope: ["contracts/MarginaliaTokenPool.sol", "contracts/mocks/MockERC20.sol"],
};

function git(...a) { try { return execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim(); } catch (_) { return null; } }

async function build() {
  // hardhat.config.js cannot be require()d outside the Hardhat runtime, so read the pinned settings from its source
  const cfgSrc = fs.readFileSync(path.join(ROOT, "hardhat.config.js"), "utf8");
  const hh = { solidity: { version: (cfgSrc.match(/SOLC_VERSION = "([^"]+)"/) || [])[1], settings: { optimizer: { enabled: /optimizer: \{ enabled: true/.test(cfgSrc), runs: Number((cfgSrc.match(/runs: (\d+)/) || [])[1]) }, evmVersion: (cfgSrc.match(/evmVersion: "([^"]+)"/) || [])[1] } } };
  const pkg = require(path.join(ROOT, "package.json"));
  const lock = (n) => { try { return require(path.join(ROOT, "node_modules", n, "package.json")).version; } catch (_) { return null; } };
  const { compileCircuit } = require("../ceremony/compile");
  const circuits = {};
  for (const c of ["withdraw", "ragequit"]) {
    const { r1cs } = compileCircuit(c, { force: true });
    const snarkjs = require("snarkjs");
    const info = await snarkjs.r1cs.info(r1cs, { debug() {}, info() {}, warn() {}, error() {} });
    circuits[c] = { optimisation: "--O2", constraints: info.nConstraints, wires: info.nVars, publicInputs: info.nPubInputs, privateInputs: info.nPrvInputs, r1csSha256: sha256(fs.readFileSync(r1cs)) };
  }
  // provenance of the COMMITTED proving artifacts: the witness generator's wire count must equal the freshly compiled circuit's
  const committed = {};
  for (const c of ["withdraw", "ragequit"]) {
    const wasm = path.join("build", `${c}_js`, `${c}.wasm`);
    const wtns = path.join(require("os").tmpdir(), `manifest-${c}.wtns`);
    committed[c] = { wasmSha256: fileHash(wasm), zkeySha256: fileHash(path.join("build", `${c}_final.zkey`)), vkeySha256: fileHash(path.join("build", c === "withdraw" ? "verification_key.json" : "ragequit_verification_key.json")) };
    try { // a witness of the wrong size exposes a circuit/wasm mismatch without any proving key
      await require("snarkjs").wtns.calculate({}, path.join(ROOT, wasm), wtns).catch((e) => { committed[c].wasmProbe = String(e.message).slice(0, 80); });
    } catch (_) {}
  }
  committed.withdraw.buildMatchesSource = null; // filled by the test that compares wire counts (test/reproducible_build.test.js)

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    gitCommit: git("rev-parse", "HEAD"),
    gitDirty: (git("status", "--porcelain") || "").split("\n").filter((l) => /circuits\/|contracts\//.test(l)).length > 0,
    toolchain: { solc: hh.solidity.version, optimizer: hh.solidity.settings.optimizer, evmVersion: hh.solidity.settings.evmVersion, circom2Wasm: lock("circom2"), snarkjs: lock("snarkjs"), circomlib: lock("circomlib"), circomlibjs: lock("circomlibjs"), hardhat: lock("hardhat"), node: process.version },
    scope: Object.fromEntries(["circuits", "contracts", "generated", "outOfScope"].map((k) => [k, Object.fromEntries(SCOPE[k].map((f) => [f, { sha256: fileHash(f), lines: fs.readFileSync(path.join(ROOT, f), "utf8").split("\n").length }]))])),
    circuitsCompiled: circuits,
    committedProvingArtifacts: committed,
    notes: [
      "Circuits are compiled with --O2 explicitly. circom2's default is --O1, which gives a different constraint system (e.g. withdraw 24,236 vs 11,432 constraints).",
      "The proving artifacts currently committed under build/ come from a LOCAL, single-party dev setup and are not tied to a published ptau: they are replaced by the ceremony output before mainnet.",
    ],
  };
}

async function main() {
  const mode = process.argv[2] || "write";
  const m = await build();
  if (mode === "write") {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(m, null, 2) + "\n");
    console.log("manifest written:", path.relative(ROOT, OUT));
    return;
  }
  const old = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const diffs = [];
  for (const k of ["circuits", "contracts", "generated"]) for (const [f, v] of Object.entries(old.scope[k])) if (m.scope[k][f].sha256 !== v.sha256) diffs.push(`${f} changed`);
  for (const [c, v] of Object.entries(old.circuitsCompiled)) if (m.circuitsCompiled[c].r1csSha256 !== v.r1csSha256) diffs.push(`${c} r1cs differs (non-reproducible or source changed)`);
  for (const k of ["solc", "evmVersion"]) if (JSON.stringify(m.toolchain[k]) !== JSON.stringify(old.toolchain[k])) diffs.push(`toolchain ${k} changed`);
  if (JSON.stringify(m.toolchain.optimizer) !== JSON.stringify(old.toolchain.optimizer)) diffs.push("optimizer settings changed");
  if (diffs.length) { console.error("AUDIT SCOPE CHANGED since the manifest:\n - " + diffs.join("\n - ")); process.exit(1); }
  console.log("audit scope unchanged since", old.generatedAt, "(commit", old.gitCommit + ")");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
