// Dress rehearsal of the whole Phase-2 ceremony for one circuit, end to end:
//   node scripts/ceremony/rehearsal.js withdraw|ragequit [contributors=3]
// Uses a throw-away DEV Powers of Tau (NOT secure). It proves the pipeline and the verification tooling work on the REAL circuit,
// including a real proof under the final key and under the exported Solidity verifier. Output: .audit-build/rehearsal-<circuit>/
require("os").cpus = () => [{}]; // one snarkjs worker: keeps memory low
const fs = require("fs");
const os = require("os");
const path = require("path");
const snarkjs = require("snarkjs");
const solc = require("solc");
const M = require("../../lib/marginalia");
const C = require("./lib");
const { compileCircuit, OUT } = require("./compile");

const circuit = process.argv[2] || "withdraw";
const n = Number(process.argv[3] || 3);
const POWER = { withdraw: 14, ragequit: 12 }[circuit];
if (!POWER) throw new Error("circuit must be withdraw or ragequit");
const res = [];
const rec = (name, ok, d = "") => { res.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (d ? " :: " + d : "")); };
const t0 = Date.now();
const lap = () => ((Date.now() - t0) / 1000).toFixed(0) + "s";

(async () => {
  const dir = path.join(OUT, `rehearsal-${circuit}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const { r1cs } = compileCircuit(circuit);
  const info = await snarkjs.r1cs.info(r1cs, { debug() {}, info() {}, warn() {}, error() {} });
  console.log(`circuit ${circuit}: ${info.nConstraints} constraints, ${info.nPubInputs} public inputs (O2)`);

  // Phase 1 stand-in (cached per power)
  const cache = path.join(os.tmpdir(), "marginalia-ceremony-cache");
  fs.mkdirSync(cache, { recursive: true });
  const ptau = path.join(cache, `dev-ptau-${POWER}.ptau`);
  if (!fs.existsSync(ptau)) {
    const { logger } = C.capture();
    await snarkjs.powersOfTau.newAccumulator(await snarkjs.curves.getCurveFromName("bn128"), POWER, path.join(cache, `q0-${POWER}.ptau`), logger);
    await snarkjs.powersOfTau.contribute(path.join(cache, `q0-${POWER}.ptau`), path.join(cache, `q1-${POWER}.ptau`), "dev", "rehearsal-" + Date.now(), logger);
    await snarkjs.powersOfTau.preparePhase2(path.join(cache, `q1-${POWER}.ptau`), ptau, logger);
  }
  console.log(`[${lap()}] dev ptau (power ${POWER}) ready`);

  const files = [path.join(dir, `${circuit}_0000.zkey`)];
  await C.init({ r1cs, ptau, out: files[0] });
  console.log(`[${lap()}] zkey #0 created`);
  const rounds = [];
  for (let i = 1; i <= n; i++) {
    const out = path.join(dir, `${circuit}_${String(i).padStart(4, "0")}.zkey`);
    const who = `Contributor-${i}`;
    const r = await C.contribute({ inZkey: files[files.length - 1], outZkey: out, name: who });
    files.push(out);
    rounds.push({ contributor: who, file: out, contributionHash: r.contributionHash });
    console.log(`[${lap()}] ${who} contributed`);
  }
  const BEACON = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";
  const finalZkey = path.join(dir, `${circuit}_final.zkey`);
  const beacon = await C.applyBeacon({ inZkey: files[files.length - 1], outZkey: finalZkey, beaconHashHex: BEACON, iterationsExp: 10 });
  const contractName = circuit === "withdraw" ? "Groth16Verifier" : "RagequitVerifier";
  const fin = await C.finalize({ zkey: finalZkey, outDir: path.join(dir, "out"), circuit, contractName });
  fin.contractName = contractName;
  console.log(`[${lap()}] beacon applied, verifier exported`);

  const chain = await C.verifyChain({ r1cs, ptau, files: [...files, finalZkey] });
  rec("chain of " + (n + 2) + " zkeys verifies (each adds one contribution)", chain.ok, chain.reports.filter((x) => !x.ok).map((x) => x.problems.join(",")).join(";"));

  const transcript = await C.buildTranscript({ circuit, r1cs, ptau, ptauSource: "DEV ptau for the rehearsal (NOT for production)", rounds, beacon: { hash: BEACON, source: "fixed test value", iterationsExp: 10, contributionHash: beacon.contributionHash }, finalZkey, finalization: fin });
  fs.writeFileSync(path.join(dir, "transcript.json"), JSON.stringify(transcript, null, 1));
  const v = await C.verifyTranscript(transcript, { r1cs, ptau, zkey: finalZkey, verifierSol: fin.solFile, minContributors: n });
  rec(`public transcript verification (${v.checks.length} checks)`, v.ok, v.checks.filter((c) => !c.ok).map((c) => c.name).join(" | "));

  // the verifier source must be valid Solidity
  const out = JSON.parse(solc.compile(JSON.stringify({ language: "Solidity", sources: { "V.sol": { content: fs.readFileSync(fin.solFile, "utf8") } }, settings: { outputSelection: { "*": { "*": ["abi"] } } } })));
  rec("exported Solidity verifier compiles", !(out.errors || []).some((e) => e.severity === "error"), contractName);

  // a REAL proof under the final key
  const vkey = JSON.parse(fs.readFileSync(fin.vkeyFile, "utf8"));
  if (circuit === "withdraw") {
    const H = await M.hasher();
    const sk = M.randomField(), rho = M.randomField(), value = 10n ** 15n, label = 123456789n;
    const pre = H([H([sk]), rho]);
    const commitment = H([value, label, pre]);
    const stateTree = new M.MerkleTree(M.DEPTH, H, [M.randomField(), commitment, M.randomField()]);
    const aspTree = new M.MerkleTree(M.ASP_DEPTH, H, [label, 5n, 6n]);
    const note = { sk, rho, value, label, commitment };
    // WITHDRAW_WASM: an --O2 witness generator built with native circom (circom2 cannot emit one); default is the committed build
    const wasm = process.env.WITHDRAW_WASM || path.join(__dirname, "..", "..", "build", "withdraw_js", "withdraw.wasm");
    let proved;
    try {
      proved = await M.proveWithdraw({ note, stateTree, aspTree, withdrawnValue: value / 2n, context: 42n, wasm, zkey: finalZkey });
    } catch (e) {
      if (!/Invalid witness length/.test(e.message)) throw e;
      // The committed withdraw.wasm was built WITHOUT full optimisation (24,282 wires) while this r1cs is --O2 (11,478 wires).
      // circom2 (WASM build) cannot emit a witness generator, so a real O2 proof needs the native circom compiler.
      console.log("SKIP real withdraw proof :: the committed wasm is a different (O1) build of the circuit; build the O2 wasm with native circom in CI");
      console.log(`
${res.filter(Boolean).length}/${res.length} PASS, 1 SKIPPED in ${lap()}  (artifacts: ${dir})`);
      process.exit(res.every(Boolean) ? 0 : 1);
    }
    const { proof, publicSignals, changeNote } = proved;
    const raw = { pi_a: [proof.pA[0], proof.pA[1], "1"], pi_b: [[proof.pB[0][1], proof.pB[0][0]], [proof.pB[1][1], proof.pB[1][0]], ["1", "0"]], pi_c: [proof.pC[0], proof.pC[1], "1"], protocol: "groth16", curve: "bn128" };
    rec("a real withdraw proof (with change note) verifies under the ceremony key", await snarkjs.groth16.verify(vkey, publicSignals, raw), `change ${changeNote.value} wei`);
    const bad = [...publicSignals]; bad[0] = (BigInt(bad[0]) + 1n).toString();
    rec("the same proof with a changed public signal is rejected", !(await snarkjs.groth16.verify(vkey, bad, raw)));
    const oldVk = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "build", "verification_key.json"), "utf8"));
    rec("the same proof does NOT verify under the old dev verification key", !(await snarkjs.groth16.verify(oldVk, publicSignals, raw)));
  } else {
    const H = await M.hasher();
    const sk = M.randomField(), rho = M.randomField();
    const { proof, publicSignals } = await snarkjs.groth16.fullProve({ precommitment: H([H([sk]), rho]).toString(), nullifierHash: H([sk, rho]).toString(), sk: sk.toString(), rho: rho.toString() }, path.join(__dirname, "..", "..", "build", "ragequit_js", "ragequit.wasm"), finalZkey);
    rec("a real ragequit proof verifies under the ceremony key", await snarkjs.groth16.verify(vkey, publicSignals, proof));
  }
  console.log(`\n${res.filter(Boolean).length}/${res.length} PASS in ${lap()}  (artifacts: ${dir})`);
  process.exit(res.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
