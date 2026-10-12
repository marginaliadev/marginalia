#!/usr/bin/env node
// Vendoring and verification tool for the unmodified 0xbow Privacy Pools core (migration plan, steps M1 and section 9).
//
//   sync   --src <checkout at the pinned tag>        copy the allow-listed files into vendor/0xbow and write MANIFEST.json
//   verify [--upstream]                              files on disk == manifest; with --upstream also re-clone the tag and require an EMPTY diff
//   vkey                                             the constants in the vendored verifiers equal the ceremony verification keys
//   artifacts [--dir <dir>]                          sha256 of the served proving assets equals the pinned values (default: fetch from the pinned commit)
//
// The vendored code is never edited. The only change this repository may make to it is an import-path remapping, and
// that is listed in vendor/0xbow/REMAPPINGS.md (not in the code). Anything else fails `verify --upstream`.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cp = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const VENDOR = path.join(ROOT, "vendor", "0xbow");
const MANIFEST = path.join(VENDOR, "MANIFEST.json");
const REPO = "https://github.com/0xbow-io/privacy-pools-core.git";
const TAG = "v1.2.1";
const COMMIT = "a80836a47451e662f127af17e11430ffa976c234";

// Allow-list: source code and public verification keys only. Proving keys and wasm are large binaries: they are pinned by hash.
const INCLUDE_DIRS = [
  "packages/contracts/src", "packages/contracts/script", "packages/contracts/test",
  "packages/circuits/circuits", "packages/circuits/trusted-setup/final-keys",
];
const INCLUDE_FILES = [
  "LICENSE", "SECURITY.md", "packages/contracts/foundry.toml", "packages/contracts/remappings.txt",
  "packages/contracts/package.json", "packages/circuits/package.json", "packages/circuits/README.md",
];
const EXCLUDE = (rel) => /\.(zkey|wasm|r1cs|sym)$/.test(rel) || /(^|\/)(node_modules|out|cache|broadcast)(\/|$)/.test(rel);

// Binary proving assets pinned by hash, with the path inside the pinned upstream commit.
const ARTIFACT_PATHS = {
  "withdraw.zkey": "packages/circuits/trusted-setup/final-keys/withdraw.zkey",
  "commitment.zkey": "packages/circuits/trusted-setup/final-keys/commitment.zkey",
  "withdraw.wasm": "packages/circuits/build/withdraw/withdraw_js/withdraw.wasm",
  "commitment.wasm": "packages/circuits/build/commitment/commitment_js/commitment.wasm",
};

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const posix = (p) => p.split(path.sep).join("/");

function walk(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, base));
    else out.push(posix(path.relative(base, p)));
  }
  return out.sort();
}

function listSource(src) {
  const files = [];
  for (const d of INCLUDE_DIRS) {
    const abs = path.join(src, d);
    if (fs.existsSync(abs)) for (const f of walk(abs, src)) if (!EXCLUDE(f)) files.push(f);
  }
  for (const f of INCLUDE_FILES) if (fs.existsSync(path.join(src, f))) files.push(f);
  return [...new Set(files)].sort();
}

function hashTree(dir, files) {
  const o = {};
  for (const f of files) o[f] = sha256(fs.readFileSync(path.join(dir, f)));
  return o;
}

function readManifest() {
  if (!fs.existsSync(MANIFEST)) throw new Error("vendor/0xbow/MANIFEST.json not found: run `sync` first");
  return JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
}

function cloneTag(into) {
  cp.execFileSync("git", ["clone", "-q", "--depth", "1", "--branch", TAG, REPO, into], { stdio: "inherit" });
  const head = cp.execFileSync("git", ["-C", into, "rev-parse", "HEAD"]).toString().trim();
  if (head !== COMMIT) throw new Error(`tag ${TAG} resolves to ${head}, expected ${COMMIT}: the tag moved or the pin is wrong`);
}

function cmdSync(args) {
  const i = args.indexOf("--src");
  if (i < 0) throw new Error("--src <checkout> is required");
  const src = path.resolve(args[i + 1]);
  const head = cp.execFileSync("git", ["-C", src, "rev-parse", "HEAD"]).toString().trim();
  if (head !== COMMIT) throw new Error(`source is at ${head}, expected ${COMMIT} (${TAG})`);
  const dirty = cp.execFileSync("git", ["-C", src, "status", "--porcelain"]).toString().trim();
  if (dirty) throw new Error("the source checkout has uncommitted changes (a build workaround?); sync from a pristine clone of the tag: " + dirty.split(/\r?\n/).slice(0, 5).join(" | "));
  fs.rmSync(VENDOR, { recursive: true, force: true });
  const files = listSource(src);
  for (const f of files) {
    const dst = path.join(VENDOR, f);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(src, f), dst);
  }
  const artifacts = {};
  for (const [name, rel] of Object.entries(ARTIFACT_PATHS)) {
    const p = path.join(src, rel);
    if (fs.existsSync(p)) { const b = fs.readFileSync(p); artifacts[name] = { path: rel, bytes: b.length, sha256: sha256(b) }; }
  }
  const manifest = { source: REPO, tag: TAG, commit: COMMIT, files: hashTree(VENDOR, files), artifacts };
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`vendored ${files.length} files from ${TAG} (${COMMIT.slice(0, 7)}), ${Object.keys(artifacts).length} artefacts pinned by hash`);
}

function cmdVerify(args) {
  const m = readManifest();
  const problems = [];
  const onDisk = new Set(walk(VENDOR).filter((f) => f !== "MANIFEST.json" && f !== "REMAPPINGS.md"));
  for (const [f, h] of Object.entries(m.files)) {
    const p = path.join(VENDOR, f);
    if (!fs.existsSync(p)) problems.push(`missing: ${f}`);
    else if (sha256(fs.readFileSync(p)) !== h) problems.push(`modified: ${f}`);
    onDisk.delete(f);
  }
  for (const f of onDisk) problems.push(`not in manifest: ${f}`);
  if (m.commit !== COMMIT || m.tag !== TAG) problems.push(`manifest pin ${m.tag}/${m.commit} differs from the tool pin ${TAG}/${COMMIT}`);
  if (args.includes("--upstream")) {
    const tmp = fs.mkdtempSync(path.join(process.env.VENDOR_TMP || require("os").tmpdir(), "bow-"));
    try {
      cloneTag(tmp);
      const up = hashTree(tmp, listSource(tmp));
      for (const f of new Set([...Object.keys(up), ...Object.keys(m.files)])) {
        if (up[f] === undefined) problems.push(`not upstream: ${f}`);
        else if (m.files[f] === undefined) problems.push(`upstream file missing from vendor: ${f}`);
        else if (up[f] !== m.files[f]) problems.push(`differs from upstream ${TAG}: ${f}`);
      }
      for (const [name, a] of Object.entries(m.artifacts)) {
        const p = path.join(tmp, a.path);
        if (!fs.existsSync(p)) problems.push(`artefact absent upstream: ${name}`);
        else if (sha256(fs.readFileSync(p)) !== a.sha256) problems.push(`artefact hash differs upstream: ${name}`);
      }
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  if (problems.length) { console.error("VENDOR VERIFY FAILED:\n  " + problems.join("\n  ")); process.exit(1); }
  console.log(`vendor/0xbow OK: ${Object.keys(m.files).length} files match the manifest${args.includes("--upstream") ? " and an EMPTY diff against upstream " + TAG : ""}`);
}

// Solidity constants in the snarkjs verifier template: G2 coordinates are stored as (x1,x2),(y1,y2) = (c[0][1],c[0][0]),(c[1][1],c[1][0]).
function verifierConstants(src) {
  const c = {};
  for (const m of src.matchAll(/uint256 constant (\w+)\s*=\s*(\d+);/g)) c[m[1]] = m[2];
  return c;
}
function expectedConstants(vk) {
  const e = { alphax: vk.vk_alpha_1[0], alphay: vk.vk_alpha_1[1] };
  for (const [n, k] of [["beta", "vk_beta_2"], ["gamma", "vk_gamma_2"], ["delta", "vk_delta_2"]]) {
    e[n + "x1"] = vk[k][0][1]; e[n + "x2"] = vk[k][0][0]; e[n + "y1"] = vk[k][1][1]; e[n + "y2"] = vk[k][1][0];
  }
  vk.IC.forEach((p, i) => { e[`IC${i}x`] = p[0]; e[`IC${i}y`] = p[1]; });
  return e;
}
function cmdVkey() {
  const pairs = [["withdraw", "WithdrawalVerifier"], ["commitment", "CommitmentVerifier"]];
  const problems = [];
  for (const [circuit, contract] of pairs) {
    const vk = JSON.parse(fs.readFileSync(path.join(VENDOR, `packages/circuits/trusted-setup/final-keys/${circuit}.vkey`), "utf8"));
    const sol = fs.readFileSync(path.join(VENDOR, `packages/contracts/src/contracts/verifiers/${contract}.sol`), "utf8");
    const got = verifierConstants(sol), want = expectedConstants(vk);
    for (const [k, v] of Object.entries(want)) if (got[k] !== v) problems.push(`${contract}.${k} differs from ${circuit}.vkey`);
    const ic = Object.keys(got).filter((k) => /^IC\d+x$/.test(k)).length;
    if (ic !== vk.IC.length) problems.push(`${contract}: ${ic} IC points in the contract, ${vk.IC.length} in the key`);
    console.log(`${contract}: ${Object.keys(want).length} constants checked against ${circuit}.vkey (nPublic=${vk.nPublic})`);
  }
  if (problems.length) { console.error("VKEY CHECK FAILED:\n  " + problems.join("\n  ")); process.exit(1); }
  console.log("verifier constants == ceremony verification keys");
}

function cmdArtifacts(args) {
  const m = readManifest();
  const i = args.indexOf("--dir");
  const dir = i >= 0 ? path.resolve(args[i + 1]) : null;
  const problems = [];
  let tmp = null;
  try {
    let base = dir;
    if (!dir) { tmp = fs.mkdtempSync(path.join(process.env.VENDOR_TMP || require("os").tmpdir(), "bow-")); cloneTag(tmp); base = tmp; }
    for (const [name, a] of Object.entries(m.artifacts)) {
      const p = dir ? path.join(base, name) : path.join(base, a.path);
      if (!fs.existsSync(p)) { problems.push(`missing: ${name}`); continue; }
      const h = sha256(fs.readFileSync(p));
      if (h !== a.sha256) problems.push(`${name}: ${h} != pinned ${a.sha256}`);
      else console.log(`${name}: sha256 ${h} matches the pin`);
    }
  } finally { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); }
  if (problems.length) { console.error("ARTEFACT CHECK FAILED:\n  " + problems.join("\n  ")); process.exit(1); }
}

// Download the proving assets from the pinned tag, check every hash against the manifest, and (optionally) write the browser hash table.
//   fetch --out <dir> [--hashes-ts <file>]
function cmdFetch(args) {
  const m = readManifest();
  const oi = args.indexOf("--out");
  if (oi < 0) throw new Error("--out <dir> is required");
  const out = path.resolve(args[oi + 1]);
  const hi = args.indexOf("--hashes-ts");
  const tmp = fs.mkdtempSync(path.join(process.env.VENDOR_TMP || require("os").tmpdir(), "bow-"));
  try {
    cloneTag(tmp);
    fs.mkdirSync(out, { recursive: true });
    for (const [name, a] of Object.entries(m.artifacts)) {
      const bytes = fs.readFileSync(path.join(tmp, a.path));
      if (sha256(bytes) !== a.sha256) throw new Error(`${name}: hash differs from the manifest; refusing to write it`);
      fs.writeFileSync(path.join(out, name), bytes);
      console.log(`${name}: ${bytes.length} bytes, sha256 ${a.sha256}`);
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  if (hi >= 0) {
    const lines = Object.entries(m.artifacts).map(([n, a]) => `  "${n}": "${a.sha256}"`).join(",\n");
    const text = `// Generated by scripts/vendor/0xbow.js fetch from vendor/0xbow/MANIFEST.json (pinned 0xbow ${m.tag}). Do not edit by hand.\nexport const ZK_HASHES_BOW: Record<string, string> = {\n${lines}\n};\n`;
    fs.writeFileSync(path.resolve(args[hi + 1]), text);
    console.log("wrote " + args[hi + 1]);
  }
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === "sync") cmdSync(rest);
  else if (cmd === "verify") cmdVerify(rest);
  else if (cmd === "vkey") cmdVkey();
  else if (cmd === "artifacts") cmdArtifacts(rest);
  else if (cmd === "fetch") cmdFetch(rest);
  else { console.log("usage: 0xbow.js sync --src <dir> | verify [--upstream] | vkey | artifacts [--dir <dir>] | fetch --out <dir> [--hashes-ts <file>]"); process.exit(cmd ? 1 : 0); }
} catch (e) { console.error("ERROR:", e.message); process.exit(1); }
