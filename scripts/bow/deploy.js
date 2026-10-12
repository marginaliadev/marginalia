#!/usr/bin/env node
// Deploys the UNMODIFIED 0xbow core (vendor/0xbow, tag v1.2.1) to the chain behind RPC. No Solidity is written here:
// the bytecode comes from a Foundry build of the vendored tree (see docs/bow_migration.md), this script only sends transactions.
//
//   node scripts/bow/deploy.js --artifacts <forge out dir> --out deployments/bow-<name>.json
//        [--network testnet|mainnet] [--owner 0x..] [--postman 0x..] [--min-deposit 0.0001] [--vetting-bps 0] [--max-relay-bps 100]
//
// Testnet: DEPLOYER_PRIVATE_KEY and RH_TESTNET_RPC_URL (chain 46630).
// Mainnet (--network mainnet, chain 4663): MAINNET_DEPLOYER_PRIVATE_KEY (a different, fresh key), MAINNET_DEPLOYER, MAINNET_PUBLISHER, MAINNET_SAFE, MAINNET_RPC.
//   It runs scripts/bow/preflight.js first and sends NOTHING unless every gate except D1 is green AND CONFIRM=deploy-bow-mainnet is set.
// The deployer must be the initial owner (registerPool is owner-only); hand OWNER_ROLE to the Safe afterwards with scripts/bow/governance.js.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : d; };

const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

function artifact(dir, file, name) {
  const p = path.join(dir, `${file}.sol`, `${name}.json`);
  if (!fs.existsSync(p)) throw new Error(`artefact not found: ${p}`);
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  return { abi: j.abi, bytecode: j.bytecode.object, links: j.bytecode.linkReferences || {} };
}

async function main() {
  const dir = path.resolve(opt("artifacts", ""));
  if (!opt("artifacts")) throw new Error("--artifacts <forge out dir> is required");
  const network = opt("network", "testnet");
  if (!["testnet", "mainnet"].includes(network)) throw new Error("--network must be testnet or mainnet");
  const mainnet = network === "mainnet";
  const out = opt("out", mainnet ? "deployments/bow-robinhood.json" : undefined);
  if (!out) throw new Error("--out <file> is required");
  const rpc = mainnet ? (process.env.MAINNET_RPC || "").split(",")[0].trim() : process.env.RH_TESTNET_RPC_URL;
  if (!rpc) throw new Error(mainnet ? "MAINNET_RPC is not set" : "RH_TESTNET_RPC_URL is not set");
  // The mainnet key is a different variable on purpose: a testnet key must never be able to deploy to mainnet by accident.
  const keyName = mainnet ? "MAINNET_DEPLOYER_PRIVATE_KEY" : "DEPLOYER_PRIVATE_KEY";
  if (!process.env[keyName]) throw new Error(keyName + " is not set");

  const provider = new ethers.JsonRpcProvider(rpc);
  const net = await provider.getNetwork();
  const want = mainnet ? 4663n : 46630n;
  if (net.chainId !== want) throw new Error("refusing: --network " + network + " needs chain " + want + ", the RPC reports " + net.chainId);
  const wallet = new ethers.Wallet(process.env[keyName], provider);
  const owner = opt("owner", wallet.address);
  const postman = opt("postman", mainnet ? process.env.MAINNET_PUBLISHER : (process.env.MAGISTRATE_ADDRESS || wallet.address));
  if (!postman) throw new Error("--postman (or MAINNET_PUBLISHER) is required on mainnet");
  if (owner.toLowerCase() !== wallet.address.toLowerCase()) throw new Error("the initial owner must be the deployer (registerPool is owner-only); transfer OWNER_ROLE afterwards");

  if (mainnet) {
    // 1. the deployer is the one the preflight verified, 2. every gate except D1 is green, 3. the owner explicitly confirms.
    if (!process.env.MAINNET_DEPLOYER || process.env.MAINNET_DEPLOYER.toLowerCase() !== wallet.address.toLowerCase()) throw new Error("MAINNET_DEPLOYER must equal the address of " + keyName + " (the preflight checks that address)");
    if (postman.toLowerCase() === wallet.address.toLowerCase()) throw new Error("the postman must be the dedicated publisher, not the deployer");
    const pf = require("child_process").spawnSync(process.execPath, [path.join(__dirname, "preflight.js"), "--ignore", "D1"], { encoding: "utf8", env: process.env, timeout: 300000 });
    const lines = String(pf.stdout || "").split(/\r?\n/).filter(Boolean);
    console.log("preflight (all gates except D1): " + lines[lines.length - 1]);
    if (pf.status !== 0) {
      console.log(lines.filter((l) => /^(NO-GO|WARN)/.test(l)).join(" | "));
      throw new Error("refusing to deploy to mainnet: the preflight is not green. Close every NO-GO above first.");
    }
    if (process.env.CONFIRM !== "deploy-bow-mainnet") {
      console.log("DRY RUN: every gate is green and nothing was sent. To deploy for real the owner sets CONFIRM=deploy-bow-mainnet.");
      return;
    }
    if (fs.existsSync(path.resolve(out))) throw new Error(out + " already exists: a mainnet record is never overwritten");
  }

  const cfg = {
    minimumDepositAmount: ethers.parseEther(opt("min-deposit", mainnet ? "0.001" : "0.0001")),
    vettingFeeBPS: BigInt(opt("vetting-bps", "0")),
    maxRelayFeeBPS: BigInt(opt("max-relay-bps", "100")),
  };
  if (cfg.vettingFeeBPS !== 0n) throw new Error("the migration plan pins vettingFeeBPS = 0 (a non-zero fee changes note values and Quoting)");

  const bal = await provider.getBalance(wallet.address);
  console.log(`deployer ${wallet.address}  balance ${ethers.formatEther(bal)} ETH  chain ${net.chainId}`);

  const deployed = [];
  const libs = {};
  // Libraries (the Poseidon hashers) are deployed once and linked into the bytecode, the way forge does it on broadcast.
  const linked = async (art) => {
    let code = art.bytecode;
    for (const [file, names] of Object.entries(art.links)) {
      for (const [lib, refs] of Object.entries(names)) {
        if (!libs[lib]) {
          const la = artifact(dir, lib, lib);
          const lc = await new ethers.ContractFactory(la.abi, la.bytecode, wallet).deploy();
          const lr = await lc.deploymentTransaction().wait();
          libs[lib] = await lc.getAddress();
          console.log(`${("library " + lib).padEnd(28)} ${libs[lib]}  block ${lr.blockNumber}  gas ${lr.gasUsed}`);
          deployed.push({ name: "library_" + lib, address: libs[lib], block: lr.blockNumber, tx: lr.hash, gasUsed: lr.gasUsed.toString() });
        }
        for (const { start, length } of refs) {
          const a = start * 2 + 2;
          code = code.slice(0, a) + libs[lib].slice(2).toLowerCase() + code.slice(a + length * 2);
        }
      }
    }
    if (/__$/.test(code)) throw new Error("unlinked library placeholder left in the bytecode");
    return { ...art, bytecode: code };
  };
  const send = async (name, art, ...ctor) => {
    art = await linked(art);
    const f = new ethers.ContractFactory(art.abi, art.bytecode, wallet);
    const c = await f.deploy(...ctor);
    const r = await c.deploymentTransaction().wait();
    console.log(`${name.padEnd(28)} ${await c.getAddress()}  block ${r.blockNumber}  gas ${r.gasUsed}`);
    deployed.push({ name, address: await c.getAddress(), block: r.blockNumber, tx: r.hash, gasUsed: r.gasUsed.toString() });
    return c;
  };

  const wv = await send("WithdrawalVerifier", artifact(dir, "WithdrawalVerifier", "WithdrawalVerifier"));
  const cv = await send("CommitmentVerifier", artifact(dir, "CommitmentVerifier", "CommitmentVerifier"));
  const entryArt = artifact(dir, "Entrypoint", "Entrypoint");
  const impl = await send("Entrypoint_Implementation", entryArt);
  const initData = new ethers.Interface(entryArt.abi).encodeFunctionData("initialize", [owner, postman]);
  const proxy = await send("Entrypoint_Proxy", artifact(dir, "ERC1967Proxy", "ERC1967Proxy"), await impl.getAddress(), initData);
  const entrypoint = new ethers.Contract(await proxy.getAddress(), entryArt.abi, wallet);
  const pool = await send("PrivacyPoolSimple_ETH", artifact(dir, "PrivacyPoolSimple", "PrivacyPoolSimple"), await proxy.getAddress(), await wv.getAddress(), await cv.getAddress());

  const rp = await (await entrypoint.registerPool(NATIVE, await pool.getAddress(), cfg.minimumDepositAmount, cfg.vettingFeeBPS, cfg.maxRelayFeeBPS)).wait();
  console.log(`registerPool                 tx ${rp.hash}  gas ${rp.gasUsed}`);
  const scope = await pool.SCOPE();

  const record = {
    chainId: Number(net.chainId),
    vendor: "0xbow privacy-pools-core v1.2.1 (a80836a), unmodified",
    deployer: wallet.address, owner, postman,
    config: { asset: NATIVE, minimumDepositAmount: cfg.minimumDepositAmount.toString(), vettingFeeBPS: cfg.vettingFeeBPS.toString(), maxRelayFeeBPS: cfg.maxRelayFeeBPS.toString() },
    entrypoint: await proxy.getAddress(), pool: await pool.getAddress(), scope: scope.toString(),
    withdrawalVerifier: await wv.getAddress(), ragequitVerifier: await cv.getAddress(),
    contracts: deployed, registerPoolTx: rp.hash,
  };
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(record, null, 2) + "\n");
  console.log(`\nwrote ${out}`);
  if (mainnet) {
    console.log("NEXT (in this order, nothing is open to users yet):");
    console.log(`  1. node scripts/bow/readback.js ${out} --artifacts <forge out dir of the pristine tag>   (config, wiring, code == build of the pinned tag)`);
    console.log("  2. hand over the roles: SAFE=<safe> PUBLISHER=<publisher> node scripts/bow/governance.js " + out + "  (dry run, then CONFIRM=bow-handover)");
    console.log(`  3. node scripts/bow/readback.js ${out} --expect-owner <safe> --expect-postman <publisher>`);
    console.log("  4. record the sign-offs (rolesHandedOver, incidentDrill, cutover) in docs/bow/signoff.json, then open the UI");
  }
}

main().catch((e) => { console.error("ERROR:", String(e.message).slice(0, 300)); process.exit(1); });
