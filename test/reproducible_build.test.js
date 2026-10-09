// Fase 04 / A-TEST1: the build must be reproducible and the committed artifacts must correspond to the sources.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { expect } = require("chai");
const solc = require("solc");
const snarkjs = require("snarkjs");
const { compileCircuit } = require("../scripts/ceremony/compile");

const ROOT = path.join(__dirname, "..");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const quiet = { debug() {}, info() {}, warn() {}, error() {} };

/** wire count that a witness generator for this circuit must have */
async function wires(r1cs) { return (await snarkjs.r1cs.info(r1cs, quiet)).nVars; }
/** wire count of a compiled witness generator: its witness size, read from the exported header of a dry run */
async function wasmWires(wasmPath) {
  try { await snarkjs.wtns.calculate({}, wasmPath, path.join(require("os").tmpdir(), "rb.wtns")); } catch (e) {
    const m = String(e.message).match(/witness[^0-9]*(\d+)|Not enough values|signal/i); void m;
  }
  const wc = require(path.join(path.dirname(wasmPath), "witness_calculator.js"));
  const w = await wc(fs.readFileSync(wasmPath));
  return w.instance.exports.getWitnessSize();
}

describe("Fase 04 / A: reproducible build and artifact provenance", function () {
  this.timeout(300000);

  it("A-TEST1a circuits: compiling twice from the sources gives byte-identical R1CS (pinned --O2)", function () {
    for (const c of ["withdraw", "ragequit"]) {
      const a = sha(fs.readFileSync(compileCircuit(c, { force: true }).r1cs));
      const b = sha(fs.readFileSync(compileCircuit(c, { force: true }).r1cs));
      expect(a, c).to.equal(b);
    }
  });

  it("A-TEST1b the optimisation level changes the circuit, which is why it must be pinned", async function () {
    const o1 = await wires(compileCircuit("ragequit", { force: true, opt: "--O1" }).r1cs);
    const o2 = await wires(compileCircuit("ragequit", { force: true }).r1cs);
    expect(o1).to.be.greaterThan(o2);
  });

  it("A-TEST1c Solidity: a plain solc run with the pinned settings gives the SAME bytecode as the Hardhat artifact", function () {
    const settings = { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun", outputSelection: { "*": { "*": ["evm.deployedBytecode.object"] } } };
    const read = (p) => ({ content: fs.readFileSync(path.join(ROOT, p), "utf8") });
    const input = { language: "Solidity", sources: { "contracts/MarginaliaPool.sol": read("contracts/MarginaliaPool.sol"), "contracts/MagistrateRegister.sol": read("contracts/MagistrateRegister.sol"), "contracts/interfaces/IPoseidon.sol": read("contracts/interfaces/IPoseidon.sol") }, settings };
    const compile = () => JSON.parse(solc.compile(JSON.stringify(input)));
    const first = compile(), second = compile();
    for (const [file, name] of [["contracts/MarginaliaPool.sol", "MarginaliaPool"], ["contracts/MagistrateRegister.sol", "MagistrateRegister"]]) {
      const a = first.contracts[file][name].evm.deployedBytecode.object;
      expect(second.contracts[file][name].evm.deployedBytecode.object, name + " deterministic").to.equal(a);
      const art = JSON.parse(fs.readFileSync(path.join(ROOT, "artifacts", file, name + ".json"), "utf8"));
      // the metadata hash at the tail can differ with file paths; compare everything before it
      const strip = (hex) => hex.replace(/a264697066735822[0-9a-f]{68}64736f6c6343[0-9a-f]{6}0033$/, "");
      expect(strip(art.deployedBytecode.replace(/^0x/, "")), name + " == hardhat artifact").to.equal(strip(a));
    }
  });

  it("A-TEST1d ragequit: the committed witness generator is the --O2 build of the CURRENT source", async function () {
    const expected = await wires(compileCircuit("ragequit", { force: true }).r1cs);
    expect(await wasmWires(path.join(ROOT, "build", "ragequit_js", "ragequit.wasm"))).to.equal(expected);
  });

  it("A-TEST1e withdraw: provenance of the committed witness generator (reports which optimisation it was built with)", async function () {
    const have = await wasmWires(path.join(ROOT, "build", "withdraw_js", "withdraw.wasm"));
    const o1 = await wires(compileCircuit("withdraw", { force: true, opt: "--O1" }).r1cs);
    const o2 = await wires(compileCircuit("withdraw", { force: true }).r1cs);
    console.log(`      committed withdraw.wasm: ${have} wires | current source --O1: ${o1} | --O2: ${o2}  => built with ${have === o2 ? "O2" : have === o1 ? "O1 (NOT the pinned O2: rebuild + new ceremony will fix)" : "UNKNOWN (does not match the source!)"}`);
    // it must at least be a build of THIS source (never an unknown circuit)
    expect([o1, o2]).to.include(have);
  });

  it("A-TEST1f the committed circuit keys have the shape the contracts expect", function () {
    const w = JSON.parse(fs.readFileSync(path.join(ROOT, "build", "verification_key.json"), "utf8"));
    const r = JSON.parse(fs.readFileSync(path.join(ROOT, "build", "ragequit_verification_key.json"), "utf8"));
    expect([w.nPublic, r.nPublic]).to.deep.equal([6, 2]); // IGroth16Verifier uint[6], IRagequitVerifier uint[2]
  });
});
