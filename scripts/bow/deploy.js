#!/usr/bin/env node
// Deploys the UNMODIFIED 0xbow core (vendor/0xbow, tag v1.2.1) to the chain behind RPC. No Solidity is written here:
// the bytecode comes from a Foundry build of the vendored tree (see docs/bow_migration.md), this script only sends transactions.
//
//   node scripts/bow/deploy.js --artifacts <forge out dir> --out deployments/bow-<name>.json
//        [--owner 0x..] [--postman 0x..] [--min-deposit 0.0001] [--vetting-bps 0] [--max-relay-bps 100]
//
// Env: DEPLOYER_PRIVATE_KEY, and the RPC in RH_TESTNET_RPC_URL (chain 46630) or RH_MAINNET_RPC_URL (chain 4663; refused here).
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
  const out = opt("out");
  if (!out) throw new Error("--out <file> is required");
  const rpc = process.env.RH_TESTNET_RPC_URL;
  if (!rpc) throw new Error("RH_TESTNET_RPC_URL is not set");
  if (!process.env.DEPLOYER_PRIVATE_KEY) throw new Error("DEPLOYER_PRIVATE_KEY is not set");

  const provider = new ethers.JsonRpcProvider(rpc);
  const net = await provider.getNetwork();
  if (net.chainId !== 46630n) throw new Error(`refusing: this script only deploys to the testnet (46630), RPC reports ${net.chainId}. Mainnet needs the go/no-go gates.`);
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  const owner = opt("owner", wallet.address);
  const postman = opt("postman", process.env.MAGISTRATE_ADDRESS || wallet.address);
  if (owner.toLowerCase() !== wallet.address.toLowerCase()) throw new Error("the initial owner must be the deployer (registerPool is owner-only); transfer OWNER_ROLE afterwards");

  const cfg = {
    minimumDepositAmount: ethers.parseEther(opt("min-deposit", "0.0001")),
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
}

main().catch((e) => { console.error("ERROR:", String(e.message).slice(0, 300)); process.exit(1); });
