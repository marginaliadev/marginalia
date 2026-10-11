// Fase 03 / H4 tests: relayer health, quote, fee policy, serialization and alerts.
//   (cd frontend && npx next build) && node scripts/test-relayer-health.js
// Starts two `next start` servers: one with a healthy relayer wallet and one below its minimum balance.
// No transaction is ever sent: every relay uses a forged proof and is rejected at validation.
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const { ethers } = require("ethers");

const FRONTEND = path.join(__dirname, "..", "frontend");
const key = ethers.Wallet.createRandom().privateKey; // empty wallet: balance only matters through RELAYER_MIN_BALANCE_ETH
const relayerAddr = new ethers.Wallet(key).address;
const results = [];
const rec = (n, ok, d) => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + n + " :: " + d); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startNext(port, extraEnv) {
  const p = spawn(process.execPath, [path.join(FRONTEND, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port)], {
    cwd: FRONTEND, env: { ...process.env, RELAYER_PRIVATE_KEY: key, ...extraEnv }, stdio: ["ignore", "pipe", "pipe"],
  });
  p.stdout.on("data", () => {}); p.stderr.on("data", () => {});
  return p;
}
async function waitReady(base) {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + "/api/relay/quote", { method: "POST" })).ok) return; } catch (_) {} await sleep(1000); }
  throw new Error("server did not start: " + base);
}
const post = async (base, p, body) => { const r = await fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
const forged = (value, fee) => ({
  withdrawal: { recipient: "0x00000000000000000000000000000000000000b0", relayer: relayerAddr, fee: String(fee) },
  proof: { pA: ["1", "2"], pB: [["1", "2"], ["3", "4"]], pC: ["1", "2"], pubSignals: [String(value), "1", "2", "3", "4", "5"] },
});

(async () => {
  const hooks = [];
  const hook = http.createServer((req, res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { hooks.push(b); res.end("ok"); }); });
  await new Promise((r) => hook.listen(0, r));
  const hookUrl = `http://127.0.0.1:${hook.address().port}/alert`;

  const healthy = startNext(3101, { RELAYER_MIN_BALANCE_ETH: "0" });
  const sick = startNext(3102, { RELAYER_MIN_BALANCE_ETH: "1000", ALERT_WEBHOOK_URL: hookUrl });
  const A = "http://127.0.0.1:3101", B = "http://127.0.0.1:3102";
  try {
    await Promise.all([waitReady(A), waitReady(B)]);

    // ---- H4-TEST2: availability follows the balance
    const qa = await (await fetch(A + "/api/relay/quote", { method: "POST" })).json();
    rec("H4-T2a healthy relayer is offered", qa.relayerAvailable === true && qa.relayer === relayerAddr, `available=${qa.relayerAvailable}`);
    const qb = await (await fetch(B + "/api/relay/quote", { method: "POST" })).json();
    rec("H4-T2b low-balance relayer is NOT offered", qb.relayerAvailable === false && qb.relayerReason === "low-balance", `available=${qb.relayerAvailable} reason=${qb.relayerReason}`);
    const sb = await (await fetch(B + "/api/status")).json();
    rec("H4-T2c /api/status exposes balance + health", sb.relayer && sb.relayer.healthy === false && typeof sb.relayer.balanceEth === "string", JSON.stringify(sb.relayer));

    // ---- quote shape
    rec("H4-T1a quote is valid for 120s", qa.validUntil - Date.now() > 100000 && qa.validUntil - Date.now() <= 121000, `${Math.round((qa.validUntil - Date.now()) / 1000)}s`);
    rec("H4-T1c quote reports its gas basis (no relays yet -> measured default)", qa.gasSource === "default" && qa.gasSamples === 0 && qa.estimatedGas === 1150000, `${qa.gasSource}, ${qa.gasSamples} samples, ${qa.estimatedGas} gas`);
    const minFee = BigInt(qa.minFeeWei);
    rec("H4-T1b quoted minimum = gas x price x 110%", minFee === (BigInt(qa.estimatedGas) * ethers.parseUnits(qa.gasPriceGwei, "gwei") * 11000n) / 10000n, `${qa.minFeeEth} ETH`);

    // ---- H4-TEST4: fee policy
    const value = ethers.parseEther("0.001");
    let r = await post(A, "/api/relay/withdraw", forged(value, 1));
    rec("H4-T4a fee far below minimum rejected", r.s === 400 && /Insufficient relayer fee/.test(r.j.error), r.j.error?.slice(0, 70));
    const tolerated = (minFee * 91n) / 100n; // inside the 90% tolerance
    r = await post(A, "/api/relay/withdraw", forged(value, tolerated));
    rec("H4-T4b fee at 91% of minimum passes the fee check (fails later, on the forged proof)", r.s === 400 && /validation failed/.test(r.j.error), r.j.error?.slice(0, 70));
    const tooLow = (minFee * 80n) / 100n;
    r = await post(A, "/api/relay/withdraw", forged(value, tooLow));
    rec("H4-T4c fee at 80% of minimum rejected", r.s === 400 && /Insufficient relayer fee/.test(r.j.error), r.j.error?.slice(0, 70));
    r = await post(A, "/api/relay/withdraw", forged(value, value * 6n / 10n));
    rec("H4-T4d fee above 50% of the value rejected", r.s === 400 && /50%/.test(r.j.error), r.j.error);
    r = await post(A, "/api/relay/withdraw", { ...forged(value, minFee), withdrawal: { ...forged(value, minFee).withdrawal, relayer: "0x00000000000000000000000000000000000000a1" } });
    rec("H4-T4e wrong relayer address rejected", r.s === 400 && /Invalid relayer address/.test(r.j.error), r.j.error?.slice(0, 60));

    // ---- unavailable relayer never accepts work
    r = await post(B, "/api/relay/withdraw", forged(value, minFee * 2n));
    rec("H4-T2d unhealthy relayer refuses to relay (503, user told to use the wallet)", r.s === 503 && /wallet/.test(r.j.error), `${r.s} ${r.j.error?.slice(0, 70)}`);

    // ---- H4-TEST3: concurrency (forged proofs: nothing is sent, nothing may 500)
    const burst = await Promise.all(Array.from({ length: 5 }, () => post(A, "/api/relay/withdraw", forged(value, minFee * 2n))));
    rec("H4-T3 five simultaneous relays: all answered cleanly", burst.every((x) => x.s === 400 || x.s === 429), burst.map((x) => x.s).join(","));

    // ---- H4-T3 alert: webhook fired once despite several low-balance reads
    await fetch(B + "/api/relay/quote", { method: "POST" }); await fetch(B + "/api/relay/quote", { method: "POST" });
    await sleep(1500);
    rec("H4-T3b low-balance alert webhook fired exactly once (rate limited)", hooks.length === 1 && /below/.test(hooks[0]), `${hooks.length} call(s)`);
  } finally {
    healthy.kill(); sick.kill(); hook.close();
  }
  const pass = results.filter(Boolean).length;
  console.log(`\n${pass}/${results.length} PASS`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
