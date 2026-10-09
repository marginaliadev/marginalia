#!/usr/bin/env node
// MARGINALIA ceremony CLI (Fase 04). Run `node scripts/ceremony/cli.js help`.
//
// Coordinator:   init -> (send zkey to contributor N, receive their output) -> verify-chain -> beacon -> finalize -> transcript
// Contributor:   contribute  (offline, on your own machine; your entropy never leaves it)
// Anyone:        verify     (needs only the public files: r1cs, ptau, final zkey, transcript)
const fs = require("fs");
const path = require("path");
const L = require("./lib");

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name, def) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : def; };
const need = (name) => { const v = opt(name); if (!v) throw new Error(`--${name} is required`); return v; };

const HELP = `
  init            --r1cs f --ptau f --out 0000.zkey
  contribute      --in prev.zkey --out next.zkey --name "Alice" [--entropy "text"]   (entropy defaults to 64 random bytes; keep it secret, never reuse)
  beacon          --in last.zkey --out beacon.zkey --hash <hex> [--iterations 10]       (hash = the pre-announced public randomness, e.g. a drand round)
  inspect         --r1cs f --ptau f --zkey f                                           (verifies one zkey and lists its contributions)
  verify-chain    --r1cs f --ptau f --files 0000.zkey,0001.zkey,...                    (each step must add exactly one contribution)
  finalize        --zkey f --out dir --circuit withdraw [--contract Groth16Verifier]   (exports verification key + Solidity verifier)
  transcript      --config ceremony.json --out transcript.json                          (see docs/ceremony_guide.md for the config format)
  verify          --transcript t.json --r1cs f --ptau f --zkey f [--verifier f.sol] [--min 15] [--ptau-hash <blake2b>]
`;

(async () => {
  switch (cmd) {
    case "init": console.log(JSON.stringify(await L.init({ r1cs: need("r1cs"), ptau: need("ptau"), out: need("out") }), null, 1)); break;
    case "contribute": {
      const r = await L.contribute({ inZkey: need("in"), outZkey: need("out"), name: need("name"), entropy: opt("entropy") });
      console.log(JSON.stringify(r, null, 1));
      console.log("\nPublish: your name, the contribution hash and the zkey hash above. Then DELETE your entropy and this machine's temp files.");
      break;
    }
    case "beacon": console.log(JSON.stringify(await L.applyBeacon({ inZkey: need("in"), outZkey: need("out"), beaconHashHex: need("hash"), iterationsExp: Number(opt("iterations", 10)) }), null, 1)); break;
    case "inspect": console.log(JSON.stringify(await L.inspect({ r1cs: need("r1cs"), ptau: need("ptau"), zkey: need("zkey") }), null, 1)); break;
    case "verify-chain": {
      const r = await L.verifyChain({ r1cs: need("r1cs"), ptau: need("ptau"), files: need("files").split(",") });
      console.log(JSON.stringify(r, null, 1));
      if (!r.ok) process.exitCode = 1;
      break;
    }
    case "finalize": console.log(JSON.stringify(await L.finalize({ zkey: need("zkey"), outDir: need("out"), circuit: need("circuit"), contractName: opt("contract") }), null, 1)); break;
    case "transcript": {
      const cfg = JSON.parse(fs.readFileSync(need("config"), "utf8"));
      const base = path.dirname(path.resolve(need("config")));
      const abs = (p) => (p && !path.isAbsolute(p) ? path.join(base, p) : p);
      const t = await L.buildTranscript({
        circuit: cfg.circuit, r1cs: abs(cfg.r1cs), ptau: abs(cfg.ptau), ptauSource: cfg.ptauSource,
        rounds: cfg.rounds.map((r) => ({ ...r, file: abs(r.file) })), beacon: cfg.beacon, finalZkey: abs(cfg.finalZkey), finalization: cfg.finalization,
      });
      fs.writeFileSync(need("out"), JSON.stringify(t, null, 1));
      console.log("transcript written to", opt("out"));
      break;
    }
    case "verify": {
      const t = JSON.parse(fs.readFileSync(need("transcript"), "utf8"));
      const r = await L.verifyTranscript(t, { r1cs: need("r1cs"), ptau: need("ptau"), zkey: need("zkey"), verifierSol: opt("verifier"), minContributors: Number(opt("min", 1)), expectedPtauBlake2b: opt("ptau-hash") || null });
      for (const c of r.checks) console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail ? "  (" + c.detail + ")" : ""}`);
      console.log(r.ok ? "\nTRANSCRIPT VERIFIED" : "\nTRANSCRIPT INVALID");
      if (!r.ok) process.exitCode = 1;
      break;
    }
    default: console.log(HELP);
  }
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error(e.message); process.exit(1); });
