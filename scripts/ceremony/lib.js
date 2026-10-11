// MARGINALIA Phase-2 ceremony toolkit (Fase 04 / D-T1, D-T2).
//
// A Groth16 setup is only as trustworthy as its LEAST honest assumption: if every contributor kept their secret ("toxic waste"),
// nobody can forge proofs. Security needs ONE honest contributor, and anyone must be able to check the chain of contributions.
// This library implements the whole life cycle on top of snarkjs and, crucially, a verifier that a third party can run:
//
//   init -> contribute (x N, each on its own machine) -> beacon (public randomness) -> finalize (vkey + Solidity verifier)
//        -> transcript (hashes, contributors) -> verifyTranscript (anyone, from public files only)
//
// Phase 1 (Powers of Tau) is NOT run here: production uses the public Hermez/PSE ptau, whose hash is pinned by the caller.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const snarkjs = require("snarkjs");

// ---------------------------------------------------------------- helpers
function capture() {
  const lines = [];
  return { lines, logger: { debug() {}, info: (m) => lines.push(String(m)), warn: (m) => lines.push("WARN " + m), error: (m) => lines.push("ERROR " + m) } };
}

/** BLAKE2b-512 of a file, streamed (zkeys can be hundreds of MB). */
function hashFile(file, algo = "blake2b512") {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash(algo);
    fs.createReadStream(file).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });
}
const hashText = (s, algo = "blake2b512") => crypto.createHash(algo).update(s).digest("hex");
const norm = (s) => String(s).replace(/\s+/g, "").toLowerCase();

/** Parse the text snarkjs prints while verifying a zkey: circuit hash, contributions (oldest first), beacon parameters. */
function parseVerifyLog(lines) {
  const text = lines.join("\n");
  const circuit = text.match(/Circuit [Hh]ash:\s*\n([\s\S]*?)(?:\n-{5,}|\nWARN|\nERROR|$)/);
  const contributions = [];
  const re = /contribution #(\d+)\s+([^\n:]*):\s*\n((?:[ \t]*[0-9a-f]{8}(?: [0-9a-f]{8}){0,3}[ \t]*\n?){1,4})(?:Beacon generator: ([0-9a-f]+)\nBeacon iterations Exp: (\d+))?/g;
  let m;
  while ((m = re.exec(text))) {
    contributions.push({ index: Number(m[1]), name: m[2].trim(), hash: norm(m[3]), beacon: m[4] ? { generator: m[4], iterationsExp: Number(m[5]) } : null });
  }
  contributions.sort((a, b) => a.index - b.index);
  return { circuitHash: circuit ? norm(circuit[1].split("\n").slice(0, 4).join("")) : null, contributions, ok: /ZKey Ok!/.test(text) };
}

// ---------------------------------------------------------------- steps
/** zkey #0: r1cs + prepared Phase-1 file. Deterministic: anyone can recompute and compare the hash. */
async function init({ r1cs, ptau, out }) {
  const { logger } = capture();
  await snarkjs.zKey.newZKey(r1cs, ptau, out, logger);
  return { file: out, hash: await hashFile(out) };
}

/** One contributor's step. `entropy` must be secret randomness; if omitted 64 random bytes are used. The secret is NOT stored. */
async function contribute({ inZkey, outZkey, name, entropy }) {
  if (!fs.existsSync(inZkey)) throw new Error(`input zkey missing: ${inZkey}`);
  const cap = capture();
  await snarkjs.zKey.contribute(inZkey, outZkey, name, entropy || crypto.randomBytes(64).toString("hex"), cap.logger);
  const m = cap.lines.join("\n").match(/Contribution Hash:\s*\n([\s\S]*?)$/);
  return { file: outZkey, name, contributionHash: m ? norm(m[1]) : null, hash: await hashFile(outZkey) };
}

/** Seal with public randomness unknown to every contributor (e.g. a drand round or a future block hash, announced in advance). */
async function applyBeacon({ inZkey, outZkey, beaconHashHex, iterationsExp = 10, name = "beacon" }) {
  if (!/^[0-9a-fA-F]{32,}$/.test(beaconHashHex)) throw new Error("beacon must be a hex string of at least 16 bytes");
  const cap = capture();
  await snarkjs.zKey.beacon(inZkey, outZkey, name, beaconHashHex, iterationsExp, cap.logger);
  const m = cap.lines.join("\n").match(/Contribution Hash:\s*\n([\s\S]*?)$/);
  return { file: outZkey, contributionHash: m ? norm(m[1]) : null, hash: await hashFile(outZkey) };
}

/** Full verification of one zkey against the circuit and Phase 1; returns the contribution history embedded in the file. */
async function inspect({ r1cs, ptau, zkey }) {
  const cap = capture();
  const ok = await snarkjs.zKey.verifyFromR1cs(r1cs, ptau, zkey, cap.logger);
  const parsed = parseVerifyLog(cap.lines);
  return { ok: !!ok && parsed.ok, ...parsed };
}

/**
 * Verify an ordered list of zkey files (0000, 0001, ...). Each file must be valid for the circuit, must contain exactly one
 * more contribution than its predecessor, and must keep the predecessor's history unchanged (no one can rewrite the past).
 */
async function verifyChain({ r1cs, ptau, files }) {
  const reports = [];
  let prev = null;
  for (let i = 0; i < files.length; i++) {
    const r = await inspect({ r1cs, ptau, zkey: files[i] });
    const problems = [];
    if (!r.ok) problems.push("zkey does not verify against the circuit and ptau");
    if (prev) {
      if (r.circuitHash !== prev.circuitHash) problems.push("circuit hash changed");
      if (r.contributions.length !== prev.contributions.length + 1) problems.push(`expected ${prev.contributions.length + 1} contributions, found ${r.contributions.length}`);
      prev.contributions.forEach((c, k) => { if (!r.contributions[k] || r.contributions[k].hash !== c.hash) problems.push(`history rewritten at contribution #${c.index}`); });
    }
    reports.push({ file: files[i], ok: problems.length === 0, problems, contributions: r.contributions.length });
    prev = r;
  }
  return { ok: reports.every((x) => x.ok), reports };
}

/** Export verification key JSON and the Solidity verifier (same template and naming as scripts/build-circuit.sh). */
async function finalize({ zkey, outDir, circuit, contractName }) {
  fs.mkdirSync(outDir, { recursive: true });
  const vkey = await snarkjs.zKey.exportVerificationKey(zkey);
  const vkeyFile = path.join(outDir, `${circuit}_verification_key.json`);
  fs.writeFileSync(vkeyFile, JSON.stringify(vkey, null, 1));
  const template = fs.readFileSync(path.join(path.dirname(require.resolve("snarkjs")), "..", "templates", "verifier_groth16.sol.ejs"), "utf8");
  let sol = await snarkjs.zKey.exportSolidityVerifier(zkey, { groth16: template });
  if (contractName && contractName !== "Groth16Verifier") sol = sol.replace(/contract Groth16Verifier/, `contract ${contractName}`);
  const solFile = path.join(outDir, `${contractName || "Groth16Verifier"}.sol`);
  fs.writeFileSync(solFile, sol);
  return { vkeyFile, solFile, vkeyHash: hashText(JSON.stringify(vkey)), verifierHash: hashText(sol) };
}

// ---------------------------------------------------------------- transcript
/**
 * rounds: [{ contributor, file, contributionHash, attestation? }] in order; the beacon (if any) is the last contribution.
 * The transcript is the public record: publish it next to the zkeys, the r1cs hash and the ptau source.
 */
async function buildTranscript({ circuit, r1cs, ptau, ptauSource, rounds, beacon, finalZkey, finalization }) {
  const insp = await inspect({ r1cs, ptau, zkey: finalZkey });
  return {
    version: 1,
    circuit,
    createdAt: new Date().toISOString(),
    inputs: { r1csBlake2b: await hashFile(r1cs), ptauBlake2b: await hashFile(ptau), ptauSource, circuitHash: insp.circuitHash },
    rounds: await Promise.all(rounds.map(async (r, i) => ({ index: i + 1, contributor: r.contributor, contributionHash: r.contributionHash, attestation: r.attestation || null, zkeyBlake2b: r.file && fs.existsSync(r.file) ? await hashFile(r.file) : r.zkeyBlake2b || null }))),
    beacon: beacon ? { hash: beacon.hash, source: beacon.source, iterationsExp: beacon.iterationsExp, contributionHash: beacon.contributionHash } : null,
    final: { zkeyBlake2b: await hashFile(finalZkey), vkeyHash: finalization.vkeyHash, verifierHash: finalization.verifierHash, contractName: finalization.contractName || null },
  };
}

/**
 * The check ANYONE can run from public files: r1cs, ptau, final zkey (+ optionally the verifier source).
 * Returns { ok, checks:[{name, ok, detail}] }; every check must pass.
 */
async function verifyTranscript(t, { r1cs, ptau, zkey, verifierSol, minContributors = 1, requireBeacon = true, expectedPtauBlake2b = null }) {
  const checks = [];
  const add = (name, ok, detail = "") => checks.push({ name, ok: !!ok, detail });

  add("transcript version", t.version === 1, `v${t.version}`);
  add("r1cs matches the transcript", (await hashFile(r1cs)) === t.inputs.r1csBlake2b);
  const ptauHash = await hashFile(ptau);
  add("ptau matches the transcript", ptauHash === t.inputs.ptauBlake2b);
  if (expectedPtauBlake2b) add("ptau is the pinned public Phase 1 file", ptauHash === expectedPtauBlake2b, "compare with the Hermez/PSE published hash");
  add("final zkey matches the transcript", (await hashFile(zkey)) === t.final.zkeyBlake2b);

  const insp = await inspect({ r1cs, ptau, zkey });
  add("final zkey verifies against circuit and ptau", insp.ok);
  add("circuit hash matches", insp.circuitHash === t.inputs.circuitHash);

  const expected = t.rounds.map((r) => r.contributionHash);
  const embedded = insp.contributions.filter((c) => !c.beacon).map((c) => c.hash);
  add("every announced contribution is inside the zkey, in order", expected.length === embedded.length && expected.every((h, i) => h === embedded[i]), `${embedded.length} embedded vs ${expected.length} announced`);
  add(`at least ${minContributors} contributions`, embedded.length >= minContributors, `${embedded.length}`);
  const names = t.rounds.map((r) => String(r.contributor).trim().toLowerCase());
  add("contributor names are unique", new Set(names).size === names.length);

  const beaconC = insp.contributions.find((c) => c.beacon);
  if (requireBeacon || t.beacon) {
    add("a random beacon seals the ceremony as the LAST contribution", !!beaconC && beaconC.index === insp.contributions.length, beaconC ? `iterations 2^${beaconC.beacon.iterationsExp}` : "none");
    if (t.beacon && beaconC) {
      add("beacon value matches the transcript", norm(beaconC.beacon.generator) === norm(t.beacon.hash));
      add("beacon contribution hash matches the transcript", !t.beacon.contributionHash || beaconC.hash === t.beacon.contributionHash);
      add("beacon uses >= 2^10 hashing iterations", beaconC.beacon.iterationsExp >= 10);
    }
  }

  // the exported key and verifier must be exactly what the zkey produces (nothing hand-edited)
  const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "ceremony-verify-"));
  const fin = await finalize({ zkey, outDir: tmp, circuit: t.circuit, contractName: t.final.contractName || undefined });
  add("verification key re-exports to the published hash", fin.vkeyHash === t.final.vkeyHash);
  add("Solidity verifier re-exports to the published hash", fin.verifierHash === t.final.verifierHash);
  if (verifierSol) add("the verifier source you hold equals the zkey's export", hashText(fs.readFileSync(verifierSol, "utf8")) === fin.verifierHash);
  fs.rmSync(tmp, { recursive: true, force: true });

  return { ok: checks.every((c) => c.ok), checks };
}

module.exports = { capture, hashFile, hashText, parseVerifyLog, init, contribute, applyBeacon, inspect, verifyChain, finalize, buildTranscript, verifyTranscript };
