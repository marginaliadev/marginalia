#!/usr/bin/env node
// Runs the unchanged MagistrateService against a deployed 0xbow core on the testnet, with the deployer as the postman, an allow-all
// screening policy, an in-memory store and an in-memory pinner. It proves the adapter end to end: scan -> approve -> lean-tree root ->
// Entrypoint.updateRoot, and that the published root equals the root the upstream SDK computes for the same labels.
//   SDK_DIR=<.../@0xbow/privacy-pools-core-sdk> node scripts/bow/magistrate-live.js deployments/bow-robinhoodTestnet.json
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const M = require("../../lib/marginalia");
const aspStore = require("../../lib/aspStore");
const { MagistrateService } = require("../../services/magistrate/service");
const { MemoryStore } = require("../../services/magistrate/store");
const { createBowTarget } = require("../../services/magistrate/bow-target");

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("usage: magistrate-live.js <deployment.json>");
  const rec = JSON.parse(fs.readFileSync(file, "utf8"));
  if (rec.chainId !== 46630) throw new Error("testnet only");
  const provider = new ethers.JsonRpcProvider(process.env.RH_TESTNET_RPC_URL, rec.chainId, { staticNetwork: true });
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  const t = createBowTarget({ entrypoint: rec.entrypoint, pool: rec.pool, wallet, M });

  const pinned = new Map();
  const pinner = { name: "memory", async pin(bytes) { const cid = aspStore.rawCid(bytes); pinned.set(cid, bytes); return cid; } };
  const alerts = [];
  const poolBlock = rec.contracts.find((c) => c.name === "PrivacyPoolSimple_ETH").block;
  const svc = new MagistrateService({
    provider, pool: t.pool, register: t.register, M: t.M, store: new MemoryStore(),
    policy: { screenAll: async (ds) => ds.map(() => ({ decision: "APPROVE", reason: "live adapter test: allow all" })) },
    pinners: [pinner, { ...pinner, name: "memory-2" }], chainId: rec.chainId, deployBlock: poolBlock, logChunk: 10, minIntervalMs: 0,
    gateways: ["http://127.0.0.1:9/ipfs/"], log: (m) => console.log("  " + m), alert: async (m) => { alerts.push(m); },
  });

  const before = await t.register.latestRoot();
  const r = await svc.tick();
  console.log("tick:", JSON.stringify({ action: r.action, labels: r.labels, cid: r.cid, tx: r.tx }));
  if (r.action !== "published" && r.action !== "noop") throw new Error("unexpected action " + r.action);
  const after = await t.register.latestRoot();
  const labels = svc.approvedLabels().map(BigInt);
  const H = await M.hasher();
  const { leanRoot } = require("../../lib/bow/lean-imt");
  const mine = leanRoot(labels, (a, b) => H([a, b])).root;
  const ok = [];
  const check = (name, pass, detail = "") => { ok.push(pass); console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? "  " + detail : ""}`); };
  check("latest on-chain root equals the lean root of the approved labels", after === mine, after.toString().slice(0, 14) + "...");
  check("a ragequit deposit is not in the approved set", Object.values(svc.store.state.ragequit).length === 0 || svc.store.state.ragequit.every((l) => !svc.approvedLabels().includes(l)), `ragequit ${svc.store.state.ragequit.length}, approved ${labels.length}`);
  if (process.env.SDK_DIR && labels.length) {
    const sdk = await import(require("url").pathToFileURL(path.join(process.env.SDK_DIR, "dist/node/index.mjs")).href);
    const sdkRoot = sdk.generateMerkleProof(labels, labels[0]).root;
    check("the upstream SDK computes the same root for the same labels", sdkRoot === after, sdkRoot.toString().slice(0, 14) + "...");
  } else console.log("INFO  SDK_DIR not set: SDK cross-check skipped (the known-answer unit test covers it)");
  if (r.cid) check("the stored CID fits the Entrypoint limit (32..64 bytes)", r.cid.length >= 32 && r.cid.length <= 64, `${r.cid.length} bytes`);
  const again = await svc.tick();
  check("a second tick with nothing new is a no-op (idempotent)", again.action === "noop", again.reason || again.action);
  console.log(`published before: ${before === 0n ? "none" : before.toString().slice(0, 12) + "..."}; alerts: ${alerts.length ? alerts.join(" | ").slice(0, 160) : "none"}`);
  process.exit(ok.every(Boolean) ? 0 : 1);
}
main().catch((e) => { console.error("ERROR:", String(e.message).slice(0, 400)); process.exit(1); });
