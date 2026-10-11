// Builds the self-contained audit bundle for the auditors: everything in scope + the audit docs, from a COMMITTED state.
//   node scripts/audit/package.js [ref=HEAD]      -> .audit-build/marginalia-audit-<commit8>.zip and its SHA-256
// It uses `git archive`, so the bundle always equals what is committed (nothing from the working tree can leak in: no .env, no keys).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const ref = process.argv[2] || "HEAD";
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();

const PATHS = [
  "contracts", "circuits", "test", "scripts/audit", "scripts/ceremony", "scripts/zk-hashes.js", "scripts/governance",
  "lib", "docs/audit", "docs/threat_model_and_audit_pack.md", "docs/ceremony_guide.md", "docs/ceremony_b1_plan.md", "docs/ceremony",
  "docs/mainnet_readiness.md", "docs/phase3_hardening_report.md", "docs/phase4_audit_ceremony_report.md",
  "hardhat.config.js", "package.json", "package-lock.json", ".github/workflows/ci.yml", "README.md", "LICENSE",
  "frontend/src/lib/zk.ts", "frontend/src/lib/zk-hashes.ts", "services/magistrate",
];
const existing = PATHS.filter((p) => { try { git("cat-file", "-e", `${ref}:${p}`); return true; } catch { return false; } });
const commit = git("rev-parse", ref);
const out = path.join(ROOT, ".audit-build", `marginalia-audit-${commit.slice(0, 8)}.zip`);
fs.mkdirSync(path.dirname(out), { recursive: true });
execFileSync("git", ["archive", "--format=zip", "--prefix=marginalia/", "-o", out, ref, ...existing], { cwd: ROOT });

// refuse to hand out a bundle that contains anything secret-looking
const listing = execFileSync("git", ["ls-tree", "-r", "--name-only", ref, ...existing], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
const bad = listing.filter((f) => /(^|\/)\.env($|\.)|\.key$|private|secret/i.test(f) && !/example/i.test(f));
if (bad.length) { fs.rmSync(out); throw new Error("secret-looking files in the bundle, refusing: " + bad.join(", ")); }

const sha = crypto.createHash("sha256").update(fs.readFileSync(out)).digest("hex");
console.log(`bundle : ${out}\ncommit : ${commit}\nfiles  : ${listing.length}\nsize   : ${(fs.statSync(out).size / 1e6).toFixed(2)} MB\nsha256 : ${sha}`);
