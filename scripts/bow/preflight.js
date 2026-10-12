#!/usr/bin/env node
// Go / no-go report for the 0xbow route (read-only, signs nothing). It ADDS to scripts/mainnet-preflight.js and never replaces it:
// the operational gates there (paid screening, Safe/publisher/deployer, legal review, incident drill, launch limits, RPC, clean tree) still apply.
//   node scripts/bow/preflight.js            exit 0 only when every gate here is GO
//   SKIP_NETWORK=1 node scripts/bow/preflight.js
// Manual gates are closed by docs/bow/signoff.json (see signoff.example.json); a missing or incomplete entry is NO-GO.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const TOOL = path.join(ROOT, "scripts", "vendor", "0xbow.js");
const results = [];
const gate = (id, name, status, detail, owner, fix) => results.push({ id, name, status, detail, owner, fix });
const tool = (...a) => spawnSync(process.execPath, [TOOL, ...a], { cwd: ROOT, encoding: "utf8", timeout: 180000 });
const first = (r) => String(r.stderr || r.stdout || "").trim().split("\n").filter(Boolean).slice(0, 2).join(" | ").slice(0, 200);

// ---- automatic gates
{
  const r = tool("verify");
  gate("V1", "Vendored 0xbow files match the manifest", r.status === 0 ? "GO" : "NO-GO", r.status === 0 ? "all files match" : first(r), "engineering", "never edit vendor/0xbow; re-sync from the pinned tag");
}
{
  const r = tool("vkey");
  gate("V2", "Verifier constants equal the ceremony verification keys", r.status === 0 ? "GO" : "NO-GO", r.status === 0 ? "withdraw and commitment verifiers match" : first(r), "engineering", "restore the vendored verifiers");
}
if (process.env.SKIP_NETWORK === "1") {
  gate("V3", "Empty diff against upstream tag v1.2.1", "WARN", "skipped (SKIP_NETWORK=1)", "engineering", "run without SKIP_NETWORK before the go decision");
} else {
  const r = tool("verify", "--upstream");
  gate("V3", "Empty diff against upstream tag v1.2.1", r.status === 0 ? "GO" : "NO-GO", r.status === 0 ? "EMPTY diff, pinned commit confirmed" : first(r), "engineering", "the vendored tree must equal the tag byte for byte");
}
{
  const testnet = path.join(ROOT, "deployments", "bow-robinhoodTestnet.json");
  gate("T1", "Testnet deployment of the unmodified core exists and is recorded", fs.existsSync(testnet) ? "GO" : "NO-GO", fs.existsSync(testnet) ? "deployments/bow-robinhoodTestnet.json" : "missing", "engineering", "node scripts/bow/deploy.js ... then readback.js and e2e.mjs");
}
{
  const f = path.join(ROOT, "deployments", "bow-robinhood.json");
  let ok = false, detail = "no mainnet record (expected until the owner orders the deploy)";
  if (fs.existsSync(f)) { const j = JSON.parse(fs.readFileSync(f, "utf8")); ok = j.chainId === 4663; detail = ok ? "mainnet record present" : `record is for chain ${j.chainId}`; }
  gate("D1", "Fresh mainnet deployment recorded and read back", ok ? "GO" : "NO-GO", detail, "owner", "deploy only after every other gate is GO and the owner orders it; then run readback.js with --expect-owner/--expect-postman");
}
{
  let served = "unknown";
  try {
    const z = fs.readFileSync(path.join(ROOT, "frontend", "src", "lib", "zk-hashes.ts"), "utf8");
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, "vendor", "0xbow", "MANIFEST.json"), "utf8"));
    const pinned = Object.values(m.artifacts).map((a) => a.sha256);
    served = pinned.every((h) => z.includes(h)) ? "upstream" : "other";
  } catch { /* leave unknown */ }
  gate("A1", "The front end serves the upstream proving assets (hashes pinned from the manifest)", served === "upstream" ? "GO" : "NO-GO",
    served === "upstream" ? "served hashes equal the pinned ceremony keys" : "the front end still serves the single-party development assets", "engineering", "migrate the front end to the upstream SDK and artefacts (plan step M3), then regenerate zk-hashes.ts from the manifest");
}

// ---- manual gates (signed off in docs/bow/signoff.json)
const MANUAL = [
  ["S1", "External review of the glue code, configuration and the post-audit delta (Entrypoint, DeployLib, ICreateX, verifier signatures, worker, relayer, SDK wrapper)", "glueReview", "owner + reviewer"],
  ["S2", "Independent verification of the upstream ceremony figures and Phase-1 provenance (the two public sources disagree today)", "ceremonyProvenance", "engineering + independent party"],
  ["S3", "Owner decision signed: upgradeable entrypoint, no cap, no pause, windDown permanent, no timelock at launch, TVL trigger number filled in", "ownerDecision", "owner"],
  ["S4", "Upstream integration suite green on Linux CI (not Windows)", "linuxGate", "engineering"],
  ["S5", "Roles handed over: owner = Safe (>= 2-of-3), postman = dedicated publisher, deployer holds none (readback.js with --expect-*)", "rolesHandedOver", "owner + signers"],
  ["S6", "Incident drill on the new deployment: windDown on a throwaway pool, postman rotation, relayer switched off", "incidentDrill", "owner + signers"],
];
let signoff = {};
try { signoff = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "bow", "signoff.json"), "utf8")); } catch { /* none yet */ }
for (const [id, name, key, owner] of MANUAL) {
  const s = signoff[key];
  const ok = s && s.by && s.date && s.evidence;
  gate(id, name, ok ? "GO" : "NO-GO", ok ? `signed by ${s.by} on ${s.date}` : "no sign-off recorded", owner, `record { by, date, evidence } under "${key}" in docs/bow/signoff.json once it is really done`);
}

// ---- report
const pad = (s, n) => String(s).padEnd(n);
for (const r of results) {
  console.log(`${pad(r.status, 6)} ${pad(r.id, 4)} ${r.name}`);
  if (r.detail) console.log(`       ${r.detail}`);
  if (r.status !== "GO") console.log(`       owner: ${r.owner} · to close: ${r.fix}`);
}
const go = results.filter((r) => r.status === "GO").length, no = results.filter((r) => r.status === "NO-GO").length, warn = results.filter((r) => r.status === "WARN").length;
console.log(`\n${go} GO, ${warn} WARN, ${no} NO-GO -> ${no === 0 && warn === 0 ? "0xbow route gates are green (the operational gates of mainnet-preflight still apply)" : "NOT READY"}`);
process.exit(no === 0 && warn === 0 ? 0 : 1);
