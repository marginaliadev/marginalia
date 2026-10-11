#!/usr/bin/env node
// STANDALONE contributor tool (plan B1, task E1). Needs only Node >= 22 and `snarkjs` (npm i snarkjs@<pinned version>).
// It does ONE thing: add your randomness to a zkey. Your secret is generated here, used once and never written to disk.
//
//   node contribute.js --in 0003.zkey --out 0004.zkey --name "Your Name" [--expect-sha256 <hash the coordinator announced>]
//
// Run it on a machine you trust (ideally offline, freshly booted). Afterwards: send the OUTPUT zkey to the coordinator, publish
// the three values this tool prints (name, contribution hash, output sha256), then delete the files and your shell history.
const fs = require("fs");
const crypto = require("crypto");
const snarkjs = require("snarkjs");

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : undefined; };
const need = (n) => { const v = opt(n); if (!v) { console.error(`--${n} is required`); process.exit(1); } return v; };
const sha256 = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

(async () => {
  const input = need("in"), out = need("out"), name = need("name");
  if (!fs.existsSync(input)) throw new Error(`input file not found: ${input}`);
  if (fs.existsSync(out)) throw new Error(`refusing to overwrite ${out}`);
  const inHash = sha256(input);
  console.log("input sha256 :", inHash);
  const expect = opt("expect-sha256");
  if (expect && expect.toLowerCase() !== inHash) throw new Error("the input file does not match the hash the coordinator announced: stop and ask them");
  else if (!expect) console.log("(no --expect-sha256 given: compare the hash above with the one announced by the coordinator before continuing)");

  const lines = [];
  const logger = { debug() {}, info: (m) => lines.push(String(m)), warn: (m) => lines.push(String(m)), error: (m) => lines.push(String(m)) };
  // 64 random bytes from the OS CSPRNG; mixed with optional keyboard text you type: add anything you like with --extra-entropy
  const secret = crypto.randomBytes(64).toString("hex") + (opt("extra-entropy") || "");
  await snarkjs.zKey.contribute(input, out, name, secret, logger);
  const m = lines.join("\n").match(/Contribution Hash:\s*\n([\s\S]*?)$/);
  console.log("\n==== PUBLISH THESE THREE VALUES ====");
  console.log("name              :", name);
  console.log("contribution hash :", m ? m[1].replace(/\s+/g, " ").trim() : "(see snarkjs output)");
  console.log("output sha256     :", sha256(out));
  console.log("====================================");
  console.log(`Send ${out} to the coordinator. Then delete ${input}, ${out}, and your shell history.`);
  process.exit(0);
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
