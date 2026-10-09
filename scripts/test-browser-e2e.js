// Real browser E2E against Robinhood Chain Testnet: headless Chrome drives the /app UI, a test wallet
// (an EIP-1193 shim whose signing happens in Node via ethers) signs, and every step is a real on-chain tx.
//
//   APP_URL=http://localhost:3000 node scripts/test-browser-e2e.js [all|1|2|3]
//
// Env: APP_URL (Next app; must have RELAYER_PRIVATE_KEY set for the courier step and the same
//      RH_TESTNET_RPC_URL), DEPLOYER_PRIVATE_KEY + RH_TESTNET_RPC_URL (root .env: funds the test wallet and acts as
//      Magistrate), TEST_WALLET_KEY (optional; a fresh one is generated and kept in the OS temp dir),
//      CHROME_PATH (default: Windows Chrome location), RH_LOG_CHUNK/RH_TESTNET_RPC_URL (forwarded to the approve step).
// FUND SAFETY (this script never strands test ETH):
//   - every note is written to notes/e2e-ledger.json the instant it appears (notes/ is gitignored, not the OS temp dir);
//   - every payout goes to a sink wallet we control (notes/e2e-sink.key), never to random addresses;
//   - at start AND end a sweeper ragequits/withdraws any unspent ledger note and returns all test wallet + sink
//     balances to the deployer, so a hard crash is repaired by simply running the script again;
//   - the run fails (Z1/Z2) if any ledger note is still open or if more than gas was spent.
//   Crash drills: CRASH_AFTER_DEPOSIT=1, CRASH_AFTER_PARTIAL_WITHDRAW=1, and phase R (page killed mid-deposit).
// ASP_PUBLISH_CMD: shell command run after approval for servers that read the label list from ASP_LABELS_URL (e.g. git add/commit/push asp).
// AUTO_MAGISTRATE=1: do not approve manually; wait for the automated Magistrate service (services/magistrate) instead.
// DEPLOYMENT_FILE: use another deployment (e.g. notes/staging-deployment.json) for sweeper and checks.
// Phases: 1 = vault + deposits, 2 = Magistrate approval (CLI), 3 = withdraw / courier / ragequit, R = app-level crash recovery drill, L = live-safe deposit + ragequit (no server pool needed), none = sweep only. Default: all.
// Costs ~0.002 testnet ETH per run. Use `localhost`, not 127.0.0.1, with `next dev`.
const os = require("os");
const path = require("path");
const R = path.join(__dirname, "..") + path.sep;
const SP = os.tmpdir().split(path.sep).join("/") + "/marginalia-e2e";
require("fs").mkdirSync(SP, { recursive: true });
process.chdir(R);
require(R + "node_modules/dotenv").config({ quiet: true });
const fs = require("fs");
const { execFileSync } = require("child_process");
const puppeteer = require(R + "node_modules/puppeteer-core");
const { ethers } = require(R + "node_modules/ethers");

const BASE = process.env.APP_URL || "http://localhost:3000";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
// Everything that can hold funds lives under notes/ (gitignored, NOT the OS temp dir) so a crash never loses it.
const KEY_FILE = R + "notes/e2e-testwallet.key";
const LEDGER_FILE = R + "notes/e2e-ledger.json";
require("fs").mkdirSync(R + "notes", { recursive: true });
if (process.env.TEST_WALLET_KEY) require("fs").writeFileSync(KEY_FILE, process.env.TEST_WALLET_KEY);
const loadLedger = () => (require("fs").existsSync(LEDGER_FILE) ? JSON.parse(require("fs").readFileSync(LEDGER_FILE, "utf8")) : { notes: [], pending: [] });
const saveLedger = (l) => require("fs").writeFileSync(LEDGER_FILE, JSON.stringify(l, null, 1));
/** Persist a note the instant it is seen. status: "open" until the sweeper has proven it spent. */
const ledgerAdd = (name, note) => {
  if (!note) return;
  const l = loadLedger();
  if (!l.notes.some((n) => n.note === note)) l.notes.push({ name, note, at: new Date().toISOString(), status: "open" });
  saveLedger(l);
};
const results = [];
const rec = (n, ok, d) => { results.push({ n, ok, d }); console.log((ok ? "PASS " : "FAIL ") + n + " :: " + d); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Balance change since `before`, polled: load-balanced public RPC nodes can answer one block late right after a tx confirms. */
async function deltaSince(provider, addr, before, atLeast = 1n) {
  let d = 0n;
  for (let i = 0; i < 30; i++) { d = (await provider.getBalance(addr)) - before; if (d >= atLeast) break; await sleep(1000); }
  return d;
}

(async () => {
  const provider = new ethers.JsonRpcProvider(process.env.RH_TESTNET_RPC_URL, 46630, { staticNetwork: true });
  if (!fs.existsSync(KEY_FILE)) fs.writeFileSync(KEY_FILE, ethers.Wallet.createRandom().privateKey);
  const wallet = new ethers.Wallet(fs.readFileSync(KEY_FILE, "utf8").trim(), provider);
  const deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  const SINK_FILE = R + "notes/e2e-sink.key";
  if (!fs.existsSync(SINK_FILE)) fs.writeFileSync(SINK_FILE, ethers.Wallet.createRandom().privateKey);
  const sink = new ethers.Wallet(fs.readFileSync(SINK_FILE, "utf8").trim(), provider);
  const DEPLOY = require(process.env.DEPLOYMENT_FILE ? path.resolve(process.env.DEPLOYMENT_FILE) : R + "deployments/robinhoodTestnet.json");
  const poolAddr = DEPLOY.pool;
  const sweepPool = new ethers.Contract(poolAddr, [
    "function nullifierSpent(uint256) view returns (bool)",
    "function labelDepositor(uint256) view returns (address)",
    "function labelPrecommitment(uint256) view returns (uint256)",
    "function computeContext((address recipient, address relayer, uint256 fee) w) view returns (uint256)",
    "function withdraw((address recipient, address relayer, uint256 fee) w, (uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[6] pubSignals) p)",
    "function ragequit(uint256 label, address recipient, (uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[2] pubSignals) p)",
  ], wallet);

  /**
   * Recover every unit of test ETH: ragequit any unspent ledger note (and notes rebuilt from pending secrets)
   * deposited by the test wallet, then return the test wallet balance to the deployer.
   */
  async function sweep(tag) {
    console.log(`-- sweep (${tag}) --`);
    const realCpus = os.cpus;
    os.cpus = () => [{}]; // 1 prover worker: keeps snarkjs within memory on small machines
    try {
      const M = require(R + "lib/marginalia");
      const H = await M.hasher();
      const l = loadLedger();
      // pending secrets (deposit tx sent, note never captured) -> rebuild the note from the Folio
      if (l.pending && l.pending.length) {
        let leaves = [];
        try { leaves = (await (await fetch(BASE + "/api/folio")).json()).leaves.map(BigInt); } catch (_) {}
        for (const pnd of l.pending.slice()) {
          const sk = BigInt(pnd.sk), rho = BigInt(pnd.rho), value = BigInt(pnd.value);
          const pre = H([H([sk]), rho]);
          const known = new Set(leaves);
          for (let n = 0; n <= leaves.length; n++) {
            const label = BigInt(ethers.solidityPackedKeccak256(["uint256", "address", "uint256"], [46630, poolAddr, n])) % M.FIELD;
            const commitment = H([value, label, pre]);
            if (known.has(commitment)) {
              l.notes.push({ name: "recovered-pending", note: M.serializeNote({ sk, rho, value, label, commitment }), at: new Date().toISOString(), status: "open" });
              l.pending = l.pending.filter((x) => x !== pnd && x.sk !== pnd.sk);
              console.log("   rebuilt a note from a pending secret");
              break;
            }
          }
        }
        saveLedger(l);
      }
      for (const entry of l.notes) {
        if (entry.status === "spent") continue;
        let note;
        try { note = M.parseNote(entry.note); } catch (_) { entry.status = "invalid"; continue; }
        if (await sweepPool.nullifierSpent(await M.nullifierOf(note.sk, note.rho))) { entry.status = "spent"; continue; }
        const dep = await sweepPool.labelDepositor(note.label);
        if (dep.toLowerCase() !== wallet.address.toLowerCase()) { entry.status = "foreign-depositor"; console.log("   skip (not deposited by the test wallet)"); continue; }
        // an original deposit can ragequit; a change note (new rho) cannot, and must be withdrawn instead
        const isOriginal = H([H([note.sk]), note.rho]) === BigInt(await sweepPool.labelPrecommitment(note.label));
        let tx;
        if (isOriginal) {
          const { proof } = await M.proveRagequit({ note });
          tx = await sweepPool.ragequit(note.label, wallet.address, proof);
        } else {
          const folio = await (await fetch(BASE + "/api/folio")).json();
          if (!folio.leaves) throw new Error("cannot recover a change note: /api/folio unavailable (" + (folio.error || "?") + ")");
          const stateTree = new M.MerkleTree(M.DEPTH, H, folio.leaves.map(BigInt));
          const aspTree = await M.buildAspTree(folio.aspLabels.map(BigInt));
          const w = { recipient: wallet.address, relayer: ethers.ZeroAddress, fee: 0n };
          const { proof } = await M.proveWithdraw({ note, stateTree, aspTree, withdrawnValue: note.value, context: await sweepPool.computeContext(w) });
          tx = await sweepPool.withdraw(w, proof);
        }
        await tx.wait();
        entry.status = "spent";
        entry.recoveredTx = tx.hash;
        console.log(`   ${isOriginal ? "ragequit" : "withdraw"} recovered ${ethers.formatEther(note.value)} ETH (${tx.hash.slice(0, 12)}...)`);
        saveLedger(l);
      }
      saveLedger(l);
    } finally {
      os.cpus = realCpus;
    }
    // return the throwaway wallet's balance to the deployer, keeping only a gas reserve
    const bal = await provider.getBalance(wallet.address);
    const fee = await provider.getFeeData();
    const gasPrice = fee.gasPrice ?? ethers.parseUnits("0.1", "gwei");
    const reserve = gasPrice * 21000n * 3n;
    if (bal > reserve * 2n) {
      const tx = await wallet.sendTransaction({ to: deployer.address, value: bal - reserve, gasLimit: 21000n, gasPrice });
      await tx.wait();
      console.log(`   returned ${ethers.formatEther(bal - reserve)} ETH to the deployer`);
    }
    const sinkBal = await provider.getBalance(sink.address);
    if (sinkBal > reserve * 2n) {
      const tx = await sink.sendTransaction({ to: deployer.address, value: sinkBal - reserve, gasLimit: 21000n, gasPrice });
      await tx.wait();
      console.log(`   returned ${ethers.formatEther(sinkBal - reserve)} ETH from the sink to the deployer`);
    }
    const open = loadLedger().notes.filter((n) => n.status === "open");
    console.log(`   open ledger notes after sweep: ${open.length}`);
    return open.length;
  }
  const totalFunds = async () => (await provider.getBalance(wallet.address)) + (await provider.getBalance(deployer.address)) + (await provider.getBalance(sink.address));

  console.log("test wallet", wallet.address, "balance", ethers.formatEther(await provider.getBalance(wallet.address)));

  await sweep("recover leftovers from previous runs");
  if ((await provider.getBalance(wallet.address)) < ethers.parseEther("0.0010")) {
    const tx = await deployer.sendTransaction({ to: wallet.address, value: ethers.parseEther("0.0012") });
    await tx.wait();
    console.log("funded test wallet", tx.hash);
  }
  const fundsAtStart = await totalFunds();
  console.log("funds under test control at start:", ethers.formatEther(fundsAtStart), "ETH");

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--window-size=1500,1000"], defaultViewport: { width: 1500, height: 1000 } });
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message.slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error" || process.env.DEBUG_E2E) console.log("  [console.error]", m.text().slice(0, 200)); });

  // ---- wallet shim
  let sentTx = false;
  await page.exposeFunction("__walletRequest", async (method, params) => {
    switch (method) {
      case "eth_requestAccounts":
      case "eth_accounts": return [wallet.address];
      case "eth_chainId": return "0xb626";
      case "net_version": return "46630";
      case "wallet_switchEthereumChain": return null;
      case "eth_signTypedData_v4": {
        const td = JSON.parse(params[1]);
        const types = { ...td.types }; delete types.EIP712Domain;
        return await wallet.signTypedData(td.domain, types, td.message);
      }
      case "eth_sendTransaction": {
        const t = params[0];
        const tx = await wallet.sendTransaction({ to: t.to, data: t.data, value: t.value ? BigInt(t.value) : 0n });
        sentTx = true;
        return tx.hash;
      }
      default: return await provider.send(method, params);
    }
  });
  await page.evaluateOnNewDocument(() => {
    window.ethereum = { isMetaMask: true, request: ({ method, params }) => window.__walletRequest(method, params || []), on() {}, removeListener() {} };
  });

  const modal = async () => {
    await page.waitForSelector(".noir-modal-card", { visible: true, timeout: 600000 });
    const t = await page.$eval(".noir-modal-title", (e) => e.textContent.trim());
    const b = await page.$eval(".noir-modal-body", (e) => e.textContent.trim());
    return { t, b };
  };
  const closeModal = async () => {
    for (let i = 0; i < 10; i++) {
      const btn = await page.$("#noirModalCloseBtn");
      if (!btn) return;
      await page.evaluate(() => document.getElementById("noirModalCloseBtn")?.click());
      await sleep(400);
    }
  };
  const tab = async (name) => { await closeModal(); await page.waitForSelector(`button[data-tab="${name}"]`, { timeout: 60000 }); await page.evaluate((n) => document.querySelector(`button[data-tab="${n}"]`).click(), name); await sleep(500); };
  // set a React-controlled field reliably (typing long notes char by char can drop characters)
  const set = async (sel, text) => {
    await page.evaluate((selector, value) => {
      const el = document.querySelector(selector);
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value || "");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, sel, text);
  };
  const open = async () => { await page.goto(BASE + "/app", { waitUntil: "domcontentloaded" }); await page.evaluate(() => { document.querySelectorAll("form").forEach((f) => (f.noValidate = true)); const i = document.getElementById("introSequenceOverlay"); if (i) i.remove(); }); await page.waitForFunction(() => /Leaves On-Chain/.test(document.body.innerText), { timeout: 120000 }); await sleep(500); };
  const pool = new ethers.Contract(DEPLOY.pool, ["function nullifierSpent(uint256) view returns (bool)", "function isRagequit(uint256) view returns (bool)"], provider);
  const recipient = sink.address; // all test payouts go to a wallet we control, so nothing is ever stranded
  const recipient2 = sink.address;
  const phase = process.argv[2] || "all";
  const stateFile = SP + "/state.json";
  const st = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : {};

  try {
    if (phase === "L") {
      // Live-safe drill: only client-side on-chain steps (no Folio / relayer / approval needed), so it can run against
      // a production URL: unlock vault, deposit, ragequit through the UI, and verify the refund hit our sink wallet.
      await open();
      await tab("vault");
      await page.evaluate(() => document.getElementById("unlockVaultBtn").click());
      let lm = await modal(); rec("L1 Vault unlock (live bundle)", lm.t === "Vault Unlocked", lm.t); await closeModal();
      await tab("deposit");
      await set("#depositAmount", "0.0003");
      await page.evaluate(() => document.getElementById("submitDepositBtn").click());
      lm = await modal();
      const lnote = await page.$eval("#generatedNote", (e) => e.value).catch(() => null);
      ledgerAdd("live-deposit", lnote);
      rec("L2 Deposit 0.0003 ETH on the live site", lm.t === "Deposit Inscribed" && !!lnote, lm.t);
      await closeModal();
      if (lnote) {
        await tab("ragequit");
        await set("#ragequitNote", lnote);
        await set("#ragequitRecipient", sink.address);
        const b0 = await provider.getBalance(sink.address);
        await page.evaluate(() => document.getElementById("submitRagequitBtn").click());
        lm = await modal();
        const d = await deltaSince(provider, sink.address, b0, ethers.parseEther("0.0003"));
        rec("L3 Ragequit through the live UI refunds 0.0003", lm.t === "Ragequit Complete" && d === ethers.parseEther("0.0003"), `${lm.t}; +${ethers.formatEther(d)}`);
        await closeModal();
        await page.evaluate(() => document.getElementById("submitRagequitBtn").click());
        lm = await modal(); rec("L4 Second ragequit rejected", lm.t === "Ragequit Failed", lm.t + " / " + lm.b.slice(0, 50));
      }
    }

    if (phase === "R") {
      // App-level crash recovery: kill the page right after the deposit tx is sent, before the note is shown.
      await open();
      await tab("deposit");
      await set("#depositAmount", "0.0003");
      await page.evaluate(() => document.getElementById("submitDepositBtn").click());
      for (let i = 0; i < 120 && !sentTx; i++) await sleep(250);
      rec("R1 Deposit tx was broadcast", sentTx, "wallet received eth_sendTransaction");
      const pend = await page.evaluate(() => localStorage.getItem("marginalia.pending.v1"));
      rec("R2 Secret was persisted BEFORE the tx", !!pend, pend ? "pending secret present" : "missing");
      if (pend) { const l = loadLedger(); l.pending = l.pending || []; l.pending.push(JSON.parse(pend)); saveLedger(l); } // belt and braces
      await page.reload({ waitUntil: "domcontentloaded" }); // the "crash"
      const m = await modal();
      const note = await page.$eval("#generatedNote", (e) => e.value).catch(() => null);
      rec("R3 Reload recovers the note from the secret", m.t === "Pending Deposit Recovered" && !!note, m.t);
      ledgerAdd("recovered-by-app", note);
      const after = await page.evaluate(() => localStorage.getItem("marginalia.pending.v1"));
      rec("R4 Pending secret cleared after recovery", after === null, String(after));
    }

    if (phase === "1" || phase === "all") {
      await open();
      // 1. vault unlock first so deposits are stored
      await tab("vault");
      await page.waitForSelector("#unlockVaultBtn", { timeout: 30000 }); await page.evaluate(() => document.getElementById("unlockVaultBtn").click());
      let m = await modal();
      rec("B1 Vault unlock via EIP-712 signature", m.t === "Vault Unlocked", m.t + " / " + m.b.slice(0, 60));
      await closeModal();
      // 2. deposit A (to be withdrawn) and B (to be ragequit)
      for (const [name, amt] of [["A", "0.0004"], ["B", "0.0003"]]) {
        await tab("deposit");
        await set("#depositAmount", amt);
        await page.evaluate(() => document.getElementById("submitDepositBtn").click());
        m = await modal();
        const note = await page.$eval("#generatedNote", (e) => e.value).catch(() => null);
        rec(`B2${name} Deposit ${amt} ETH from browser`, m.t === "Deposit Inscribed" && !!note, m.t + (note ? " / note " + note.slice(0, 30) + "..." : ""));
        st[name] = note;
        ledgerAdd("deposit-" + name, note);
        if (process.env.CRASH_AFTER_DEPOSIT) { console.log("!! simulated hard crash right after the first deposit"); process.exit(99); }
        await closeModal();
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => /Leaves On-Chain/.test(document.body.innerText), { timeout: 120000 }); await sleep(500);
        await tab("vault"); await page.waitForSelector("#unlockVaultBtn", { timeout: 30000 }); await page.evaluate(() => document.getElementById("unlockVaultBtn").click()); await modal(); await closeModal();
      }
      // vault holds both?
      await tab("vault"); await sleep(400);
      const cnt = await page.$$eval("#vaultUnlocked .text-sun", (els) => els.length).catch(() => 0);
      rec("B3 Vault lists saved notes", cnt >= 1, `${cnt} entries visible`);
      fs.writeFileSync(stateFile, JSON.stringify(st));
    }

    if (phase === "2" || phase === "all") {
      if (process.env.AUTO_MAGISTRATE === "1") {
        // The automated Magistrate service must approve and publish on its own: we only WAIT, no manual step.
        console.log("-- waiting for the automated Magistrate service --");
        const M2 = require(R + "lib/marginalia");
        const want = [st.A, st.B].filter(Boolean).map((n) => M2.parseNote(n).label.toString());
        const t0 = Date.now();
        let seen = false;
        for (let i = 0; i < 240 && !seen; i++) { // up to 20 minutes
          try {
            const f = await (await fetch(BASE + "/api/folio")).json();
            seen = f.aspStale === false && want.every((l) => f.aspLabels.includes(l));
          } catch (_) {}
          if (!seen) await sleep(5000);
        }
        rec("B4 Automated Magistrate approved + published both new deposits (no manual step)", seen, `${((Date.now() - t0) / 1000).toFixed(0)}s after the deposits`);
      } else {
      // Magistrate approves (CLI, real on-chain tx)
      console.log("-- Magistrate approval via CLI --");
      const out = execFileSync("node", [R + "node_modules/hardhat/internal/cli/cli.js", "run", "scripts/magistrate-approve.js", "--network", "robinhoodTestnet"], {
        cwd: R, encoding: "utf8", timeout: 600000,
        env: { ...process.env, RH_LOG_CHUNK: process.env.RH_LOG_CHUNK || "10" },
      });
      console.log(out.split("\n").filter((l) => /Approved|Published|SKIP|DENY/.test(l)).join("\n"));
      rec("B4 Magistrate approved new deposits", /Published ASP root/.test(out), (out.match(/Approved .*/) || [""])[0]);
      // Deployments that read the label list from a published URL (no ../asp folder) need it published before withdrawing.
      if (process.env.ASP_PUBLISH_CMD) {
        console.log("-- publishing the approved-label list --");
        try { execFileSync(process.env.ASP_PUBLISH_CMD, { shell: true, cwd: R, stdio: "inherit", timeout: 120000 }); } catch (e) { console.log("publish command failed:", e.message); }
        let ok = false;
        for (let i = 0; i < 120 && !ok; i++) { // up to ~10 minutes (raw.githubusercontent.com caches for ~5 min)
          try { const r = await fetch(BASE + "/api/folio"); ok = r.ok && (await r.json()).aspStale === false; } catch (_) {}
          if (!ok) await sleep(5000);
        }
        rec("B4b Approved labels visible to the server", ok, ok ? "/api/folio serves the latest ASP root" : "timed out waiting for the latest ASP list");
      }
      }
    }

    if (phase === "3" || phase === "all") {
      await open();
      // vault persistence: import a note, lock, reload, unlock -> must be decrypted back
      await tab("vault");
      await page.evaluate(() => document.getElementById("unlockVaultBtn").click());
      let vm = await modal(); await closeModal();
      await set("#vaultImport", st.A);
      await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Import note").click());
      await sleep(500);
      await open(); await tab("vault");
      await page.evaluate(() => document.getElementById("unlockVaultBtn").click());
      vm = await modal(); await closeModal();
      rec("B3 Vault persists encrypted notes across reload", /\((?!0 )\d+ note/.test(vm.b), vm.b);
      const ls = await page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith("marginalia.vault")).map(([, v]) => v));
      rec("B3b Vault blob in localStorage is ciphertext (no note text)", ls.length === 1 && !ls[0].includes("marginalia-note") && !atob(ls[0]).includes("marginalia-note"), `blob ${ls[0] ? ls[0].length : 0} chars`);
      // 3. partial withdraw A via wallet mode
      await tab("withdraw");
      await set("#withdrawNote", st.A);
      await set("#withdrawRecipient", recipient);
      await set("#withdrawAmount", "0.0002");
      await page.select("#withdrawMode", "wallet");
      const t0 = Date.now();
      const sinkBefore1 = await provider.getBalance(recipient);
      await page.evaluate(() => document.getElementById("submitWithdrawBtn").click());
      let m = await modal();
      const bal1 = await deltaSince(provider, recipient, sinkBefore1, ethers.parseEther("0.0002"));
      const change = await page.$eval("#changeNote", (e) => e.value).catch(() => null);
      if (change) { st.Achange = change; ledgerAdd("change-A", change); fs.writeFileSync(stateFile, JSON.stringify(st)); }
      if (process.env.CRASH_AFTER_PARTIAL_WITHDRAW) { console.log("!! simulated hard crash right after the partial withdraw"); process.exit(98); }
      rec("B5 Partial withdraw 0.0002 ETH via wallet (in-browser proof)", m.t === "Withdrawal Confirmed" && bal1 === ethers.parseEther("0.0002") && !!change, `${m.t}; recipient +${ethers.formatEther(bal1)}; proof+tx ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      if (m.t !== "Withdrawal Confirmed") console.log("   modal:", m.b);
      st.Achange = change;
      await closeModal();

      // 4. relay mode: spend change note through the Courier
      await open();
      await tab("withdraw");
      await set("#withdrawNote", st.Achange);
      await set("#withdrawRecipient", recipient2);
      await set("#withdrawAmount", "");
      await page.select("#withdrawMode", "relay");
      const sinkBefore2 = await provider.getBalance(recipient2);
      await page.evaluate(() => document.getElementById("submitWithdrawBtn").click());
      m = await modal();
      const bal2 = await deltaSince(provider, recipient2, sinkBefore2);
      rec("B6 Withdraw change note via Mersenne Courier (gasless)", m.t === "Withdrawal Confirmed" && bal2 > 0n, `${m.t}; recipient2 +${ethers.formatEther(bal2)}`);
      if (m.t !== "Withdrawal Confirmed") console.log("   modal:", m.b);
      await closeModal();

      // 5. double spend through UI
      await open();
      await tab("withdraw");
      await set("#withdrawNote", st.A);
      await set("#withdrawRecipient", recipient);
      await page.select("#withdrawMode", "wallet");
      await page.evaluate(() => document.getElementById("submitWithdrawBtn").click());
      m = await modal();
      rec("B7 UI rejects re-spending a spent note", m.t === "Note Validation Failed" && /Wax Seal Broken/.test(m.b), m.t + " / " + m.b.slice(0, 50));
      await closeModal();

      // 6. ragequit B from the depositor wallet
      await open();
      await tab("ragequit");
      await set("#ragequitNote", st.B);
      await set("#ragequitRecipient", recipient);
      const before = await provider.getBalance(recipient);
      await page.evaluate(() => document.getElementById("submitRagequitBtn").click());
      m = await modal();
      const after = before + (await deltaSince(provider, recipient, before, ethers.parseEther("0.0003")));
      rec("B8 Ragequit from browser refunds the deposit", m.t === "Ragequit Complete" && after - before === ethers.parseEther("0.0003"), `${m.t}; +${ethers.formatEther(after - before)}`);
      if (m.t !== "Ragequit Complete") console.log("   modal:", m.b);
      await closeModal();
      // 7. ragequit again must fail
      await page.evaluate(() => document.getElementById("submitRagequitBtn").click());
      m = await modal();
      rec("B9 Second ragequit rejected", m.t === "Ragequit Failed", m.t + " / " + m.b.slice(0, 60));
      fs.writeFileSync(stateFile, JSON.stringify(st));
    }
  } catch (e) {
    console.log("DRIVER ERROR", e.message);
    console.log("PAGE TEXT:", (await page.evaluate(() => document.body.innerText).catch(() => "")).split("\n").filter((l) => /\[|REJECT|ERROR|Proof|Folio|Courier|rror/.test(l)).slice(0, 15).join(" | "));
    await page.screenshot({ path: SP + "/driver_error.png" }).catch(() => {});
  }
  // never leave a pending deposit secret behind in the throwaway browser profile
  try {
    const pend = await page.evaluate(() => localStorage.getItem("marginalia.pending.v1"));
    if (pend) { const l = loadLedger(); l.pending = l.pending || []; l.pending.push(JSON.parse(pend)); saveLedger(l); console.log("   saved a pending deposit secret to the ledger"); }
  } catch (_) {}
  await browser.close();
  const openLeft = await sweep("final");
  const fundsAtEnd = await totalFunds();
  const cost = fundsAtStart - fundsAtEnd;
  console.log(`funds at end: ${ethers.formatEther(fundsAtEnd)} ETH  (gas + fees spent this run: ${ethers.formatEther(cost)} ETH)`);
  rec("Z1 No test ETH stranded (all ledger notes spent)", openLeft === 0, `${openLeft} open note(s)`);
  rec("Z2 Run cost is only gas (< 0.0002 ETH)", cost < ethers.parseEther("0.0002"), ethers.formatEther(cost) + " ETH");
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} PASS`);
  process.exit(pass === results.length && results.length > 0 ? 0 : 1);
})();
