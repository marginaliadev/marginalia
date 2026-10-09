// Mainnet deploy guard (Fase 04): no mainnet deployment unless the verifiers come from a real, publicly verifiable ceremony.
// Used by scripts/deploy.js when chainId == 4663. A development setup (single party, local ptau) can NEVER pass.
const fs = require("fs");
const path = require("path");
const { hashText } = require("./lib");

const ROOT = path.join(__dirname, "..", "..");
const MIN_CONTRIBUTORS = 15; // fixed in code on purpose: lowering it requires a reviewed code change, not an env var
const MIN_BEACON_ITERATIONS_EXP = 10;

/**
 * @param transcripts { withdraw: object, ragequit: object }  parsed transcript.json files
 * @param opts { phase1 (docs/ceremony/phase1.json contents), verifierSources: { withdraw: string, ragequit: string } }
 * @returns string[] problems (empty = allowed)
 */
function ceremonyProblems(transcripts, { phase1, verifierSources }) {
  const problems = [];
  if (!phase1 || !phase1.blake2b) problems.push("docs/ceremony/phase1.json has no pinned blake2b of the public Phase-1 file");
  for (const circuit of ["withdraw", "ragequit"]) {
    const t = transcripts && transcripts[circuit];
    if (!t) { problems.push(`${circuit}: no ceremony transcript supplied`); continue; }
    if (t.circuit !== circuit) problems.push(`${circuit}: transcript is for circuit "${t.circuit}"`);
    if (/dev|rehears|test/i.test(String(t.inputs && t.inputs.ptauSource))) problems.push(`${circuit}: Phase 1 is a development/rehearsal file ("${t.inputs.ptauSource}")`);
    if (phase1 && phase1.blake2b && t.inputs.ptauBlake2b !== phase1.blake2b) problems.push(`${circuit}: Phase-1 hash differs from the pinned public file`);
    if (!Array.isArray(t.rounds) || t.rounds.length < MIN_CONTRIBUTORS) problems.push(`${circuit}: ${t.rounds ? t.rounds.length : 0} contributions, at least ${MIN_CONTRIBUTORS} required`);
    const names = (t.rounds || []).map((r) => String(r.contributor).trim().toLowerCase());
    if (new Set(names).size !== names.length) problems.push(`${circuit}: duplicate contributor identities`);
    if (!t.beacon || !t.beacon.hash || t.beacon.iterationsExp < MIN_BEACON_ITERATIONS_EXP) problems.push(`${circuit}: no random beacon (or fewer than 2^${MIN_BEACON_ITERATIONS_EXP} iterations)`);
    const src = verifierSources && verifierSources[circuit];
    if (src === undefined) problems.push(`${circuit}: verifier source not provided`);
    else if (hashText(src) !== t.final.verifierHash) problems.push(`${circuit}: the verifier contract in contracts/ is NOT the one exported from the ceremony's final zkey`);
  }
  return problems;
}

/** Throws unless the environment points at valid ceremony transcripts that match the verifier sources in contracts/. */
function assertCeremonyBeforeMainnet(env = process.env) {
  const read = (p) => JSON.parse(fs.readFileSync(path.resolve(p), "utf8"));
  const need = (k) => { if (!env[k]) throw new Error(`MAINNET DEPLOY REFUSED: ${k} is not set (a public ceremony transcript is required)`); return env[k]; };
  const transcripts = { withdraw: read(need("CEREMONY_WITHDRAW_TRANSCRIPT")), ragequit: read(need("CEREMONY_RAGEQUIT_TRANSCRIPT")) };
  const verifierSources = {
    withdraw: fs.readFileSync(path.join(ROOT, "contracts", "Groth16Verifier.sol"), "utf8"),
    ragequit: fs.readFileSync(path.join(ROOT, "contracts", "RagequitVerifier.sol"), "utf8"),
  };
  const phase1 = read(path.join(ROOT, "docs", "ceremony", "phase1.json"));
  const problems = ceremonyProblems(transcripts, { phase1, verifierSources });
  if (problems.length) throw new Error("MAINNET DEPLOY REFUSED:\n - " + problems.join("\n - ") + "\nSee docs/ceremony_guide.md");
  return true;
}

module.exports = { ceremonyProblems, assertCeremonyBeforeMainnet, MIN_CONTRIBUTORS };
