#!/usr/bin/env node
// Read-back of a 0xbow deployment record against the chain (migration plan section 9, "configuration read-back").
//   node scripts/bow/readback.js deployments/bow-robinhoodTestnet.json [--expect-owner 0x..] [--expect-postman 0x..]
// Checks: the proxy points at the recorded implementation; pool config (min deposit, vetting fee, max relay fee); scope and asset;
// pool wiring (entrypoint, verifiers); dead == false; the deployer holds no role beyond what the record says; owner != postman != deployer
// once governance has been handed over (use --expect-owner / --expect-postman after the handover).
require("dotenv").config();
const fs = require("fs");
const { ethers } = require("ethers");

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const opt = (n) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : undefined; };
if (!file) { console.error("usage: readback.js <deployment.json> [--expect-owner a] [--expect-postman a] [--artifacts <forge out dir>]"); process.exit(1); }
const rec = JSON.parse(fs.readFileSync(file, "utf8"));

const ENTRY = [
  "function hasRole(bytes32,address) view returns (bool)",
  "function latestRoot() view returns (uint256)",
  "function assetConfig(address) view returns (address pool, uint256 minimumDepositAmount, uint256 vettingFeeBPS, uint256 maxRelayFeeBPS)",
  "function scopeToPool(uint256) view returns (address)",
];
const POOL = [
  "function ENTRYPOINT() view returns (address)",
  "function WITHDRAWAL_VERIFIER() view returns (address)",
  "function RAGEQUIT_VERIFIER() view returns (address)",
  "function ASSET() view returns (address)",
  "function SCOPE() view returns (uint256)",
  "function dead() view returns (bool)",
];
const OWNER_ROLE = ethers.id("OWNER_ROLE");
const POSTMAN_ROLE = ethers.id("ASP_POSTMAN");
const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

async function main() {
  const rpcUrl = rec.chainId === 4663 ? (process.env.MAINNET_RPC || "").split(",")[0].trim() : process.env.RH_TESTNET_RPC_URL;
  if (!rpcUrl) throw new Error(rec.chainId === 4663 ? "MAINNET_RPC is not set" : "RH_TESTNET_RPC_URL is not set");
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== rec.chainId) throw new Error(`RPC chain ${net.chainId} != record chain ${rec.chainId}`);
  const entry = new ethers.Contract(rec.entrypoint, ENTRY, provider);
  const pool = new ethers.Contract(rec.pool, POOL, provider);
  const problems = [];
  const check = (label, ok, detail) => { console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? "  " + detail : ""}`); if (!ok) problems.push(label); };
  const eq = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

  const impl = ethers.getAddress("0x" + (await provider.getStorage(rec.entrypoint, IMPL_SLOT)).slice(-40));
  const recordedImpl = rec.contracts.find((c) => c.name === "Entrypoint_Implementation").address;
  check("proxy -> recorded implementation", eq(impl, recordedImpl), impl);

  const cfg = await entry.assetConfig(rec.config.asset);
  check("pool registered for the native asset", eq(cfg.pool, rec.pool), cfg.pool);
  check("minimumDepositAmount", cfg.minimumDepositAmount.toString() === rec.config.minimumDepositAmount, ethers.formatEther(cfg.minimumDepositAmount) + " ETH");
  check("vettingFeeBPS == 0", cfg.vettingFeeBPS === 0n, cfg.vettingFeeBPS.toString());
  check("maxRelayFeeBPS", cfg.maxRelayFeeBPS.toString() === rec.config.maxRelayFeeBPS, cfg.maxRelayFeeBPS.toString());

  const scope = await pool.SCOPE();
  check("scope matches the record and maps back to the pool", scope.toString() === rec.scope && eq(await entry.scopeToPool(scope), rec.pool), scope.toString());
  check("pool.ENTRYPOINT", eq(await pool.ENTRYPOINT(), rec.entrypoint));
  check("pool.WITHDRAWAL_VERIFIER", eq(await pool.WITHDRAWAL_VERIFIER(), rec.withdrawalVerifier));
  check("pool.RAGEQUIT_VERIFIER", eq(await pool.RAGEQUIT_VERIFIER(), rec.ragequitVerifier));
  check("pool.ASSET is the native asset", eq(await pool.ASSET(), rec.config.asset));
  check("dead == false", (await pool.dead()) === false);

  // Optional: the code on chain equals the code of a Foundry build of the pinned tag (reproducible-build gate).
  // Immutable slots are masked on both sides and library addresses are linked from the record; metadata is off in the upstream profile.
  const artDir = opt("artifacts");
  if (artDir) {
    const norm = (h) => h.toLowerCase().replace(/^0x/, "");
    const mask = (hex, refs) => { let s = hex; for (const list of Object.values(refs || {})) for (const { start, length } of list) s = s.slice(0, start * 2) + "0".repeat(length * 2) + s.slice(start * 2 + length * 2); return s; };
    const libAddr = (name) => rec.contracts.find((c) => c.name === "library_" + name)?.address;
    const cmp = async (label, address, file, name) => {
      const j = JSON.parse(fs.readFileSync(`${artDir}/${file}.sol/${name}.json`, "utf8"));
      let expected = norm(j.deployedBytecode.object);
      for (const [, libs] of Object.entries(j.deployedBytecode.linkReferences || {})) {
        for (const [lib, refs] of Object.entries(libs)) for (const { start, length } of refs) {
          const a = libAddr(lib); if (!a) { check(label, false, `no recorded address for library ${lib}`); return; }
          expected = expected.slice(0, start * 2) + norm(a) + expected.slice(start * 2 + length * 2);
        }
      }
      const actual = norm(await provider.getCode(address));
      const refs = j.deployedBytecode.immutableReferences;
      check(label, mask(actual, refs) === mask(expected, refs), `${actual.length / 2} bytes${refs && Object.keys(refs).length ? " (immutables masked)" : ""}`);
    };
    await cmp("WithdrawalVerifier code equals the build of the pinned tag", rec.withdrawalVerifier, "WithdrawalVerifier", "WithdrawalVerifier");
    await cmp("CommitmentVerifier code equals the build of the pinned tag", rec.ragequitVerifier, "CommitmentVerifier", "CommitmentVerifier");
    await cmp("Entrypoint implementation code equals the build of the pinned tag", recordedImpl, "Entrypoint", "Entrypoint");
    await cmp("PrivacyPoolSimple code equals the build of the pinned tag", rec.pool, "PrivacyPoolSimple", "PrivacyPoolSimple");
  }

  const ownerIsDeployer = await entry.hasRole(OWNER_ROLE, rec.deployer);
  const postmanIsDeployer = await entry.hasRole(POSTMAN_ROLE, rec.deployer);
  const wantOwner = opt("expect-owner"), wantPostman = opt("expect-postman");
  if (wantOwner || wantPostman) {
    if (wantOwner) check("owner role held by the expected owner", await entry.hasRole(OWNER_ROLE, wantOwner), wantOwner);
    if (wantPostman) check("postman role held by the expected postman", await entry.hasRole(POSTMAN_ROLE, wantPostman), wantPostman);
    check("deployer holds NO owner role", !ownerIsDeployer);
    check("deployer holds NO postman role", !postmanIsDeployer);
    if (wantOwner && wantPostman) check("owner != postman != deployer", !eq(wantOwner, wantPostman) && !eq(wantOwner, rec.deployer) && !eq(wantPostman, rec.deployer));
  } else {
    console.log(`INFO deployer still holds owner=${ownerIsDeployer} postman=${postmanIsDeployer} (expected right after deploy; hand over with governance before any real use)`);
  }
  let root = "none yet (no ASP root published; expected before genesis)";
  try { root = (await entry.latestRoot()).toString(); } catch { /* NoRootsAvailable */ }
  console.log(`INFO latestRoot ${root}`);
  if (problems.length) { console.error(`\nREAD-BACK FAILED: ${problems.join("; ")}`); process.exit(1); }
  console.log("\nread-back OK");
}
main().catch((e) => { console.error("ERROR:", String(e.message).slice(0, 300)); process.exit(1); });
