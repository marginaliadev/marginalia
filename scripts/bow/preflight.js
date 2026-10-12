#!/usr/bin/env node
// Go / no-go report for the 0xbow route (read-only, signs nothing). Self-contained: it covers the vendoring and deployment gates AND the
// operational gates a mainnet launch needs (Safe, publisher, deployer, screening, legal review, drills, launch limits), because several gates of
// scripts/mainnet-preflight.js are specific to our own ceremony. That script stays as it is and still guards the old route.
//   node scripts/bow/preflight.js                 exit 0 only when every gate is GO
//   node scripts/bow/preflight.js --ignore D1     skip the listed gates (used by the mainnet deploy script: D1 is what the deploy produces)
//   SKIP_NETWORK=1 node scripts/bow/preflight.js
// Env for the on-chain checks: MAINNET_RPC (comma separated), MAINNET_SAFE, MAINNET_PUBLISHER, MAINNET_DEPLOYER, MIN_DEPLOYER_ETH (default 0.05).
// Manual gates are closed by docs/bow/signoff.json (see signoff.example.json); a missing or incomplete entry is NO-GO.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const TOOL = path.join(ROOT, "scripts", "vendor", "0xbow.js");
const argv = process.argv.slice(2);
const ignore = new Set((argv.includes("--ignore") ? argv[argv.indexOf("--ignore") + 1] : "").split(",").filter(Boolean));
const results = [];
const gate = (id, name, status, detail, owner, fix) => { if (!ignore.has(id)) results.push({ id, name, status, detail, owner, fix }); };
const tool = (...a) => spawnSync(process.execPath, [TOOL, ...a], { cwd: ROOT, encoding: "utf8", timeout: 180000 });
const first = (r) => String(r.stderr || r.stdout || "").trim().split("\n").filter(Boolean).slice(0, 2).join(" | ").slice(0, 200);

async function rpc(url, method, params = []) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(15000) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

(async () => {
  // ---- automatic gates: vendoring
  { const r = tool("verify"); gate("V1", "Vendored 0xbow files match the manifest", r.status === 0 ? "GO" : "NO-GO", r.status === 0 ? "all files match" : first(r), "engineering", "never edit vendor/0xbow; re-sync from a pristine clone of the pinned tag"); }
  { const r = tool("vkey"); gate("V2", "Verifier constants equal the ceremony verification keys", r.status === 0 ? "GO" : "NO-GO", r.status === 0 ? "withdraw and commitment verifiers match" : first(r), "engineering", "restore the vendored verifiers"); }
  if (process.env.SKIP_NETWORK === "1") gate("V3", "Empty diff against upstream tag v1.2.1", "WARN", "skipped (SKIP_NETWORK=1)", "engineering", "run without SKIP_NETWORK before the go decision");
  else { const r = tool("verify", "--upstream"); gate("V3", "Empty diff against upstream tag v1.2.1", r.status === 0 ? "GO" : "NO-GO", r.status === 0 ? "EMPTY diff, pinned commit confirmed" : first(r), "engineering", "the vendored tree must equal the tag byte for byte"); }

  // ---- automatic gates: deployment and front end
  { const f = path.join(ROOT, "deployments", "bow-robinhoodTestnet.json"); gate("T1", "Testnet deployment of the unmodified core exists and is recorded", fs.existsSync(f) ? "GO" : "NO-GO", fs.existsSync(f) ? "deployments/bow-robinhoodTestnet.json" : "missing", "engineering", "node scripts/bow/deploy.js ... then readback.js and e2e.mjs"); }
  {
    const f = path.join(ROOT, "deployments", "bow-robinhood.json");
    let ok = false, detail = "no mainnet record (expected until the owner orders the deploy)";
    if (fs.existsSync(f)) { const j = JSON.parse(fs.readFileSync(f, "utf8")); ok = j.chainId === 4663; detail = ok ? "mainnet record present" : `record is for chain ${j.chainId}`; }
    gate("D1", "Fresh mainnet deployment recorded and read back", ok ? "GO" : "NO-GO", detail, "owner", "node scripts/bow/deploy.js --network mainnet (dry run first), then readback.js with --expect-owner/--expect-postman");
  }
  {
    let wired = false, detail = "";
    try {
      const z = fs.readFileSync(path.join(ROOT, "frontend", "src", "lib", "zk-hashes-bow.ts"), "utf8");
      const m = JSON.parse(fs.readFileSync(path.join(ROOT, "vendor", "0xbow", "MANIFEST.json"), "utf8"));
      const hashesOk = Object.values(m.artifacts).every((a) => z.includes(a.sha256));
      const page = fs.existsSync(path.join(ROOT, "frontend", "src", "app", "pool", "page.tsx")) && /bow-zk/.test(fs.readFileSync(path.join(ROOT, "frontend", "src", "app", "pool", "page.tsx"), "utf8"));
      wired = hashesOk && page;
      detail = wired ? "the /pool page proves with assets pinned from the manifest" : !hashesOk ? "zk-hashes-bow.ts differs from the manifest (run: node scripts/vendor/0xbow.js fetch --out frontend/public/zk-bow --hashes-ts frontend/src/lib/zk-hashes-bow.ts)" : "the /pool page does not use the upstream client yet";
    } catch (e) { detail = e.message.slice(0, 120); }
    gate("A1", "A front-end page proves with the upstream assets (hashes pinned from the manifest)", wired ? "GO" : "NO-GO", detail, "engineering", "finish the /pool page (plan step M3)");
  }

  // ---- automatic gates: network facts (need MAINNET_* env)
  if (process.env.SKIP_NETWORK !== "1") {
    const candidates = (process.env.MAINNET_RPC || "https://rpc.mainnet.chain.robinhood.com,https://robinhood-rpc.publicnode.com,https://robinhood.drpc.org").split(",").map((x) => x.trim()).filter(Boolean);
    let provider = null; const tried = [];
    for (const url of candidates) {
      try { const id = parseInt(await rpc(url, "eth_chainId"), 16); if (id === 4663) { provider = url; tried.push(`${url} OK`); break; } tried.push(`${url} answered chainId ${id}`); }
      catch (e) { tried.push(`${url} ${String(e.message).slice(0, 40)}`); }
    }
    gate("N1", "Mainnet RPC reachable and chainId = 4663 (a paid RPC plus a backup is recommended)", provider ? (tried.length > 1 ? "WARN" : "GO") : "NO-GO", tried.join("; "), "engineering", "set MAINNET_RPC to a paid endpoint, and RH_LOGS_RPC_URL for a large eth_getLogs range");
    const { ethers } = require("ethers");
    const sel = (s) => ethers.id(s).slice(0, 10);
    const bal = async (a) => BigInt(await rpc(provider, "eth_getBalance", [a, "latest"]));
    const safe = process.env.MAINNET_SAFE, pub = process.env.MAINNET_PUBLISHER, dep = process.env.MAINNET_DEPLOYER;
    let owners = [];
    if (!safe) gate("R1", "Mainnet Safe, >= 2-of-3 (hardware wallets cannot be verified on chain: confirm by hand)", "NO-GO", "MAINNET_SAFE not set", "owner + 3 signers", "create the Safe on chain 4663 with three hardware-wallet owners");
    else if (provider) {
      const c = await rpc(provider, "eth_getCode", [safe, "latest"]);
      if (!c || c === "0x") gate("R1", "Mainnet Safe, >= 2-of-3", "NO-GO", `${safe} has no code on chain 4663`, "owner", "deploy the Safe on mainnet");
      else {
        const o = await rpc(provider, "eth_call", [{ to: safe, data: sel("getOwners()") }, "latest"]);
        const thr = parseInt(await rpc(provider, "eth_call", [{ to: safe, data: sel("getThreshold()") }, "latest"]), 16);
        const n = parseInt(o.slice(2 + 64, 2 + 128), 16);
        owners = Array.from({ length: n }, (_, i) => "0x" + o.slice(2 + 128 + i * 64 + 24, 2 + 128 + (i + 1) * 64).toLowerCase());
        gate("R1", "Mainnet Safe, >= 2-of-3 (hardware wallets cannot be verified on chain: confirm by hand)", n >= 3 && thr >= 2 ? "GO" : "NO-GO", `${n} owners, threshold ${thr}`, "owner", "use at least 3 owners and threshold 2");
      }
    }
    if (!pub) gate("R2", "Dedicated mainnet publisher key (the future postman), funded, not the deployer", "NO-GO", "MAINNET_PUBLISHER not set", "owner", "new key, never the deployer or a testnet key, fund about 0.001 ETH");
    else if (provider) { const b = await bal(pub); const clash = dep && dep.toLowerCase() === pub.toLowerCase(); gate("R2", "Dedicated mainnet publisher key (the future postman), funded, not the deployer", b >= 1000000000000000n && !clash ? "GO" : "NO-GO", clash ? "publisher equals the deployer" : `${pub} holds ${Number(b) / 1e18} ETH`, "owner", "fund about 0.001 ETH; use a different key from the deployer"); }
    if (!dep) gate("R3", "Mainnet deployer funded and different from every Safe owner and the publisher", "NO-GO", "MAINNET_DEPLOYER not set", "owner", "fresh deployer key on a hardware wallet or a clean machine");
    else if (provider) {
      const b = await bal(dep); const need = BigInt(Math.round(Number(process.env.MIN_DEPLOYER_ETH || 0.05) * 1e18));
      const isOwner = owners.includes(dep.toLowerCase());
      gate("R3", "Mainnet deployer funded and different from every Safe owner and the publisher", b >= need && !isOwner ? "GO" : "NO-GO", isOwner ? "the deployer is a Safe owner" : `${dep} holds ${Number(b) / 1e18} ETH (needs ${Number(need) / 1e18})`, "owner", "fund the deployer; never make it a Safe owner");
    }
  }

  // ---- manual gates (signed off in docs/bow/signoff.json)
  const MANUAL = [
    ["S1", "External review of the glue code, configuration and the post-audit delta (Entrypoint, DeployLib, ICreateX, verifier signatures, worker, relayer, SDK wrapper)", "glueReview", "owner + reviewer"],
    ["S2", "Independent verification of the upstream ceremony figures and Phase-1 provenance (the two public sources disagree today)", "ceremonyProvenance", "engineering + independent party"],
    ["S3", "Owner decision signed: upgradeable entrypoint, no cap, no pause, windDown permanent, no timelock at launch, TVL trigger number filled in", "ownerDecision", "owner"],
    ["S4", "Upstream integration suite green on Linux CI (not Windows)", "linuxGate", "engineering"],
    ["S5", "Roles handed over: owner = Safe (>= 2-of-3), postman = dedicated publisher, deployer holds none (readback.js with --expect-*)", "rolesHandedOver", "owner + signers"],
    ["S6", "Incident drill on the new deployment: windDown on a throwaway pool, postman rotation, relayer switched off", "incidentDrill", "owner + signers"],
    ["S7", "Two IPFS providers pin the lists (Pinata + a second) and paid sanctions screening plus the alert webhook work with real credentials", "screeningAndPinning", "owner"],
    ["S8", "Legal review of the Magistrate policy, the appeals process and the public wording (including: amounts are public, no cap, windDown is permanent)", "legalReview", "owner + counsel"],
    ["S9", "Launch limits decided and announced (soft cap in the UI and relayer, first-deposit size, launch window, monitoring owner named)", "launchLimits", "owner"],
    ["S10", "Cutover ready: the UI defaults to the new pool, the old pool is frozen by its guardian with a last root published", "cutover", "owner + signers"],
  ];
  let signoff = {};
  try { signoff = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "bow", "signoff.json"), "utf8")); } catch { /* none yet */ }
  for (const [id, name, key, owner] of MANUAL) {
    const s = signoff[key];
    const ok = s && s.by && s.date && s.evidence;
    gate(id, name, ok ? "GO" : "NO-GO", ok ? `signed by ${s.by} on ${s.date}` : "no sign-off recorded", owner, `record { by, date, evidence } under "${key}" in docs/bow/signoff.json once it is really done`);
  }

  // ---- report
  const pad = (s, n) => String(s).padEnd(n);
  for (const r of results) {
    console.log(`${pad(r.status, 6)} ${pad(r.id, 4)} ${r.name}`);
    if (r.detail) console.log(`       ${r.detail}`);
    if (r.status !== "GO") console.log(`       owner: ${r.owner} · to close: ${r.fix}`);
  }
  const go = results.filter((r) => r.status === "GO").length, no = results.filter((r) => r.status === "NO-GO").length, warn = results.filter((r) => r.status === "WARN").length;
  console.log(`\n${go} GO, ${warn} WARN, ${no} NO-GO -> ${no === 0 && warn === 0 ? "all gates of the 0xbow route are green" : "NOT READY"}${ignore.size ? ` (ignored: ${[...ignore].join(",")})` : ""}`);
  process.exit(no === 0 && warn === 0 ? 0 : 1);
})().catch((e) => { console.error("preflight error:", e.message); process.exit(2); });
