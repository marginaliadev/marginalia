// Soak check for the automated Magistrate + Courier (Fase 03 gate before v0.3.0-rc1).
//   SOAK_FROM=2026-10-10T11:00:00Z APP_URL=https://marginalia-dev-production.up.railway.app node scripts/soak-check.js
// Read-only: no transaction, no secret. Run it any time during the 48/72 hours, and at the end; the exit code is the verdict.
// Env: SOAK_FROM (ISO start, default: 48 h ago), SOAK_HOURS (required length, default 48), RH_TESTNET_RPC_URL (needs a large
//      eth_getLogs range: the public RPC is fine; RH_LOG_CHUNK), PUBLISHER (publisher address to watch balance of),
//      MAX_PUBLISH_LAG_MIN (default 25: a new deposit must be covered by a published root within this time).
const path = require("path");
const R = path.join(__dirname, "..") + path.sep;
require(R + "node_modules/dotenv").config({ quiet: true });
const { ethers } = require(R + "node_modules/ethers");
const M = require(R + "lib/marginalia");
const D = require(R + "deployments/robinhoodTestnet.json");

const APP = (process.env.APP_URL || "").replace(/\/$/, "");
const HOURS = Number(process.env.SOAK_HOURS || 48);
const FROM = process.env.SOAK_FROM ? new Date(process.env.SOAK_FROM) : new Date(Date.now() - HOURS * 3600e3);
const MAX_LAG = Number(process.env.MAX_PUBLISH_LAG_MIN || 25) * 60;
const CHUNK = Number(process.env.RH_LOG_CHUNK || 5000000);
const GATEWAYS = ["https://gateway.pinata.cloud/ipfs/", "https://ipfs.io/ipfs/", "https://dweb.link/ipfs/"];

const results = [];
const rec = (name, ok, detail) => { results.push({ name, ok }); console.log((ok ? "PASS " : "FAIL ") + name + " :: " + detail); };

async function logs(contract, filter, from, to) {
  const out = [];
  for (let a = from; a <= to; a += CHUNK) out.push(...(await contract.queryFilter(filter, a, Math.min(to, a + CHUNK - 1))));
  return out;
}

(async () => {
  const provider = new ethers.JsonRpcProvider(process.env.RH_TESTNET_RPC_URL || "https://rpc.testnet.chain.robinhood.com", 46630, { staticNetwork: true });
  const abiOf = (n) => require(R + "services/magistrate/abi/" + n + ".json");
  const pool = new ethers.Contract(D.pool, abiOf("MarginaliaPool"), provider);
  const reg = new ethers.Contract(D.register, abiOf("MagistrateRegister"), provider);
  const head = await provider.getBlock("latest");
  const elapsedH = (Date.now() - FROM.getTime()) / 3600e3;

  // block at SOAK_FROM (binary search on timestamps)
  let lo = D.deployBlock, hi = head.number;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; const b = await provider.getBlock(mid); if (b.timestamp * 1000 < FROM.getTime()) lo = mid; else hi = mid; }
  const fromBlock = hi;
  const ts = new Map();
  const when = async (bn) => { if (!ts.has(bn)) ts.set(bn, (await provider.getBlock(bn)).timestamp); return ts.get(bn); };

  console.log(`soak window: ${FROM.toISOString()} -> now (${elapsedH.toFixed(1)} h of ${HOURS} h required), blocks ${fromBlock}..${head.number}`);
  rec(`Window length >= ${HOURS} h`, elapsedH >= HOURS, `${elapsedH.toFixed(1)} h elapsed`);

  const deposits = await logs(pool, pool.filters.Deposited(), fromBlock, head.number);
  const roots = await logs(reg, reg.filters.RootPublished(), fromBlock, head.number);
  const changes = await logs(reg, reg.filters.MagistrateChanged(), fromBlock, head.number);
  console.log(`events: ${deposits.length} deposits, ${roots.length} roots published, ${changes.length} Magistrate changes`);

  // 1. every deposit is covered by a root within MAX_LAG (ragequit deposits are exempt: they leave the list)
  let late = 0, uncovered = 0, worst = 0;
  const rootBlocks = roots.map((r) => r.blockNumber).sort((a, b) => a - b);
  for (const d of deposits) {
    if (await pool.isRagequit(d.args.label)) continue;
    const next = rootBlocks.find((b) => b >= d.blockNumber);
    if (!next) { const age = head.timestamp - (await when(d.blockNumber)); if (age > MAX_LAG) uncovered++; continue; }
    const lag = (await when(next)) - (await when(d.blockNumber));
    worst = Math.max(worst, lag);
    if (lag > MAX_LAG) late++;
  }
  rec(`Every deposit covered by a published root within ${MAX_LAG / 60} min`, late === 0 && uncovered === 0, `worst lag ${(worst / 60).toFixed(1)} min, ${late} late, ${uncovered} still uncovered`);

  // 2. roots: spacing (rate limit respected) and the latest one is retrievable and verifies
  const times = [];
  for (const r of roots) times.push(await when(r.blockNumber));
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  rec("Roots spaced >= 14 min apart (rate limit)", gaps.every((g) => g >= 14 * 60) || gaps.length === 0, gaps.length ? `min gap ${(Math.min(...gaps) / 60).toFixed(1)} min over ${gaps.length} gaps` : "fewer than 2 roots in the window");
  const latest = await reg.latestRoot();
  const uri = await reg.rootData(latest);
  let doc = null;
  if (uri.startsWith("ipfs://")) for (const g of GATEWAYS) { try { const r = await fetch(g + uri.slice(7), { signal: AbortSignal.timeout(20000) }); if (r.ok) { doc = await r.json(); break; } } catch {} }
  if (doc) {
    const tree = await M.buildAspTree((doc.labels || []).map(BigInt));
    rec("Latest root: list retrievable from IPFS and equals the on-chain root", tree.root() === latest && (doc.labels || []).length > 0, `${(doc.labels || []).length} labels, ${uri}`);
  } else rec("Latest root: list retrievable from IPFS and equals the on-chain root", false, `not retrievable: ${uri}`);

  // 3. Magistrate and balances
  const mag = await reg.magistrate();
  const watch = process.env.PUBLISHER || mag;
  const pb = await provider.getBalance(watch);
  rec("Publisher holds >= 0.0005 ETH", pb >= ethers.parseEther("0.0005"), `${watch} ${ethers.formatEther(pb)} ETH`);
  rec("Current Magistrate is not the deployer", mag.toLowerCase() !== D.deployer.toLowerCase(), mag);

  // 4. the app
  if (APP) {
    try {
      const st = await (await fetch(APP + "/api/status", { signal: AbortSignal.timeout(60000) })).json();
      rec("Relayer healthy", !!(st.relayer && st.relayer.healthy), `${st.relayer && st.relayer.balanceEth} ETH`);
      rec("Database connected", !!(st.database && st.database.connected), JSON.stringify(st.database));
      const fo = await (await fetch(APP + "/api/folio", { signal: AbortSignal.timeout(120000) })).json();
      rec("Folio served with the latest root (not stale)", !!fo.aspLabels && fo.aspStale === false, fo.error ? fo.error.slice(0, 120) : `labels ${fo.aspLabels.length}`);
      const q = await (await fetch(APP + "/api/relay/quote", { method: "POST", signal: AbortSignal.timeout(60000) })).json();
      rec("Courier quote uses observed gas", q.gasSource === "observed", `${q.gasSource}, ${q.gasSamples} samples, ${q.estimatedGas} gas`);
    } catch (e) { rec("App reachable", false, e.message); }
  } else console.log("(APP_URL not set: app checks skipped)");

  // 5. Supabase decision log is growing and still append-only
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = require(R + "frontend/node_modules/@supabase/supabase-js");
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data, error } = await db.from("asp_decisions").select("id,created_at").eq("pool_address", D.pool.toLowerCase()).gte("created_at", FROM.toISOString()).limit(1000);
    rec("asp_decisions rows written by the worker in the window", !error && data.length > 0, error ? error.message : `${data.length} rows`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks pass` + (failed.length ? `; failing: ${failed.map((f) => f.name).join(" | ")}` : ""));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error("ERROR:", e.message); process.exit(2); });
