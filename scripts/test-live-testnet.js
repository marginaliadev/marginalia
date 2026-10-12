// Live testnet test of https://marginaliazk.tech (Robinhood Chain Testnet, 46630): API, every page, and two real
// shielded flows driven through the production UI by headless Chrome with an EIP-1193 shim (signing in Node).
//
//   node scripts/test-live-testnet.js [api|pages|flows|all]
//
//   Flow A: deposit -> (Magistrate approval) -> withdraw to the SAME wallet   ("taken by yourself")
//   Flow B: deposit -> (Magistrate approval) -> withdraw to ANOTHER wallet via the Mersenne Courier
//
// Env: LIVE_URL (default https://marginaliazk.tech), LIVE_DEPOSIT (default 0.00008), LIVE_FUND (default 0.0002),
//      APPROVAL_WAIT_MIN (default 25). Notes go to notes/e2e-ledger.json (gitignored) the instant they exist; a final
//      sweep ragequits whatever is unspent and returns the balances to the deployer. Results: docs/live-test/results.json.
const os = require("os");
const path = require("path");
const R = path.join(__dirname, "..") + path.sep;
process.chdir(R);
require(R + "node_modules/dotenv").config({ quiet: true });
const fs = require("fs");
const puppeteer = require(R + "node_modules/puppeteer-core");
const { ethers } = require(R + "node_modules/ethers");

const BASE = (process.env.LIVE_URL || "https://marginaliazk.tech").replace(/\/$/, "");
const DEP = process.env.LIVE_DEPOSIT || "0.00008";
const FUND = process.env.LIVE_FUND || "0.0002";
const WAIT_MIN = Number(process.env.APPROVAL_WAIT_MIN || 25);
const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT = R + "docs/live-test/";
const SHOTS = OUT + "screens/";
fs.mkdirSync(SHOTS, { recursive: true });
const LEDGER_FILE = R + "notes/e2e-ledger.json";
const loadLedger = () => (fs.existsSync(LEDGER_FILE) ? JSON.parse(fs.readFileSync(LEDGER_FILE, "utf8")) : { notes: [], pending: [] });
const saveLedger = (l) => fs.writeFileSync(LEDGER_FILE, JSON.stringify(l, null, 1));
const ledgerAdd = (name, note) => { if (!note) return; const l = loadLedger(); if (!l.notes.some((n) => n.note === note)) l.notes.push({ name, note, at: new Date().toISOString(), status: "open" }); saveLedger(l); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const rec = (id, name, ok, detail, extra = {}) => { results.push({ id, name, ok, detail: String(detail).slice(0, 400), at: new Date().toISOString(), ...extra }); console.log((ok ? "PASS " : "FAIL ") + id + " " + name + " :: " + String(detail).slice(0, 200)); fs.writeFileSync(OUT + "results.json", JSON.stringify(results, null, 1)); };
const note = (id, name, detail) => { results.push({ id, name, ok: null, detail: String(detail).slice(0, 600), at: new Date().toISOString() }); console.log("INFO " + id + " " + name + " :: " + String(detail).slice(0, 200)); fs.writeFileSync(OUT + "results.json", JSON.stringify(results, null, 1)); };
const get = async (p, init) => { const r = await fetch(BASE + p, { signal: AbortSignal.timeout(60000), ...init }); let j = null; const t = await r.text(); try { j = JSON.parse(t); } catch (_) {} return { status: r.status, json: j, text: t, headers: r.headers }; };
const post = (p, body) => get(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

(async () => {
  const phase = process.argv[2] || "all";
  const provider = new ethers.JsonRpcProvider(process.env.RH_TESTNET_RPC_URL, 46630, { staticNetwork: true });
  const deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  const walletA = new ethers.Wallet(fs.readFileSync(R + "notes/e2e-testwallet.key", "utf8").trim(), provider); // the "own" wallet
  const walletB = new ethers.Wallet(fs.readFileSync(R + "notes/e2e-sink.key", "utf8").trim(), provider); // the "other" wallet
  const DEPLOY = require(R + "deployments/robinhoodTestnet.json");
  const M = require(R + "lib/marginalia");
  const pool = new ethers.Contract(DEPLOY.pool, ["function nullifierSpent(uint256) view returns (bool)", "function isRagequit(uint256) view returns (bool)"], provider);
  const fmt = ethers.formatEther;
  const balances = async () => ({ deployer: await provider.getBalance(deployer.address), A: await provider.getBalance(walletA.address), B: await provider.getBalance(walletB.address) });
  const totalNow = async () => { const b = await balances(); return b.deployer + b.A + b.B; };
  const start = await balances();
  const fundsAtStart = start.deployer + start.A + start.B;
  console.log(`site ${BASE}\ndeployer ${deployer.address} ${fmt(start.deployer)}\nwalletA (own) ${walletA.address} ${fmt(start.A)}\nwalletB (other) ${walletB.address} ${fmt(start.B)}`);
  fs.writeFileSync(OUT + "wallets.json", JSON.stringify({ deployer: deployer.address, walletA: walletA.address, walletB: walletB.address, pool: DEPLOY.pool, site: BASE, startBalances: { deployer: fmt(start.deployer), A: fmt(start.A), B: fmt(start.B) } }, null, 1));

  // ------------------------------------------------------------------ API
  if (phase === "api" || phase === "all") {
    let r = await get("/api/status");
    const s = r.json;
    rec("API-01", "GET /api/status", r.status === 200 && s?.chain?.chainId === 46630 && s?.contracts?.pool?.toLowerCase() === DEPLOY.pool.toLowerCase() && s?.database?.connected === true && s?.relayer?.status === "active",
      `chain ${s?.chain?.chainId}, pool ${s?.contracts?.pool}, db ${s?.database?.connected}, leaves ${s?.database?.leavesCount}, asp ${s?.database?.aspCount}, relayer ${s?.relayer?.status}`);
    rec("API-02", "Status does not leak the RPC key", !/alch_[A-Za-z0-9]{10}/.test(r.text) && !/service_role|PRIVATE/i.test(r.text), (s?.chain?.rpcUrl) || "n/a");
    const chainPoolBal = await provider.getBalance(DEPLOY.pool);
    rec("API-03", "Pool balance in /api/status equals on-chain balance", ethers.parseEther(s.telemetry.poolBalanceEth) === chainPoolBal, `api ${s.telemetry.poolBalanceEth} vs chain ${fmt(chainPoolBal)}`);

    r = await get("/api/folio");
    const f = r.json;
    rec("API-04", "GET /api/folio returns tree + ASP", r.status === 200 && Array.isArray(f?.leaves) && !!f?.root && !!f?.aspRoot, `leaves ${f?.leaves?.length}, nextIndex ${f?.nextIndex}, aspLabels ${f?.aspLabels?.length}, aspStale ${f?.aspStale}`);
    let rebuilt = null;
    try { const H = await M.hasher(); const t = new M.MerkleTree(M.DEPTH, H, f.leaves.map(BigInt)); rebuilt = String(typeof t.root === "function" ? t.root() : t.root); } catch (e) { rebuilt = "err " + e.message; }
    rec("API-05", "Folio root recomputed locally equals served root", rebuilt === f?.root, `served ${String(f?.root).slice(0, 14)}… local ${String(rebuilt).slice(0, 14)}…`);
    const reg = new ethers.Contract(DEPLOY.register, ["function latestRoot() view returns (uint256)"], provider);
    const chainAsp = String(await reg.latestRoot());
    rec("API-06", "Served ASP root equals on-chain MagistrateRegister root", f?.aspRoot === chainAsp && f?.aspStale === false, `served ${String(f?.aspRoot).slice(0, 14)}… chain ${chainAsp.slice(0, 14)}… aspStale=${f?.aspStale}`);

    r = await get("/api/relay/quote");
    const q = r.json;
    rec("API-07", "GET /api/relay/quote", r.status === 200 && q?.relayerAvailable === true && BigInt(q?.minFeeWei || 0) > 0n, `available ${q?.relayerAvailable}, minFee ${q?.minFeeEth} ETH, gas ${q?.estimatedGas}, gwei ${q?.gasPriceGwei}, relayer ${q?.relayer}`);
    r = await post("/api/relay/quote", {});
    rec("API-08", "POST /api/relay/quote", r.status === 200 && r.json?.relayerAvailable === true, `status ${r.status}`);

    const ghost = "111222333444555666777";
    r = await post("/api/nullifier/check", { nullifier: ghost });
    rec("API-09", "nullifier/check unspent value", r.status === 200 && r.json?.isSpent === false && r.json?.onChainChecked === true, JSON.stringify(r.json).slice(0, 160));
    const spentLedger = loadLedger().notes.filter((n) => n.status === "spent");
    let spentNull = null;
    for (const n of spentLedger) { try { const p = M.parseNote(n.note); const nh = await M.nullifierOf(p.sk, p.rho); if (await pool.nullifierSpent(nh)) { spentNull = String(nh); break; } } catch (_) {} }
    if (spentNull) { r = await post("/api/nullifier/check", { nullifier: spentNull }); rec("API-10", "nullifier/check spent value (from ledger)", r.status === 200 && r.json?.isSpent === true, `isSpent ${r.json?.isSpent}`); }
    else note("API-10", "nullifier/check spent value", "no spent nullifier in the ledger to test with");
    for (const [id, nm, body, want] of [["API-11", "nullifier/check rejects hex", { nullifier: "0xdeadbeef" }, 400], ["API-12", "nullifier/check rejects empty", {}, 400], ["API-13", "nullifier/check rejects 79-digit number", { nullifier: "9".repeat(79) }, 400], ["API-14", "nullifier/check rejects SQL-ish string", { nullifier: "1; DROP TABLE x" }, 400]]) {
      r = await post("/api/nullifier/check", body); rec(id, nm, r.status === want, `status ${r.status} ${r.json?.error || ""}`);
    }
    r = await post("/api/note/validate", { note: "marginalia-note-v1-abc" });
    rec("API-15", "note/validate rejects malformed note", r.status >= 400 && r.status < 500, `status ${r.status} ${r.json?.error || r.text.slice(0, 80)}`);
    r = await post("/api/note/validate", { note: "" });
    rec("API-16", "note/validate rejects empty note", r.status >= 400 && r.status < 500, `status ${r.status}`);
    r = await post("/api/disclosure/generate", {});
    rec("API-17", "disclosure/generate is gone (404/405)", r.status === 404 || r.status === 405, `status ${r.status}`);
    r = await post("/api/relay/withdraw", { garbage: true });
    rec("API-19", "relay/withdraw rejects an invalid request (no tx sent)", r.status >= 400 && r.status < 500, `status ${r.status} ${r.json?.error || r.text.slice(0, 100)}`);
    r = await get("/api/does-not-exist");
    rec("API-20", "Unknown API route is 404", r.status === 404, `status ${r.status}`);
    r = await get("/api/folio/record", { method: "GET" });
    rec("API-21", "folio/record does not accept GET", r.status === 405 || r.status === 404, `status ${r.status}`);
    const hdr = (await get("/")).headers;
    const need = ["content-security-policy", "x-content-type-options", "strict-transport-security"];
    rec("API-22", "Security headers on /", need.every((h) => hdr.get(h)), need.map((h) => `${h}=${hdr.get(h) ? "yes" : "NO"}`).join(", "));
    note("API-23", "Other headers", `x-frame-options=${hdr.get("x-frame-options")}, referrer-policy=${hdr.get("referrer-policy")}, permissions-policy=${hdr.get("permissions-policy") ? "set" : "none"}`);
    // rate limit: /api/relay/withdraw is 10/min per client; probe with invalid bodies only
    let limited = 0; for (let i = 0; i < 14; i++) { const x = await post("/api/relay/withdraw", { garbage: i }); if (x.status === 429) limited++; }
    rec("API-24", "Rate limiter engages on /api/relay/withdraw (10/min)", limited > 0, `${limited} of 14 rapid requests answered 429`);
  }

  // ------------------------------------------------------------------ browser helpers
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--window-size=1500,1000"], defaultViewport: { width: 1500, height: 1000 } });
  const cspViolations = [];
  const attach = (page, bucket) => {
    page.on("pageerror", (e) => bucket.push("pageerror: " + e.message.slice(0, 160)));
    page.on("console", (m) => { const t = m.text(); if (/Content Security Policy|violates the following/i.test(t)) cspViolations.push(t.slice(0, 200)); if (m.type() === "error") bucket.push("console.error: " + t.slice(0, 160)); });
    page.on("requestfailed", (r) => { if (!/_rsc|favicon|google|analytics/.test(r.url())) bucket.push("requestfailed: " + r.url().slice(0, 100) + " " + (r.failure()?.errorText || "")); });
    page.on("response", (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) bucket.push(`http ${r.status()}: ` + r.url().slice(0, 100)); });
  };
  const settle = (page) => page.waitForFunction(() => !document.getElementById("introSequenceOverlay"), { timeout: 20000 }).catch(() => {});
  const shot = (page, name) => page.screenshot({ path: SHOTS + name + ".png" }).catch(() => {});
  const modalOf = async (page, timeout = 600000) => {
    await page.waitForSelector(".noir-modal-card", { visible: true, timeout });
    return { t: await page.$eval(".noir-modal-title", (e) => e.textContent.trim()), b: await page.$eval(".noir-modal-body", (e) => e.textContent.trim()) };
  };
  const closeModal = async (page) => { for (let i = 0; i < 10; i++) { if (!(await page.$("#noirModalCloseBtn"))) return; await page.evaluate(() => document.getElementById("noirModalCloseBtn")?.click()); await sleep(400); } };
  const setVal = (page, sel, text) => page.evaluate((selector, value) => {
    const el = document.querySelector(selector);
    if (!el) throw new Error("setVal: no element " + selector);
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "INPUT" ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value || ""); el.dispatchEvent(new Event("input", { bubbles: true }));
  }, sel, text);
  const tab = async (page, name) => { await closeModal(page); await page.waitForSelector(`button[data-tab="${name}"]`, { timeout: 60000 }); await page.evaluate((n) => document.querySelector(`button[data-tab="${n}"]`).click(), name); await sleep(500); };
  const openApp = async (page) => { await page.goto(BASE + "/app", { waitUntil: "domcontentloaded" }); await page.evaluate(() => { document.querySelectorAll("form").forEach((x) => (x.noValidate = true)); }); await settle(page); await page.waitForFunction(() => /Leaves On-Chain/.test(document.body.innerText), { timeout: 120000 }); await sleep(600); };
  const click = (page, id) => page.evaluate((i) => document.getElementById(i).click(), id);
  const withWallet = async (page, w, onTx) => {
    await page.exposeFunction("__walletRequest", async (method, params) => {
      switch (method) {
        case "eth_requestAccounts": case "eth_accounts": return [w.address];
        case "eth_chainId": return "0xb626";
        case "net_version": return "46630";
        case "wallet_switchEthereumChain": return null;
        case "eth_signTypedData_v4": { const td = JSON.parse(params[1]); const types = { ...td.types }; delete types.EIP712Domain; return await w.signTypedData(td.domain, types, td.message); }
        case "eth_sendTransaction": { const t = params[0]; const tx = await w.sendTransaction({ to: t.to, data: t.data, value: t.value ? BigInt(t.value) : 0n }); onTx && onTx(tx.hash); return tx.hash; }
        default: return await provider.send(method, params);
      }
    });
    await page.evaluateOnNewDocument(() => { window.ethereum = { isMetaMask: true, request: ({ method, params }) => window.__walletRequest(method, params || []), on() {}, removeListener() {} }; });
  };
  const delta = async (addr, before, atLeast = 1n) => { let d = 0n; for (let i = 0; i < 40; i++) { d = (await provider.getBalance(addr)) - before; if (d >= atLeast) break; await sleep(1500); } return d; };

  // ------------------------------------------------------------------ pages (no wallet)
  if (phase === "pages" || phase === "all") {
    const pagesList = [["/", "Landing"], ["/app", "App"], ["/explorer", "Explorer"], ["/compliance", "Compliance"], ["/codex", "Codex"], ["/zzz-not-found", "404 page"]];
    let n = 1;
    for (const [p, label] of pagesList) {
      const page = await browser.newPage(); const errs = []; attach(page, errs);
      const resp = await page.goto(BASE + p, { waitUntil: "networkidle2", timeout: 90000 }).catch((e) => ({ status: () => 0, err: e.message }));
      await settle(page); await sleep(800);
      const title = await page.title(); const h = await page.evaluate(() => document.body.innerText.length);
      const expect404 = p === "/zzz-not-found";
      const st = resp.status();
      const noisy = errs.filter((e) => !(expect404 && /404/.test(e)));
      rec(`PG-0${n}`, `${label} page loads (${p})`, expect404 ? st === 404 : st === 200 && h > 300, `HTTP ${st}, title "${title}", ${h} chars of text`);
      rec(`PG-0${n}b`, `${label}: no console/page/network errors`, noisy.length === 0, noisy.length ? noisy.slice(0, 3).join(" | ") : "clean");
      await shot(page, `page-${label.toLowerCase().replace(/ /g, "-")}-desktop`);
      await page.setViewport({ width: 390, height: 844, isMobile: true }); await page.reload({ waitUntil: "networkidle2" }).catch(() => {}); await settle(page); await sleep(600);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      rec(`PG-0${n}c`, `${label}: mobile 390px has no horizontal overflow`, overflow <= 2, `scrollWidth - viewport = ${overflow}px`);
      await shot(page, `page-${label.toLowerCase().replace(/ /g, "-")}-mobile`);
      await page.close(); n++;
    }
    // navigation links from the landing page
    {
      const page = await browser.newPage(); await page.goto(BASE + "/", { waitUntil: "networkidle2" }); await settle(page);
      const hrefs = await page.evaluate(() => [...new Set([...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")))]);
      const internal = hrefs.filter((h) => h.startsWith("/") && !h.startsWith("//") && !h.includes("_next") && !/\.(svg|png|ico)/.test(h)).map((h) => h.split("#")[0] || "/");
      const bad = []; for (const h of [...new Set(internal)]) { const r = await get(h); if (r.status >= 400) bad.push(h + "=" + r.status); }
      rec("PG-07", "Every internal link on the landing page resolves", bad.length === 0, bad.length ? bad.join(", ") : `${new Set(internal).size} internal routes OK`);
      const ext = hrefs.filter((h) => /^https?:/.test(h));
      note("PG-08", "External links on landing", ext.join(", "));
      await page.close();
    }

    // ---------------- App guards (no wallet)
    {
      const page = await browser.newPage(); const errs = []; attach(page, errs);
      await openApp(page); await shot(page, "app-loaded");
      const stats = await page.evaluate(() => document.body.innerText.match(/Leaves On-Chain[\s\S]{0,40}/)?.[0]?.replace(/\s+/g, " "));
      note("APP-00", "App header stats", stats || "n/a");
      await tab(page, "deposit"); await setVal(page, "#depositAmount", "0.05"); await click(page, "submitDepositBtn");
      let m = await modalOf(page, 20000); rec("APP-01", "Deposit without wallet -> Wallet Required", /wallet/i.test(m.t), m.t); await shot(page, "app-guard-deposit-no-wallet"); await closeModal(page);
      await tab(page, "withdraw"); await click(page, "submitWithdrawBtn");
      m = await modalOf(page, 20000); rec("APP-02", "Withdraw with empty fields rejected", /missing|invalid|required/i.test(m.t), m.t); await shot(page, "app-guard-withdraw-empty"); await closeModal(page);
      await setVal(page, "#withdrawNote", "marginalia-note-v1-abc"); await setVal(page, "#withdrawRecipient", "not-an-address"); await click(page, "submitWithdrawBtn");
      m = await modalOf(page, 20000); rec("APP-03", "Withdraw with invalid recipient rejected", /recipient|address|invalid/i.test(m.t + m.b), m.t + " / " + m.b.slice(0, 60)); await closeModal(page);
      await setVal(page, "#withdrawRecipient", walletB.address); await click(page, "submitWithdrawBtn");
      m = await modalOf(page, 20000); rec("APP-04", "Withdraw with tampered note rejected", /note|json|invalid|malformed/i.test(m.t + m.b), m.t + " / " + m.b.slice(0, 60)); await shot(page, "app-guard-tampered-note"); await closeModal(page);
      const Hh = await M.hasher(); const fk = { sk: 1n, rho: 2n, value: 80000000000000n, label: 3n }; fk.commitment = Hh([fk.value, fk.label, Hh([Hh([fk.sk]), fk.rho])]);
      const fakeNote = M.serializeNote(fk);
      await setVal(page, "#withdrawNote", fakeNote); await click(page, "submitWithdrawBtn");
      m = await modalOf(page, 60000); rec("APP-05", "Well-formed note that was never deposited rejected (not in Folio)", /not found|not inscribed|folio|validation/i.test(m.t + m.b), m.t + " / " + m.b.slice(0, 80)); await shot(page, "app-guard-unknown-note"); await closeModal(page);
      await tab(page, "courier"); await page.waitForSelector("#fetchCourierQuoteBtn"); await click(page, "fetchCourierQuoteBtn"); await page.waitForSelector("#courierQuoteDisplay", { visible: true, timeout: 30000 }).catch(() => {});
      const cq = await page.evaluate(() => ({ gas: document.getElementById("courierGasPrice")?.textContent, fee: document.getElementById("courierMinFeeEth")?.textContent, addr: document.getElementById("courierAddress")?.textContent }));
      rec("APP-06", "Courier quote shows gas, min fee and relayer address", !!cq.fee && /0x[0-9a-fA-F]{4}/.test(cq.addr || ""), JSON.stringify(cq)); await shot(page, "app-courier-quote");
      await tab(page, "ragequit"); await setVal(page, "#ragequitNote", "marginalia-note-v1-invalid"); await setVal(page, "#ragequitRecipient", walletB.address); await click(page, "submitRagequitBtn");
      m = await modalOf(page, 20000); rec("APP-07", "Ragequit with invalid note rejected", /fail|invalid|note/i.test(m.t + m.b), m.t + " / " + m.b.slice(0, 60)); await shot(page, "app-guard-ragequit"); await closeModal(page);
      await tab(page, "vault"); await click(page, "unlockVaultBtn");
      m = await modalOf(page, 20000); rec("APP-08", "Vault unlock without wallet -> Wallet Required", /wallet/i.test(m.t), m.t); await shot(page, "app-guard-vault"); await closeModal(page);
      rec("APP-09", "No console/page errors during app guard tests", errs.filter((e) => !/http 4\d\d|status of 4\d\d/.test(e)).length === 0, errs.slice(0, 3).join(" | ") || "clean");
      await page.close();
    }

    // ---------------- Explorer
    {
      const page = await browser.newPage(); const errs = []; attach(page, errs);
      await page.goto(BASE + "/explorer", { waitUntil: "networkidle2" }); await settle(page); await sleep(1500);
      const api = (await get("/api/status")).json;
      const ui = await page.evaluate(() => ({ leaves: document.getElementById("folioNotesCount")?.textContent, asp: document.getElementById("aspApprovedCount")?.textContent, bal: document.getElementById("poolBalance")?.textContent }));
      rec("EX-01", "Explorer telemetry matches /api/status", String(ui.leaves).trim() == String(api.database.leavesCount) && (ui.bal || "").includes(api.telemetry.poolBalanceEth.slice(0, 6)), JSON.stringify(ui) + " vs api leaves " + api.database.leavesCount + ", bal " + api.telemetry.poolBalanceEth);
      note("EX-01b", "Explorer ASP counter text", `UI shows "${ui.asp}" while the ASP list has ${(await get("/api/folio")).json.aspLabels.length} labels and /api/status aspCount=${api.database.aspCount}`);
      await shot(page, "explorer-loaded");
      const seal = async (v) => { await setVal(page, "#nullifierHashInput", v); await page.evaluate(() => document.getElementById("nullifierHashInput").form.requestSubmit()); await page.waitForSelector("#sealStatusBadge", { timeout: 30000 }).catch(() => {}); await sleep(1500); return page.evaluate(() => document.getElementById("sealStatusBadge")?.textContent.trim() || null); };
      let spentNull = null; for (const n of loadLedger().notes.filter((x) => x.status === "spent")) { try { const p = M.parseNote(n.note); const nh = await M.nullifierOf(p.sk, p.rho); if (await pool.nullifierSpent(nh)) { spentNull = String(nh); break; } } catch (_) {} }
      let b = await seal("111222333444555666777"); rec("EX-02", "Wax Seal: unknown nullifier -> INTACT (UNSPENT)", /INTACT/.test(b || ""), b); await shot(page, "explorer-seal-unspent");
      if (spentNull) { b = await seal(spentNull); rec("EX-03", "Wax Seal: spent nullifier -> BROKEN (SPENT)", /BROKEN/.test(b || ""), b); await shot(page, "explorer-seal-spent"); } else note("EX-03", "Wax Seal spent", "no spent nullifier available");
      await page.evaluate(() => { const i = document.getElementById("nullifierHashInput"); }); await setVal(page, "#nullifierHashInput", "0xabc");
      await page.evaluate(() => document.getElementById("nullifierHashInput").form.requestSubmit()); await sleep(2500);
      const shown = await page.evaluate(() => document.getElementById("sealStatusBadge")?.textContent.trim() || null);
      rec("EX-04", "Wax Seal: hex input must NOT be reported as a valid UNSPENT seal", !/INTACT/.test(shown || "") || shown === null, `badge after invalid input: ${shown}`);
      await shot(page, "explorer-seal-invalid-input");
      rec("EX-05", "Explorer: no console/page errors (400s from the deliberate invalid input excluded)", errs.filter((e) => !/http 4\d\d|status of 4\d\d/.test(e)).length === 0, errs.slice(0, 3).join(" | ") || "clean");
      await page.close();
    }

    // ---------------- Compliance
    {
      const page = await browser.newPage(); const errs = []; attach(page, errs);
      await page.goto(BASE + "/compliance", { waitUntil: "networkidle2" }); await settle(page); await sleep(800);
      const ids = await page.evaluate(() => ["screening", "viewing-keys", "disclosure-notice", "appeals"].map((i) => [i, !!document.getElementById(i)]));
      rec("CO-01", "Compliance sections present (screening, viewing keys, disclosure notice, appeals)", ids.every((x) => x[1]), JSON.stringify(ids)); await shot(page, "compliance-loaded");
      const noGen = await page.evaluate(() => !document.getElementById("generateDisclosureBtn") && !document.getElementById("disclosureNote"));
      rec("CO-02", "The Letter of Disclosure generator is removed from the page", noGen, noGen ? "no generator controls" : "generator controls still present");
      for (const a of ["screening", "viewing-keys"]) { await page.evaluate((x) => document.getElementById(x)?.scrollIntoView(), a); await sleep(300); }
      await shot(page, "compliance-sections");
      rec("CO-09", "Compliance: no console/page errors", errs.filter((e) => !/http 4\d\d|status of 4\d\d/.test(e)).length === 0, errs.slice(0, 3).join(" | ") || "clean");
      await page.close();
    }
    function crypto_gen() { const c = require("crypto"); const kp = c.generateKeyPairSync("x25519"); return { pub: kp.publicKey.export({ type: "spki", format: "pem" }) }; }
  }

  // ------------------------------------------------------------------ flows (real on-chain)
  const flowState = fs.existsSync(OUT + "flow-state.json") ? JSON.parse(fs.readFileSync(OUT + "flow-state.json", "utf8")) : {};
  const saveFlow = () => fs.writeFileSync(OUT + "flow-state.json", JSON.stringify(flowState, null, 1));
  if (phase === "flows" || phase === "all") {
    // top up wallet A (the depositor) from the deployer
    const needA = ethers.parseEther(FUND);
    if ((await provider.getBalance(walletA.address)) < needA * 9n / 10n) {
      const topUp = needA - (await provider.getBalance(walletA.address));
      const tx = await deployer.sendTransaction({ to: walletA.address, value: topUp }); await tx.wait(); note("FL-00", "Funded wallet A from the deployer", `${fmt(topUp)} ETH, tx ${tx.hash}`);
    }
    const page = await browser.newPage(); const errs = []; attach(page, errs);
    const txs = []; await withWallet(page, walletA, (h) => txs.push(h));
    await openApp(page);
    await tab(page, "vault"); await click(page, "unlockVaultBtn");
    let m = await modalOf(page, 60000); rec("FL-01", "Vault unlock via EIP-712 wallet signature", m.t === "Vault Unlocked", m.t + " / " + m.b.slice(0, 60)); await shot(page, "flow-vault-unlocked"); await closeModal(page);
    // deposits
    for (const flow of ["A", "B"]) {
      if (flowState[flow]?.note) continue;
      await tab(page, "deposit"); await setVal(page, "#depositAmount", DEP);
      const poolBefore = await provider.getBalance(DEPLOY.pool);
      await click(page, "submitDepositBtn"); m = await modalOf(page, 300000);
      const n = await page.$eval("#generatedNote", (e) => e.value).catch(() => null);
      ledgerAdd("live-flow-" + flow, n);
      const poolAfter = await provider.getBalance(DEPLOY.pool);
      const depTx = txs[txs.length - 1];
      rec(`FL-0${flow === "A" ? 2 : 3}`, `Flow ${flow}: shielded deposit ${DEP} ETH from wallet A through the live UI`, m.t === "Deposit Inscribed" && !!n && poolAfter - poolBefore === ethers.parseEther(DEP), `${m.t}; pool +${fmt(poolAfter - poolBefore)}; tx ${depTx}`, { tx: depTx });
      await shot(page, `flow-${flow}-deposit-inscribed`);
      flowState[flow] = { note: n, depositTx: depTx, depositedAt: new Date().toISOString(), label: n ? M.parseNote(n).label.toString() : null }; saveFlow();
      await closeModal(page);
      await openApp(page); await tab(page, "vault"); await click(page, "unlockVaultBtn"); await modalOf(page, 60000); await closeModal(page);
    }
    // wait for the Magistrate to approve both labels
    console.log(`-- waiting up to ${WAIT_MIN} min for the live Magistrate to approve both deposits --`);
    const t0 = Date.now(); let approved = false, last = null;
    while (Date.now() - t0 < WAIT_MIN * 60000) {
      try { const f = (await get("/api/folio")).json; last = `aspStale=${f.aspStale}, labels=${f.aspLabels.length}`; approved = f.aspStale === false && [flowState.A.label, flowState.B.label].every((l) => f.aspLabels.includes(l)); if (approved) break; } catch (e) { last = e.message; }
      await sleep(15000);
    }
    const waited = ((Date.now() - t0) / 1000).toFixed(0);
    rec("FL-04", "Live Magistrate approves and publishes both new deposits automatically", approved, approved ? `approved after ${waited}s` : `NOT approved within ${WAIT_MIN} min (${last})`);
    flowState.approved = approved; saveFlow();

    if (approved) {
      // Flow A: take it yourself -> wallet A, wallet mode (self pays gas)
      await openApp(page); await tab(page, "withdraw");
      await setVal(page, "#withdrawNote", flowState.A.note); await setVal(page, "#withdrawRecipient", walletA.address); await setVal(page, "#withdrawAmount", ""); await page.select("#withdrawMode", "wallet");
      const a0 = await provider.getBalance(walletA.address); const ta = Date.now();
      await click(page, "submitWithdrawBtn"); m = await modalOf(page, 900000);
      const a1 = await provider.getBalance(walletA.address);
      rec("FL-05", "Flow A: withdraw to the SAME wallet (self-paid gas, in-browser Groth16 proof)", m.t === "Withdrawal Confirmed" && a1 > a0, `${m.t}; wallet A ${fmt(a0)} -> ${fmt(a1)} (+${fmt(a1 - a0)}), proof+tx ${((Date.now() - ta) / 1000).toFixed(0)}s`, { tx: txs[txs.length - 1] });
      await shot(page, "flow-A-withdraw-self"); flowState.A.withdrawTx = txs[txs.length - 1]; saveFlow(); await closeModal(page);
      const nh = await M.nullifierOf(M.parseNote(flowState.A.note).sk, M.parseNote(flowState.A.note).rho);
      rec("FL-06", "Flow A: nullifier now spent on-chain", await pool.nullifierSpent(nh), "nullifierSpent=true");
      // Flow B: other wallet via Courier (gasless for the depositor)
      await openApp(page); await tab(page, "withdraw");
      await setVal(page, "#withdrawNote", flowState.B.note); await setVal(page, "#withdrawRecipient", walletB.address); await setVal(page, "#withdrawAmount", ""); await page.select("#withdrawMode", "relay");
      const b0 = await provider.getBalance(walletB.address); const aBefore = await provider.getBalance(walletA.address); const tb = Date.now();
      await click(page, "submitWithdrawBtn"); m = await modalOf(page, 900000);
      const bd = await delta(walletB.address, b0, 1n); const aAfter = await provider.getBalance(walletA.address);
      rec("FL-07", "Flow B: withdraw to ANOTHER wallet via the Mersenne Courier", m.t === "Withdrawal Confirmed" && bd > 0n, `${m.t}; wallet B +${fmt(bd)} (deposit ${DEP} minus relayer fee); proof+relay ${((Date.now() - tb) / 1000).toFixed(0)}s`); await shot(page, "flow-B-withdraw-other-wallet-courier");
      rec("FL-08", "Flow B: depositor wallet A paid no gas (gasless relay)", aAfter === aBefore, `wallet A balance change ${fmt(aAfter - aBefore)} ETH`);
      rec("FL-09", "Flow B: payout = deposit - fee, fee within the quoted minimum", bd < ethers.parseEther(DEP) && ethers.parseEther(DEP) - bd <= 3n * BigInt((await get("/api/relay/quote")).json.minFeeWei), `payout ${fmt(bd)} ETH, fee ${fmt(ethers.parseEther(DEP) - bd)} ETH`);
      await closeModal(page);
      // double spend through the UI
      for (const [id, fl] of [["FL-10", "A"], ["FL-11", "B"]]) {
        await openApp(page); await tab(page, "withdraw"); await setVal(page, "#withdrawNote", flowState[fl].note); await setVal(page, "#withdrawRecipient", walletA.address); await page.select("#withdrawMode", "wallet");
        await click(page, "submitWithdrawBtn"); m = await modalOf(page, 120000);
        rec(id, `Flow ${fl}: re-spending the spent note is rejected by the UI (Wax Seal Broken)`, /Validation Failed/.test(m.t) && /Wax Seal Broken/i.test(m.b), m.t + " / " + m.b.slice(0, 70)); await closeModal(page);
      }
      // explorer shows both seals broken
      const ex = await browser.newPage(); await ex.goto(BASE + "/explorer", { waitUntil: "networkidle2" }); await settle(ex);
      for (const [id, fl] of [["FL-12", "A"], ["FL-13", "B"]]) {
        const p = M.parseNote(flowState[fl].note); const nhx = String(await M.nullifierOf(p.sk, p.rho));
        await setVal(ex, "#nullifierHashInput", nhx); await ex.evaluate(() => document.getElementById("nullifierHashInput").form.requestSubmit()); await sleep(3500);
        const bg = await ex.evaluate(() => document.getElementById("sealStatusBadge")?.textContent.trim());
        rec(id, `Explorer shows Flow ${fl} nullifier as BROKEN (SPENT)`, /BROKEN/.test(bg || ""), bg); await shot(ex, `flow-${fl}-explorer-seal-broken`);
      }
      await ex.close();
    } else {
      note("FL-05", "Withdraw flows skipped", "Deposits could not be withdrawn privately because the live ASP never included them. The sweep below recovers the funds via ragequit and that path is tested instead.");
      // Test the ragequit path from the UI for both notes (original depositor, wallet A) -> A takes it back, B payout to other wallet
      for (const [id, fl, to] of [["FL-05r", "A", walletA.address], ["FL-07r", "B", walletB.address]]) {
        await openApp(page); await tab(page, "ragequit"); await setVal(page, "#ragequitNote", flowState[fl].note); await setVal(page, "#ragequitRecipient", to);
        const before = await provider.getBalance(to); await click(page, "submitRagequitBtn"); m = await modalOf(page, 600000); const d = await delta(to, before, 1n);
        rec(id, `Flow ${fl} (fallback): ragequit through the UI to ${fl === "A" ? "own wallet" : "the other wallet"}`, m.t === "Ragequit Complete" && d > 0n, `${m.t}; +${fmt(d)}`); await shot(page, `flow-${fl}-ragequit`); await closeModal(page);
      }
    }
    rec("FL-15", "No console/page errors during the flows", errs.filter((e) => !/http 4\d\d|status of 4\d\d/.test(e)).length === 0, errs.slice(0, 3).join(" | ") || "clean");
    await page.close();
  }

  await browser.close();
  rec("SEC-01", "No Content-Security-Policy violations in any page", cspViolations.length === 0, cspViolations[0] || "none");

  // ------------------------------------------------------------------ sweep: return funds to deployer
  if (phase === "flows" || phase === "all" || phase === "sweep") {
    console.log("-- sweep --");
    const reserve = ethers.parseUnits("0.1", "gwei") * 21000n * 3n;
    for (const w of [walletA, walletB]) {
      const bal = await provider.getBalance(w.address);
      if (bal > reserve * 2n) { const tx = await w.sendTransaction({ to: deployer.address, value: bal - reserve, gasLimit: 21000n, gasPrice: ethers.parseUnits("0.1", "gwei") }); await tx.wait(); console.log(`   returned ${fmt(bal - reserve)} from ${w.address.slice(0, 8)}`); }
    }
    const openNotes = []; for (const n of loadLedger().notes) { if (n.status === "spent") continue; try { const p = M.parseNote(n.note); if (!(await pool.nullifierSpent(await M.nullifierOf(p.sk, p.rho))) && !(await pool.isRagequit(p.label))) openNotes.push(n.name); } catch (_) {} }
    const end = await balances(); const fundsAtEnd = end.deployer + end.A + end.B;
    rec("SEC-02", "No test ETH stranded in an unspent note", openNotes.length === 0, openNotes.length ? "open: " + openNotes.join(", ") + " (run scripts/test-browser-e2e.js none)" : "all notes spent");
    note("SEC-03", "Funds accounting", `start ${fmt(fundsAtStart)} -> end ${fmt(fundsAtEnd)} (gas + relayer fee: ${fmt(fundsAtStart - fundsAtEnd)} ETH). deployer ${fmt(end.deployer)}, A ${fmt(end.A)}, B ${fmt(end.B)}`);
  }
  const pass = results.filter((r) => r.ok === true).length, fail = results.filter((r) => r.ok === false).length;
  console.log(`\n${pass} PASS, ${fail} FAIL, ${results.filter((r) => r.ok === null).length} INFO`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("DRIVER ERROR", e); process.exit(2); });
