// Collects real Courier relays against a running app to measure the fee quote (Fase 03 H4-TEST1).
//   APP_URL=https://marginalia-dev-production.up.railway.app N=18 node scripts/relay-samples.js [run|sweep|report]
//
// run:    deposits N small notes from the deployer, has the Magistrate approve them (CLI), publishes the label list
//         (ASP_PUBLISH_CMD, e.g. git push to dev), waits until the app serves the new list, then withdraws each note
//         through the Courier (POST /api/relay/withdraw) back to the deployer and compares quote vs. actual gas.
// resume: relays the notes already deposited and approved (after an interrupted run).
// sweep:  ragequits every note still open in the ledger (crash repair; also run automatically at the end).
// report: prints the statistics of notes/relay-samples-ledger.json.
// FUND SAFETY: every note is written to notes/relay-samples-ledger.json (gitignored) the moment it is deposited.
// Use an RPC without the 10-block eth_getLogs limit for the approval step (RH_TESTNET_RPC_URL, RH_LOG_CHUNK).
const os = require("os");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const R = path.join(__dirname, "..") + path.sep;
process.chdir(R);
require(R + "node_modules/dotenv").config({ quiet: true });
const { ethers } = require(R + "node_modules/ethers");
const M = require(R + "lib/marginalia");

const BASE = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
const N = parseInt(process.env.N || "18", 10);
const VALUE = ethers.parseEther(process.env.VALUE_ETH || "0.00008");
const LEDGER = R + "notes/relay-samples-ledger.json";
const DEPLOY = require(R + "deployments/robinhoodTestnet.json");
const ABI = require(R + "artifacts/contracts/MarginaliaPool.sol/MarginaliaPool.json").abi;

const loadLedger = () => (fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, "utf8")) : { notes: [], relays: [] });
const saveLedger = (l) => fs.writeFileSync(LEDGER, JSON.stringify(l, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]; };

const provider = new ethers.JsonRpcProvider(process.env.RH_TESTNET_RPC_URL, 46630, { staticNetwork: true });
const deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
const pool = new ethers.Contract(DEPLOY.pool, ABI, deployer);

async function withProver(fn) {
  const real = os.cpus;
  os.cpus = () => [{}]; // 1 prover worker: keeps snarkjs within memory on small machines
  try { return await fn(); } finally { os.cpus = real; }
}

async function folio() {
  const r = await fetch(BASE + "/api/folio");
  const j = await r.json();
  if (!j.leaves) throw new Error("folio unavailable: " + (j.error || r.status));
  return j;
}

async function sweep(l) {
  const open = l.notes.filter((n) => n.status === "open");
  console.log(`-- sweep: ${open.length} open note(s) --`);
  for (const e of open) {
    try {
      const note = M.parseNote(e.note);
      const { proof } = await withProver(() => M.proveRagequit({ note }));
      const tx = await pool.ragequit(note.label, deployer.address, proof);
      await tx.wait();
      e.status = "ragequit";
      e.tx = tx.hash;
      saveLedger(l);
      console.log("   ragequit", ethers.formatEther(note.value), "ETH");
    } catch (err) {
      console.log("   could not ragequit one note:", (err.shortMessage || err.message).slice(0, 120));
    }
  }
}

function report(l) {
  const rs = l.relays.filter((r) => r.ok);
  console.log(`relays ok: ${rs.length}, failed: ${l.relays.length - rs.length}`);
  if (!rs.length) return;
  const used = rs.map((r) => Number(r.gasUsed));
  const net = rs.map((r) => Number(r.netWei));
  const under = rs.filter((r) => BigInt(r.netWei) < 0n).length;
  console.log(`gasUsed  min ${Math.min(...used)}  p50 ${pct(used, 50)}  p90 ${pct(used, 90)}  max ${Math.max(...used)}`);
  console.log(`net/relay (fee - cost) wei  min ${Math.min(...net)}  p50 ${pct(net, 50)}  max ${Math.max(...net)}`);
  console.log(`relays where the fee did NOT cover the cost: ${under}`);
  const q = rs.filter((r) => r.quotedGas);
  if (q.length) {
    const last = q[q.length - 1];
    console.log(`last quote: ${last.quotedGas} gas (${last.gasSource}, ${last.gasSamples} samples); quoted vs p90 used = ${(last.quotedGas / pct(used, 90)).toFixed(3)}x`);
  }
}

async function run() {
  const l = loadLedger();
  const resume = process.argv[2] === "resume"; // relay the notes already deposited and approved (after an interrupted run)
  const bal = await provider.getBalance(deployer.address);
  let fresh;
  if (resume) {
    fresh = l.notes.filter((n) => n.status === "open");
    console.log(`-- resuming with ${fresh.length} open note(s) --`);
  } else {
    await sweep(l); // always start from a clean slate
    const need = VALUE * BigInt(N) + ethers.parseEther("0.0004");
    if (bal < need) throw new Error(`deployer has ${ethers.formatEther(bal)} ETH, needs about ${ethers.formatEther(need)} for N=${N}; lower N or VALUE_ETH`);

    console.log(`-- depositing ${N} x ${ethers.formatEther(VALUE)} ETH --`);
    fresh = [];
    for (let i = 0; i < N; i++) {
      const secret = await M.newSecret();
      const tx = await pool.deposit(secret.precommitment, { value: VALUE });
      const rc = await tx.wait();
      const note = M.noteFromDepositReceipt(pool, rc, secret);
      const entry = { note: M.serializeNote(note), status: "open", depositTx: tx.hash };
      l.notes.push(entry);
      saveLedger(l); // written the instant the deposit exists
      fresh.push(entry);
    }

    console.log("-- Magistrate approval (CLI) --");
    const out = execFileSync("node", [R + "node_modules/hardhat/internal/cli/cli.js", "run", "scripts/magistrate-approve.js", "--network", "robinhoodTestnet"], { encoding: "utf8", env: process.env, timeout: 900000 });
    const approvedLine = (out.match(/Approved .*/) || [""])[0];
    console.log(approvedLine);
    const m = approvedLine.match(/Approved (\d+)\/(\d+)/);
    if (!/Published ASP root/.test(out) || !m || Number(m[1]) < fresh.length) {
      throw new Error("approval did not cover the new deposits (" + approvedLine + "): refusing to continue. Run 'sweep' to recover the notes.");
    }
    if (process.env.ASP_PUBLISH_CMD) {
      console.log("-- publishing the label list --");
      try { execFileSync(process.env.ASP_PUBLISH_CMD, { shell: true, cwd: R, stdio: "inherit", timeout: 120000 }); } catch (e) { console.log("publish command failed:", e.message); }
    }
  }

  const H = await M.hasher();
  const freshLabels = fresh.map((e) => M.parseNote(e.note).label.toString());
  console.log("-- waiting until the app serves the new list --");
  const t0 = Date.now();
  for (;;) {
    try {
      const f = await folio();
      if (!f.aspStale && freshLabels.every((x) => f.aspLabels.includes(x))) break;
    } catch (e) { /* retry */ }
    if (Date.now() - t0 > 20 * 60 * 1000) throw new Error("the app did not serve the new label list within 20 minutes; run 'sweep'");
    await sleep(15000);
  }

  console.log("-- relays through the Courier --");
  for (let i = 0; i < fresh.length; i++) {
    const e = fresh[i];
    const rec = { i, ok: false };
    try {
      const note = M.parseNote(e.note);
      const quote = await (await fetch(BASE + "/api/relay/quote", { method: "POST" })).json();
      if (!quote.relayerAvailable) throw new Error("courier unavailable: " + quote.relayerReason);
      const fee = BigInt(quote.minFeeWei);
      const w = { recipient: deployer.address, relayer: quote.relayer, fee };
      const f = await folio();
      const stateTree = new M.MerkleTree(M.DEPTH, H, f.leaves.map(BigInt));
      const aspTree = await M.buildAspTree(f.aspLabels.map(BigInt));
      const context = await pool.computeContext(w);
      const { proof } = await withProver(() => M.proveWithdraw({ note, stateTree, aspTree, withdrawnValue: note.value, context }));
      const res = await fetch(BASE + "/api/relay/withdraw", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ withdrawal: { recipient: w.recipient, relayer: w.relayer, fee: fee.toString() }, proof }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || "HTTP " + res.status);
      Object.assign(rec, {
        ok: true, tx: j.txHash, gasUsed: j.gasUsed, feeWei: j.feeWei, costWei: j.gasCostWei, netWei: (BigInt(j.feeWei) - BigInt(j.gasCostWei)).toString(),
        quotedGas: quote.estimatedGas, gasSource: quote.gasSource, gasSamples: quote.gasSamples,
      });
      e.status = "relayed";
      console.log(`   relay ${i + 1}/${fresh.length}: gas ${j.gasUsed} (quoted ${quote.estimatedGas}, ${quote.gasSource}/${quote.gasSamples})  fee ${j.feeWei}  cost ${j.gasCostWei}`);
    } catch (err) {
      rec.error = String(err.message || err).slice(0, 200);
      console.log(`   relay ${i + 1}/${fresh.length} FAILED: ${rec.error}`);
    }
    l.relays.push(rec);
    saveLedger(l);
    await sleep(7000); // stay under the per-IP relay rate limit (10 / minute)
  }

  await sweep(l); // anything the Courier did not take goes back via ragequit
  report(l);
  const end = await provider.getBalance(deployer.address);
  console.log(`deployer balance: ${ethers.formatEther(bal)} -> ${ethers.formatEther(end)} ETH`);
  const open = l.notes.filter((n) => n.status === "open").length;
  if (open) { console.log(`FAIL: ${open} note(s) still open`); process.exitCode = 1; }
}

(async () => {
  const mode = process.argv[2] || "run";
  const l = loadLedger();
  if (mode === "report") return report(l);
  if (mode === "sweep") { await sweep(l); return; }
  await run(); // "run" or "resume"
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
