#!/usr/bin/env node
// Phase-1 cross-check (plan B1 section 7 / blocker B2).
// Hashes the public Powers of Tau file from one or more ORIGINS (local files and/or URLs) and compares each result with the pin in
// docs/ceremony/phase1.json. A match from a different host, checked by a different person, is independent evidence that no single
// mirror altered the file. It never flips `status` to VERIFIED by itself: that stays a reviewed decision by the owner.
//
//   node scripts/ceremony/phase1-check.js --file powersOfTau28_hez_final_15.ptau
//   node scripts/ceremony/phase1-check.js --url https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_15.ptau --by "Bimo" --write
//   node scripts/ceremony/phase1-check.js --defaults            (tries every known origin below)
//
//   --write   record each MATCHING check in phase1.json under "downloads" (origin, who, when, sha256). Mismatches are never written.
//   --pin f   use another phase1.json (tests)
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Readable } = require("stream");

const ROOT = path.join(__dirname, "..", "..");
const KNOWN_ORIGINS = [
  "https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_15.ptau",
  "https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_15.ptau",
  "https://circom.info/powersOfTau28_hez_final_15.ptau",
];

/** Stream a readable through blake2b-512 and sha256 at once. */
function hashStream(stream) {
  return new Promise((resolve, reject) => {
    const b = crypto.createHash("blake2b512"), s = crypto.createHash("sha256");
    let size = 0;
    stream.on("data", (d) => { b.update(d); s.update(d); size += d.length; });
    stream.on("end", () => resolve({ blake2b: b.digest("hex"), sha256: s.digest("hex"), sizeBytes: size }));
    stream.on("error", reject);
  });
}

async function hashOrigin(origin) {
  if (/^https?:\/\//i.test(origin)) {
    const res = await fetch(origin, { redirect: "follow" });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    return hashStream(Readable.fromWeb(res.body));
  }
  return hashStream(fs.createReadStream(path.resolve(origin)));
}

/** Compare one measured result with the pin. Returns a list of problems (empty = match). */
function compare(pin, got) {
  const problems = [];
  if (!pin.blake2b) problems.push("phase1.json has no pinned blake2b");
  else if (got.blake2b !== pin.blake2b) problems.push(`blake2b differs: got ${got.blake2b.slice(0, 16)}…, pinned ${pin.blake2b.slice(0, 16)}…`);
  if (pin.sizeBytes && got.sizeBytes !== pin.sizeBytes) problems.push(`size differs: got ${got.sizeBytes}, pinned ${pin.sizeBytes}`);
  return problems;
}

/** How many distinct pieces of evidence the pin has. Publications and download origins are counted separately on purpose. */
function evidence(pin) {
  const pubs = new Set((pin.sources || []).map((s) => String(s.url).split("#")[0].toLowerCase()));
  const hosts = new Set((pin.downloads || []).map((d) => { try { return new URL(d.origin).host; } catch { return "local:" + d.origin; } }));
  const people = new Set((pin.downloads || []).map((d) => String(d.by || "").trim().toLowerCase()).filter(Boolean));
  return { publications: pubs.size, downloadHosts: hosts.size, people: people.size };
}

async function main(argv) {
  const opt = (n) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : undefined; };
  const all = (n) => argv.flatMap((a, i) => (a === "--" + n && argv[i + 1] ? [argv[i + 1]] : []));
  const pinFile = path.resolve(opt("pin") || path.join(ROOT, "docs", "ceremony", "phase1.json"));
  const pin = JSON.parse(fs.readFileSync(pinFile, "utf8"));
  const origins = [...all("file"), ...all("url"), ...(argv.includes("--defaults") ? KNOWN_ORIGINS : [])];
  if (!origins.length) {
    console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 13).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
    console.log("\nknown origins:\n  " + KNOWN_ORIGINS.join("\n  "));
    return 0;
  }
  const by = opt("by") || null;
  const today = new Date().toISOString().slice(0, 10);
  let failed = 0;
  const matches = [];
  for (const o of origins) {
    process.stdout.write(`${o}\n  `);
    try {
      const got = await hashOrigin(o);
      const problems = compare(pin, got);
      if (problems.length) { failed++; console.log("MISMATCH: " + problems.join("; ")); continue; }
      console.log(`MATCH  blake2b ${got.blake2b.slice(0, 16)}…  sha256 ${got.sha256}  ${got.sizeBytes} bytes`);
      matches.push({ origin: o, by, checkedOn: today, sha256: got.sha256 });
    } catch (e) {
      failed++;
      console.log("ERROR: " + e.message + " (origin unreachable is not a mismatch; try another origin)");
    }
  }
  if (argv.includes("--write") && matches.length) {
    pin.downloads = [...(pin.downloads || []), ...matches];
    fs.writeFileSync(pinFile, JSON.stringify(pin, null, 2) + "\n");
    console.log(`\nrecorded ${matches.length} matching check(s) in ${path.relative(process.cwd(), pinFile)}`);
  }
  const ev = evidence(pin);
  console.log(`\nevidence in pin: ${ev.publications} publication(s), ${ev.downloadHosts} download host(s), ${ev.people} person(s) who checked; status ${String(pin.status || "").split(":")[0]}`);
  console.log("Set status to VERIFIED only by a reviewed change, once the owner accepts this evidence as independent (plan B1 section 7).");
  return failed ? 1 : 0;
}

if (require.main === module) main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(e.message); process.exit(1); });
module.exports = { hashStream, compare, evidence, KNOWN_ORIGINS, main };
