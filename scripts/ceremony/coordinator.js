#!/usr/bin/env node
// MARGINALIA ceremony COORDINATOR (plan B1, task E2). Keeps the queue, verifies every round the moment it arrives and
// produces the public transcript. Everything it writes is public except nothing: it never sees a contributor's entropy.
//
//   start    --circuit withdraw --r1cs f --ptau f --dir ceremony/withdraw --contributors contributors.json
//            contributors.json: [{ "name": "Alice", "contact": "alice@example.org" }, ...]  (order = slot order)
//   next     --dir d                         what to send to the next contributor (file + SHA-256 to announce)
//   receive  --dir d --file recv.zkey --name "Alice" [--contribution-hash h] [--attestation https://...]
//            verifies (previous good zkey -> this one) and only then accepts; a failing round is rejected and logged
//   skip     --dir d --name "Alice" --reason "no show"
//   status   --dir d
//   seal     --dir d --hash <hex beacon> --source "drand round N" [--iterations 10] [--contract Groth16Verifier]
//            beacon -> final.zkey -> verification key + Solidity verifier -> ceremony.json -> transcript.json
//   publish  [--dirs ceremony/withdraw,ceremony/ragequit] --out frontend/public/ceremony/status.json [--meta meta.json] [--phase1 f]
//            no --dirs = "recruiting" (before the ceremony starts); Phase-1 pin is read from docs/ceremony/phase1.json
//            public status for the /ceremony page (task E3). Contributor CONTACTS are never exported.
//            meta.json (optional): { "window": "...", "beacon": { "source", "chain", "round", "expectedAt", "iterationsExp", "announcement" } }
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const L = require("./lib");

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name, def) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : def; };
const need = (name) => { const v = opt(name); if (!v) throw new Error(`--${name} is required`); return v; };
const sha256 = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const pad = (n) => String(n).padStart(4, "0");

const stateFile = (dir) => path.join(dir, "state.json");
const load = (dir) => JSON.parse(fs.readFileSync(stateFile(dir), "utf8"));
const save = (dir, s) => fs.writeFileSync(stateFile(dir), JSON.stringify(s, null, 2));
const log = (s, event) => { s.log.push({ at: new Date().toISOString(), ...event }); };
const abs = (s, p) => (path.isAbsolute(p) ? p : path.join(s.dir, p));

async function start() {
  const dir = path.resolve(need("dir"));
  if (fs.existsSync(stateFile(dir))) throw new Error("this ceremony directory already has a state.json: refusing to overwrite");
  fs.mkdirSync(dir, { recursive: true });
  const people = JSON.parse(fs.readFileSync(need("contributors"), "utf8"));
  const names = people.map((p) => String(p.name).trim().toLowerCase());
  if (new Set(names).size !== names.length) throw new Error("contributor names must be unique");
  const r1cs = path.resolve(need("r1cs")), ptau = path.resolve(need("ptau"));
  const init = await L.init({ r1cs, ptau, out: path.join(dir, "0000.zkey") });
  const s = {
    circuit: need("circuit"), dir, r1cs, ptau, createdAt: new Date().toISOString(),
    zkey0: { file: "0000.zkey", blake2b: init.hash },
    lastGood: { file: "0000.zkey", contributions: 0 },
    slots: people.map((p, i) => ({ slot: i + 1, name: p.name, contact: p.contact || null, status: "pending" })),
    rounds: [], log: [],
  };
  log(s, { event: "start", zkey0Blake2b: init.hash });
  save(dir, s);
  console.log(`started ${s.circuit}: ${s.slots.length} slots; zkey #0 blake2b ${init.hash}`);
}

function currentSlot(s) { return s.slots.find((x) => x.status === "pending"); }

function next() {
  const s = load(path.resolve(need("dir")));
  const slot = currentSlot(s);
  if (!slot) return console.log("no pending slot: every slot is done, rejected or skipped. Run `seal` when the minimum is reached and the beacon is published.");
  const f = abs(s, s.lastGood.file);
  console.log(JSON.stringify({ slot: slot.slot, contributor: slot.name, send: f, sha256: sha256(f), contributionsInFile: s.lastGood.contributions,
    contributorCommand: `node contribute.js --in ${path.basename(f)} --out <out>.zkey --name "${slot.name}"` }, null, 1));
}

async function receive() {
  const dir = path.resolve(need("dir"));
  const s = load(dir);
  const name = need("name");
  const slot = s.slots.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!slot) throw new Error(`no slot for "${name}"`);
  if (slot.status !== "pending") throw new Error(`slot of ${name} is already ${slot.status}`);
  const n = s.rounds.length + 1;
  const dest = path.join(dir, `${pad(n)}.zkey`);
  const incoming = path.resolve(need("file"));
  const prev = abs(s, s.lastGood.file);
  const r = await L.verifyChain({ r1cs: s.r1cs, ptau: s.ptau, files: [prev, incoming] });
  if (!r.ok) {
    slot.status = "rejected";
    const problems = r.reports.flatMap((x) => x.problems || []);
    log(s, { event: "rejected", name, problems, sha256: sha256(incoming) });
    save(dir, s);
    console.log("REJECTED:", problems.join("; ") || "verification failed");
    process.exitCode = 1;
    return;
  }
  fs.copyFileSync(incoming, dest);
  const insp = await L.inspect({ r1cs: s.r1cs, ptau: s.ptau, zkey: dest });
  const mine = insp.contributions[insp.contributions.length - 1];
  const announced = opt("contribution-hash");
  if (announced && mine && announced.replace(/\s+/g, "") !== String(mine.hash).replace(/\s+/g, "")) {
    fs.unlinkSync(dest);
    slot.status = "rejected";
    log(s, { event: "rejected", name, problems: ["announced contribution hash differs from the one inside the zkey"] });
    save(dir, s);
    console.log("REJECTED: the contribution hash the contributor announced is not the one inside the zkey");
    process.exitCode = 1;
    return;
  }
  slot.status = "done";
  s.rounds.push({ index: n, contributor: slot.name, file: `${pad(n)}.zkey`, contributionHash: mine.hash, sha256: sha256(dest), blake2b: await L.hashFile(dest), attestation: opt("attestation") || null, receivedAt: new Date().toISOString() });
  s.lastGood = { file: `${pad(n)}.zkey`, contributions: n };
  log(s, { event: "accepted", name, index: n, sha256: sha256(dest) });
  save(dir, s);
  console.log(`ACCEPTED round ${n} from ${slot.name}; contribution hash ${mine.hash}; sha256 ${sha256(dest)}`);
}

function skip() {
  const dir = path.resolve(need("dir"));
  const s = load(dir);
  const slot = s.slots.find((x) => x.name.toLowerCase() === need("name").toLowerCase());
  if (!slot || slot.status !== "pending") throw new Error("no pending slot with that name");
  slot.status = "skipped";
  log(s, { event: "skipped", name: slot.name, reason: opt("reason", "") });
  save(dir, s);
  console.log(`skipped ${slot.name}`);
}

function status() {
  const s = load(path.resolve(need("dir")));
  console.log(`${s.circuit}: ${s.rounds.length} accepted contribution(s); last good ${s.lastGood.file}`);
  for (const x of s.slots) console.log(`  #${String(x.slot).padStart(2)}  ${x.status.padEnd(9)} ${x.name}`);
}

async function seal() {
  const dir = path.resolve(need("dir"));
  const s = load(dir);
  const min = Number(opt("min", 15));
  if (s.rounds.length < min) throw new Error(`only ${s.rounds.length} accepted contribution(s); the mainnet guard needs ${min}. Use --min only for rehearsals.`);
  const input = abs(s, s.lastGood.file);
  const iterations = Number(opt("iterations", 10));
  if (!(iterations >= 10 && iterations <= 63)) throw new Error("--iterations must be between 10 and 63 (2^iterations hashing rounds; the mainnet guard requires >= 10)");
  const beaconHash = need("hash");
  const b = await L.applyBeacon({ inZkey: input, outZkey: path.join(dir, "final.zkey"), beaconHashHex: beaconHash, iterationsExp: iterations });
  const contract = opt("contract", s.circuit === "withdraw" ? "Groth16Verifier" : "RagequitVerifier");
  const fin = await L.finalize({ zkey: path.join(dir, "final.zkey"), outDir: path.join(dir, "out"), circuit: s.circuit, contractName: contract });
  const cfg = {
    circuit: s.circuit, r1cs: s.r1cs, ptau: s.ptau, ptauSource: opt("ptau-source", "Hermez/PSE powersOfTau28_hez_final_15.ptau"),
    rounds: s.rounds.map((r) => ({ contributor: r.contributor, file: r.file, contributionHash: r.contributionHash, attestation: r.attestation })),
    beacon: { hash: beaconHash, source: need("source"), iterationsExp: iterations, contributionHash: b.contributionHash },
    finalZkey: "final.zkey", finalization: { vkeyHash: fin.vkeyHash, verifierHash: fin.verifierHash, contractName: contract },
  };
  fs.writeFileSync(path.join(dir, "ceremony.json"), JSON.stringify(cfg, null, 2));
  const t = await L.buildTranscript({ circuit: cfg.circuit, r1cs: cfg.r1cs, ptau: cfg.ptau, ptauSource: cfg.ptauSource, rounds: cfg.rounds.map((r) => ({ ...r, file: path.join(dir, r.file) })), beacon: cfg.beacon, finalZkey: path.join(dir, "final.zkey"), finalization: cfg.finalization });
  fs.writeFileSync(path.join(dir, "transcript.json"), JSON.stringify(t, null, 1));
  log(s, { event: "sealed", finalBlake2b: t.final.zkeyBlake2b });
  save(dir, s);
  console.log(`sealed: ${path.join(dir, "final.zkey")}\ntranscript: ${path.join(dir, "transcript.json")}\nverifier: ${fin.solFile}\nverify with: node scripts/ceremony/cli.js verify --transcript ${path.join(dir, "transcript.json")} --r1cs ${s.r1cs} --ptau ${s.ptau} --zkey ${path.join(dir, "final.zkey")} --verifier ${fin.solFile} --min ${min}`);
}

/** Public view of one ceremony directory. Whitelists fields so a future state.json field can never leak by accident. */
function publicCircuit(dir) {
  const s = load(dir);
  const out = {
    circuit: s.circuit,
    startedAt: s.createdAt,
    zkey0Blake2b: s.zkey0.blake2b,
    accepted: s.rounds.length,
    lastGood: s.lastGood.file,
    slots: s.slots.map((x) => ({ slot: x.slot, name: x.name, status: x.status })),
    rounds: s.rounds.map((r) => ({ index: r.index, contributor: r.contributor, contributionHash: r.contributionHash, sha256: r.sha256, blake2b: r.blake2b, attestation: r.attestation, receivedAt: r.receivedAt })),
    events: s.log.map((e) => ({ at: e.at, event: e.event, name: e.name || null, index: e.index || null })), // reasons (skips, rejections) stay private to the coordinator
    sealed: null,
  };
  const tFile = path.join(dir, "transcript.json");
  const cFile = path.join(dir, "ceremony.json");
  if (fs.existsSync(tFile) && fs.existsSync(cFile)) {
    const t = JSON.parse(fs.readFileSync(tFile, "utf8"));
    const c = JSON.parse(fs.readFileSync(cFile, "utf8"));
    out.sealed = {
      finalZkeyBlake2b: (t.final && t.final.zkeyBlake2b) || null,
      vkeyHash: c.finalization.vkeyHash, verifierHash: c.finalization.verifierHash, contractName: c.finalization.contractName,
      beacon: { hash: c.beacon.hash, source: c.beacon.source, iterationsExp: c.beacon.iterationsExp },
    };
  }
  return out;
}

function publish() {
  const dirs = String(opt("dirs", "")).split(",").map((d) => d.trim()).filter(Boolean).map((d) => path.resolve(d));
  const meta = opt("meta") ? JSON.parse(fs.readFileSync(opt("meta"), "utf8")) : {};
  const circuits = dirs.map(publicCircuit);
  const p1File = path.resolve(opt("phase1", path.join(__dirname, "..", "..", "docs", "ceremony", "phase1.json")));
  let phase1 = null;
  if (fs.existsSync(p1File)) {
    const p = JSON.parse(fs.readFileSync(p1File, "utf8"));
    phase1 = { file: p.file, blake2b: p.blake2b, sizeBytes: p.sizeBytes || null, status: String(p.status || "").split(":")[0] || null, sources: (p.sources || []).map((x) => ({ name: x.name, url: x.url, checkedOn: x.checkedOn })) };
  }
  const doc = {
    schema: 1,
    updatedAt: new Date().toISOString(),
    phase: circuits.length === 0 ? "recruiting" : circuits.every((c) => c.sealed) ? "sealed" : circuits.some((c) => c.accepted > 0) ? "contributing" : "started",
    minContributors: Number(opt("min", 15)),
    window: meta.window || null,
    beacon: meta.beacon || null,
    phase1,
    circuits,
  };
  const outFile = path.resolve(need("out"));
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(doc, null, 2) + "\n");
  console.log(`published ${outFile}: phase ${doc.phase}; ${circuits.map((c) => `${c.circuit} ${c.accepted}/${c.slots.length}`).join(", ")}`);
}

(async () => {
  switch (cmd) {
    case "publish": publish(); break;
    case "start": await start(); break;
    case "next": next(); break;
    case "receive": await receive(); break;
    case "skip": skip(); break;
    case "status": status(); break;
    case "seal": await seal(); break;
    default: console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 17).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  }
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error(e.message); process.exit(1); });
