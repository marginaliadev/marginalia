// Automated Magistrate worker.   node services/magistrate/index.js [--once] [--status]
//
// Required env : MAGISTRATE_PUBLISHER_KEY  (a DEDICATED hot key; the Safe owns the register and can replace it with setMagistrate)
//                RH_TESTNET_RPC_URL
// Pinning      : PINATA_JWT and/or IPFS_RPC_URL (+ IPFS_RPC_AUTH). Use two providers: the service alarms when only one pinned.
// Policy       : DENYLIST / DENYLIST_FILE / DENYLIST_URL (manual list: hacks, exploits), the OFAC public list (on; OFAC_LIST=off disables,
//                OFAC_LIST_URL overrides), CHAINALYSIS_API_KEY (free sanctions API). Any DENY wins; any screening failure stops publication.
// RPC          : RH_TESTNET_RPC_URL and RH_LOGS_RPC_URL accept several comma-separated URLs (automatic fallback)
// Tuning       : MAGISTRATE_MIN_INTERVAL_MIN (15)  MAGISTRATE_TICK_SEC (60)  MAGISTRATE_MIN_BALANCE_ETH (0.0005)
//                MAGISTRATE_LAG_ALERT_MIN (30)  RH_LOG_CHUNK (10; large on RPCs that allow it)  RH_LOGS_RPC_URL
//                MAGISTRATE_STORE=supabase (state, verdict log and root index in Supabase; default is a local file)
//                MAGISTRATE_STATE_FILE  MAGISTRATE_HEALTH_PORT  DEPLOYMENT_FILE  ALERT_WEBHOOK_URL  ASP_IPFS_GATEWAYS
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const http = require("http");
const { ethers } = require("ethers");
const M = require("../../lib/marginalia");
const aspStore = require("../../lib/aspStore");
const { MagistrateService } = require("./service");
const { denylistPolicy, ofacPolicy, chainalysisPolicy, composePolicies } = require("./policy");
const { FileStore, SupabaseStore } = require("./store");

const env = process.env;
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);

async function alertWebhook(msg) {
  log(`ALERT: ${msg}`);
  if (!env.ALERT_WEBHOOK_URL) return;
  try {
    await fetch(env.ALERT_WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: `MARGINALIA magistrate: ${msg}`, content: `MARGINALIA magistrate: ${msg}` }), signal: AbortSignal.timeout(10000) });
  } catch (_) {}
}

/** One live instance only: two workers would race on nonces and double-publish. */
function acquireLock(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(file, String(process.pid), { flag: "wx" });
  } catch (_) {
    const pid = Number(fs.readFileSync(file, "utf8"));
    let alive = false;
    try { process.kill(pid, 0); alive = true; } catch (_) {}
    if (alive && pid !== process.pid) throw new Error(`another magistrate instance is running (pid ${pid}); remove ${file} if that is wrong`);
    fs.writeFileSync(file, String(process.pid));
  }
  const release = () => { try { fs.unlinkSync(file); } catch (_) {} };
  process.on("exit", release);
  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));
}

/** manual list (hacks/exploits you maintain) + OFAC public list (on by default) + Chainalysis free API (when a key is set) */
function buildPolicy() {
  const list = [denylistPolicy({ inline: env.DENYLIST, file: env.DENYLIST_FILE, url: env.DENYLIST_URL })];
  list[0].name = "manual";
  if (env.OFAC_LIST !== "off") list.push(ofacPolicy({ url: env.OFAC_LIST_URL || undefined, file: env.OFAC_CACHE_FILE || path.join(__dirname, "state", "ofac-cache.json"), log }));
  if (env.CHAINALYSIS_API_KEY) list.push(chainalysisPolicy({ apiKey: env.CHAINALYSIS_API_KEY }));
  return composePolicies(list);
}

/** One or several RPC URLs (comma separated). Several = automatic fallback if the first provider is down. */
function rpcProvider(urls, chainId) {
  const list = String(urls).split(",").map((u) => u.trim()).filter(Boolean);
  const mk = (u) => new ethers.JsonRpcProvider(u, chainId, { staticNetwork: true });
  if (list.length === 1) return mk(list[0]);
  return new ethers.FallbackProvider(list.map((u, i) => ({ provider: mk(u), priority: i + 1, weight: 1, stallTimeout: 3000 })), chainId, { quorum: 1 });
}

async function build() {
  if (!env.MAGISTRATE_PUBLISHER_KEY) throw new Error("MAGISTRATE_PUBLISHER_KEY is required");
  const d = require(path.resolve(env.DEPLOYMENT_FILE || path.join(__dirname, "../../deployments/robinhoodTestnet.json")));
  const provider = rpcProvider(env.RH_TESTNET_RPC_URL, d.chainId || 46630);
  const logsProvider = env.RH_LOGS_RPC_URL ? rpcProvider(env.RH_LOGS_RPC_URL, d.chainId || 46630) : provider;
  const wallet = new ethers.Wallet(env.MAGISTRATE_PUBLISHER_KEY, provider);
  // ABIs are committed (services/magistrate/abi): the worker image does not compile the contracts, so build artifacts do not exist there.
  const abi = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "abi", `${n}.json`), "utf8"));
  const register = new ethers.Contract(d.register, abi("MagistrateRegister"), wallet);
  const pool = new ethers.Contract(d.pool, abi("MarginaliaPool"), logsProvider);

  const stateFile = env.MAGISTRATE_STATE_FILE || path.join(__dirname, "state", `${d.network || "network"}.json`);
  acquireLock(stateFile + ".lock");

  // State: Supabase when MAGISTRATE_STORE=supabase (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY and the Fase 03 migration); else a local file.
  let store;
  if (env.MAGISTRATE_STORE === "supabase") {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("MAGISTRATE_STORE=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    const { createClient } = require("@supabase/supabase-js");
    // ws transport: Node 20 has no native WebSocket (the worker never uses realtime)
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, realtime: { transport: require("ws") } });
    store = new SupabaseStore(client, { poolAddress: d.pool, log });
    await store.load();
    log(`state restored from Supabase: cursor ${store.state.cursor}, ${Object.keys(store.state.deposits).length} deposits${store.errors ? ", WITH ERRORS: " + store.lastError : ""}`);
  } else {
    store = new FileStore(stateFile);
  }

  const pinners = aspStore.pinnersFromEnv(env);
  if (!pinners.length) throw new Error("No IPFS pinner configured (PINATA_JWT / IPFS_RPC_URL)");
  const svc = new MagistrateService({
    provider: logsProvider, pool, register, M,
    store,
    policy: buildPolicy(),
    pinners, chainId: d.chainId || 46630, deployBlock: d.deployBlock || 0, logChunk: Number(env.RH_LOG_CHUNK || 10),
    minIntervalMs: Number(env.MAGISTRATE_MIN_INTERVAL_MIN || 15) * 60_000,
    lagAlertMs: Number(env.MAGISTRATE_LAG_ALERT_MIN || 30) * 60_000,
    minBalanceWei: ethers.parseEther(env.MAGISTRATE_MIN_BALANCE_ETH || "0.0005"),
    gateways: env.ASP_IPFS_GATEWAYS ? env.ASP_IPFS_GATEWAYS.split(",").map((s) => s.trim()) : null,
    alert: alertWebhook, log,
  });
  // the service reads logs from `logsProvider` but publishes through the wallet's provider
  svc.provider = logsProvider;
  return { svc, wallet };
}

async function main() {
  const { svc } = await build();
  if (process.argv.includes("--status")) { console.log(JSON.stringify(await svc.status(), null, 2)); return; }
  if (process.argv.includes("--once")) { const r = await svc.safeTick(); log(JSON.stringify(r, (_, v) => (typeof v === "bigint" ? v.toString() : v))); process.exit(r.action === "error" ? 1 : 0); }

  const port = Number(env.MAGISTRATE_HEALTH_PORT || 8081);
  http.createServer(async (req, res) => {
    try {
      const s = await svc.status();
      res.statusCode = s.ok ? 200 : 503;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(s));
    } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ ok: false, error: e.message })); }
  }).listen(port, () => log(`health on :${port}`));

  const everyMs = Number(env.MAGISTRATE_TICK_SEC || 60) * 1000;
  for (;;) {
    const r = await svc.safeTick();
    if (r.action !== "noop") log(JSON.stringify(r, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
    await new Promise((r2) => setTimeout(r2, everyMs));
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
