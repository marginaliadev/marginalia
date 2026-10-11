// Compile a circuit to .audit-build/<name>.r1cs with circom2 (the WASM build of circom 2.x; no native binary needed).
// Optimisation is pinned to --O2 (full simplification): circom2 defaults to --O1, which yields a DIFFERENT constraint system
// (e.g. ragequit: 1,449 vs 693 constraints) and therefore different keys. Never rely on a compiler default for a trusted setup.
// The WASM sandbox can only read below the current directory, so this always runs from the repo root.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const OUT = path.join(ROOT, ".audit-build");

function newestSource() {
  const files = [...fs.readdirSync(path.join(ROOT, "circuits")).filter((f) => f.endsWith(".circom")).map((f) => path.join(ROOT, "circuits", f)),
    ...fs.readdirSync(path.join(ROOT, "circuits", "lib")).map((f) => path.join(ROOT, "circuits", "lib", f))];
  return Math.max(...files.map((f) => fs.statSync(f).mtimeMs));
}

/** Returns { r1cs, sym }. Recompiles only when a circuit source is newer than the cached output (or force). */
function compileCircuit(name, { force = false, opt = "--O2" } = {}) {
  fs.mkdirSync(OUT, { recursive: true });
  const tag = opt === "--O2" ? "" : opt.replace("--", ".");
  const r1cs = path.join(OUT, `${name}${tag}.r1cs`);
  const sym = path.join(OUT, `${name}${tag}.sym`);
  if (!force && fs.existsSync(r1cs) && fs.statSync(r1cs).mtimeMs > newestSource()) return { r1cs, sym, cached: true };
  const bin = path.join(ROOT, "node_modules", "circom2", "cli.js");
  const cli = fs.existsSync(bin) ? [process.execPath, [bin]] : [process.platform === "win32" ? "npx.cmd" : "npx", ["circom2"]];
  execFileSync(cli[0], [...cli[1], `circuits/${name}.circom`, "--r1cs", "--sym", opt, "-l", "circuits", "-l", "."], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], shell: cli[0].endsWith(".cmd") });
  for (const ext of ["r1cs", "sym"]) {
    const produced = path.join(ROOT, "circuits", `${name}.${ext}`);
    if (!fs.existsSync(produced)) throw new Error(`circom2 did not produce ${produced}`);
    fs.renameSync(produced, path.join(OUT, `${name}${tag}.${ext}`));
  }
  return { r1cs, sym, cached: false };
}

module.exports = { compileCircuit, OUT };
