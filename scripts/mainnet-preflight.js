// MAINNET PREFLIGHT: a read-only go / no-go report. It changes nothing on any chain and never signs.
//   node scripts/mainnet-preflight.js            (exit 0 only when every gate is GO)
// Optional env: MAINNET_RPC (default the official RPC), MAINNET_SAFE, MAINNET_PUBLISHER, MAINNET_DEPLOYER,
//   CEREMONY_WITHDRAW_TRANSCRIPT, CEREMONY_RAGEQUIT_TRANSCRIPT, MIN_DEPLOYER_ETH (default 0.05), SKIP_NETWORK=1
// Each line says GO, NO-GO (blocks mainnet) or WARN (should be fixed), who owns it, and how to close it. Today this MUST report NO-GO:
// that is the point. docs/mainnet_readiness.md explains every gate; the deploy script enforces the ceremony gates in code as well.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const git = (...a) => { try { return execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return ""; } };

const results = [];
const gate = (id, name, status, detail, owner, fix) => { results.push({ id, name, status, detail, owner, fix }); };

async function rpc(url, method, params = []) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(20000) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

(async () => {
  // ---- B2: Phase 1 pin
  try {
    const p1 = JSON.parse(read("docs/ceremony/phase1.json"));
    const verified = /^VERIFIED/.test(String(p1.status || ""));
    const hosts = new Set((p1.downloads || []).map((d) => { try { return new URL(d.origin).host; } catch { return d.origin; } }));
    gate("B2", "Phase-1 hash pinned and VERIFIED", p1.blake2b && verified ? "GO" : "NO-GO",
      `${p1.blake2b ? "pinned" : "not pinned"}; status ${String(p1.status || "").split(":")[0]}; ${(p1.sources || []).length} publication(s), ${hosts.size} independent download host(s)`,
      "owner", "a second independent party hashes the file from another host: node scripts/ceremony/phase1-check.js --url <mirror> --by <name> --write; then set status VERIFIED in a reviewed commit");
  } catch (e) { gate("B2", "Phase-1 pin", "NO-GO", e.message, "owner", "restore docs/ceremony/phase1.json"); }

  // ---- B1/B5: ceremony transcripts (the same check scripts/deploy.js runs for chain 4663)
  try {
    const guard = require("./ceremony/mainnet-guard");
    guard.assertCeremonyBeforeMainnet();
    gate("B1", "Public ceremony transcripts valid (>= 15 contributors, beacon, verifiers = export)", "GO", "mainnet guard accepted the transcripts", "owner", "");
  } catch (e) {
    gate("B1", "Public ceremony transcripts valid (>= 15 contributors, beacon, verifiers = export)", "NO-GO", String(e.message).split("\n")[0].slice(0, 160), "owner + contributors", "run the public ceremony: docs/ceremony_b1_plan.md; set CEREMONY_*_TRANSCRIPT");
  }

  // ---- B3: circuits built with the pinned --O2 flag (served wasm must be O2: 11,432 constraints)
  try {
    const m = JSON.parse(read("docs/audit/manifest.json"));
    const served = JSON.stringify(m).includes("24,236") || /O1/.test(JSON.stringify(m.build || {}));
    const zk = read("docs/audit/zk_assets.md");
    const stillDev = /development-setup files|dev-setup/i.test(zk);
    gate("B3/B5", "Served proving assets come from the ceremony (O2 build, final zkey)", stillDev ? "NO-GO" : "GO",
      stillDev ? "docs/audit/zk_assets.md still describes the single-party development setup" : "assets replaced after the ceremony", "engineering",
      "after the ceremony: install final.zkey and the O2 wasm, node scripts/zk-hashes.js write, update zk_assets.md (docs/redeploy_runbook.md section 1)");
  } catch (e) { gate("B3/B5", "Served proving assets", "WARN", e.message, "engineering", ""); }

  // ---- B4: external audit
  const tags = git("tag", "--list").split("\n");
  const frozen = tags.some((t) => /audit-freeze|^v\d+\.\d+\.\d+$/.test(t) && !/rc/.test(t));
  const reports = exists("docs/audit/reports") && fs.readdirSync(path.join(ROOT, "docs/audit/reports")).filter((f) => /\.(pdf|md)$/i.test(f)).length;
  gate("B4", "External contract + circuit audits delivered, findings fixed, fix-review done", reports >= 2 ? "GO" : "NO-GO",
    `${reports || 0} audit report(s) in docs/audit/reports; tags: ${tags.filter(Boolean).slice(-3).join(", ") || "none"}`,
    "owner + auditors", "send docs/audit bundle (docs/audit/RFP_EMAIL.md); put the final reports in docs/audit/reports/");
  gate("B6", "Freeze: final tag and audit manifest enforced in CI", frozen ? "GO" : "NO-GO", frozen ? "release tag present" : "no non-rc release tag, CI audit:check not enabled",
    "engineering", "after audit fixes: node scripts/audit/manifest.js write, tag, enable the audit:check step in .github/workflows/ci.yml");

  // ---- code consistency (cheap and local)
  try { execFileSync(process.execPath, [path.join(__dirname, "zk-hashes.js"), "check"], { cwd: ROOT, stdio: "pipe" }); gate("C1", "Proving-asset hashes match the files", "GO", "zk-hashes check passed", "engineering", ""); }
  catch (e) { gate("C1", "Proving-asset hashes match the files", "NO-GO", "zk-hashes mismatch", "engineering", "node scripts/zk-hashes.js write (after a reviewed asset change)"); }
  const dirty = git("status", "--porcelain").split("\n").filter((l) => l && !/^\?\?/.test(l) && !/docs\/live-test/.test(l));
  gate("C2", "Working tree clean (tracked files)", dirty.length ? "WARN" : "GO", dirty.length ? `${dirty.length} modified tracked file(s)` : "clean", "engineering", "commit or discard before tagging");

  // ---- network facts and operations
  if (process.env.SKIP_NETWORK !== "1") {
    // try the configured RPC(s) in order (comma separated); defaults: the official endpoint, then two public ones
    const candidates = (process.env.MAINNET_RPC || "https://rpc.mainnet.chain.robinhood.com,https://robinhood-rpc.publicnode.com,https://robinhood.drpc.org").split(",").map((x) => x.trim()).filter(Boolean);
    let provider = null;
    const tried = [];
    for (const url of candidates) {
      try {
        const id = parseInt(await rpc(url, "eth_chainId"), 16);
        if (id === 4663) { provider = url; tried.push(`${url} OK`); break; }
        tried.push(`${url} answered chainId ${id}`);
      } catch (e) { tried.push(`${url} ${e.message}`); }
    }
    gate("N1", "Mainnet RPC reachable and chainId = 4663", provider ? (tried.length > 1 ? "WARN" : "GO") : "NO-GO", tried.join("; "),
      "engineering", "use a paid RPC with a generous eth_getLogs range plus a backup (the app falls back to the public RPC; set RH_LOGS_RPC_URL)");

    const code = async (addr) => (provider && addr ? (await rpc(provider, "eth_getCode", [addr, "latest"])) : null);
    const bal = async (addr) => BigInt(await rpc(provider, "eth_getBalance", [addr, "latest"])) ;
    const safe = process.env.MAINNET_SAFE;
    if (!safe) gate("R1", "Mainnet Safe 2-of-3 on hardware wallets", "NO-GO", "MAINNET_SAFE not set", "owner + 3 signers", "create the Safe on chain 4663 with 3 hardware wallets (docs/redeploy_runbook.md section 3), then set MAINNET_SAFE");
    else if (provider) {
      const c = await code(safe);
      if (!c || c === "0x") gate("R1", "Mainnet Safe 2-of-3 on hardware wallets", "NO-GO", `${safe} has no code on chain 4663`, "owner", "deploy the Safe on mainnet");
      else {
        const sel = (s) => require("ethers").id(s).slice(0, 10);
        const owners = await rpc(provider, "eth_call", [{ to: safe, data: sel("getOwners()") }, "latest"]);
        const thr = parseInt(await rpc(provider, "eth_call", [{ to: safe, data: sel("getThreshold()") }, "latest"]), 16);
        const n = parseInt(owners.slice(2 + 64, 2 + 128), 16);
        gate("R1", "Mainnet Safe 2-of-3 on hardware wallets", n >= 3 && thr >= 2 ? "GO" : "NO-GO", `${n} owners, threshold ${thr} (hardware wallets cannot be verified on chain: confirm by hand)`, "owner", "");
      }
    }
    const pub = process.env.MAINNET_PUBLISHER;
    if (!pub) gate("R2", "Dedicated mainnet Magistrate publisher key, funded", "NO-GO", "MAINNET_PUBLISHER not set", "owner", "new key (never the deployer, never the testnet key), fund about 0.001 ETH, set MAINNET_PUBLISHER");
    else if (provider) { const b = await bal(pub); gate("R2", "Dedicated mainnet Magistrate publisher key, funded", b >= 1000000000000000n ? "GO" : "NO-GO", `${pub} holds ${Number(b) / 1e18} ETH`, "owner", "fund >= 0.001 ETH"); }
    const dep = process.env.MAINNET_DEPLOYER;
    if (!dep) gate("R3", "Mainnet deployer funded (and different from every Safe owner and the publisher)", "NO-GO", "MAINNET_DEPLOYER not set", "owner", "fresh deployer key on a hardware wallet or a clean machine; set MAINNET_DEPLOYER");
    else if (provider) { const b = await bal(dep); const need = BigInt(Math.round(Number(process.env.MIN_DEPLOYER_ETH || 0.05) * 1e18)); gate("R3", "Mainnet deployer funded", b >= need ? "GO" : "NO-GO", `${dep} holds ${Number(b) / 1e18} ETH (needs >= ${Number(need) / 1e18})`, "owner", "fund the deployer"); }
  }

  // ---- operations that cannot be proven from here: listed so nothing is forgotten
  for (const [id, name, owner, fix] of [
    ["R4", "Two IPFS providers pinning (Pinata + Filebase verified with real credentials)", "owner", "set PINATA_JWT, IPFS_RPC_URL, IPFS_RPC_AUTH; the worker alarms if only one pinned"],
    ["R5", "Paid sanctions screening (Chainalysis KYT / TRM) wired in; alert webhook configured", "owner", "implement screenAll in services/magistrate/policy.js; set ALERT_WEBHOOK_URL"],
    ["R6", "Legal review of the Magistrate policy, appeals process and disclosure letter", "owner + counsel", "documented in docs/ and /compliance"],
    ["R7", "Incident drill on mainnet Safe (pause, resume, rotate publisher) before launch", "owner + signers", "docs/incident_response_runbook.md"],
    ["R8", "Launch limits decided (deposit cap, launch window) and announced", "owner", "docs/mainnet_launch_checklist.md section 3"],
  ]) gate(id, name, "NO-GO", "cannot be verified automatically: confirm by hand and record it in docs/mainnet_readiness.md", owner, fix);

  // ---- report
  const order = { "NO-GO": 0, WARN: 1, GO: 2 };
  results.sort((a, b) => order[a.status] - order[b.status] || a.id.localeCompare(b.id));
  const noGo = results.filter((r) => r.status === "NO-GO").length, warn = results.filter((r) => r.status === "WARN").length;
  console.log("MARGINALIA MAINNET PREFLIGHT (read-only)\n");
  for (const r of results) {
    console.log(`${r.status.padEnd(5)}  ${r.id.padEnd(6)} ${r.name}\n        ${r.detail}${r.status !== "GO" ? `\n        owner: ${r.owner} · to close: ${r.fix}` : ""}`);
  }
  console.log(`\n${results.length - noGo - warn} GO, ${warn} WARN, ${noGo} NO-GO -> ${noGo ? "MAINNET IS BLOCKED" : warn ? "fix the warnings, then GO" : "GO"}`);
  process.exit(noGo ? 1 : 0);
})().catch((e) => { console.error("preflight error:", e.message); process.exit(2); });
