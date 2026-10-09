// Fase 03 / H3 tests on Robinhood Chain Testnet with a REAL Safe v1.4.1 (2-of-3).
//   node scripts/test-governance.js
// Deploys a throw-away STAGING register + pool (never touches the live deployment), moves governance to a fresh Safe with the
// production scripts (scripts/governance/*), then proves what the new role model guarantees. All test ETH is swept back.
require("os").cpus = () => [{}]; // 1 snarkjs worker (low-RAM friendly)
require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { ethers } = require("ethers");
const M = require("../lib/marginalia");
const G = require("./governance/lib");

const ROOT = path.join(__dirname, "..");
const live = require("../deployments/robinhoodTestnet.json");
const art = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, "artifacts/contracts", `${n}.sol`, `${n}.json`)));
const results = [];
const rec = (n, ok, d) => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + n + " :: " + d); };
const errName = (e, ifaces) => {
  if (e.revert?.name) return e.revert.name;
  const data = e.data || e.info?.error?.data;
  for (const i of ifaces) { try { const p = i.parseError(data); if (p) return p.name; } catch (_) {} }
  return e.shortMessage || e.message.slice(0, 80);
};

(async () => {
  const provider = new ethers.JsonRpcProvider(process.env.RH_TESTNET_RPC_URL, 46630, { staticNetwork: true });
  const deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  const owners = [0, 1, 2].map(() => ethers.Wallet.createRandom());
  const pubA = ethers.Wallet.createRandom().connect(provider);
  const pubB = ethers.Wallet.createRandom().connect(provider);
  const start = await provider.getBalance(deployer.address);

  // ---- staging deployment
  const regArt = art("MagistrateRegister"), poolArt = art("MarginaliaPool");
  const register = await (await new ethers.ContractFactory(regArt.abi, regArt.bytecode, deployer).deploy(deployer.address)).waitForDeployment();
  // reuse the live deployment's verifiers and Poseidon hashers (stateless); read them from the live pool itself
  const livePool = new ethers.Contract(live.pool, ["function hasher1() view returns (address)", "function hasher2() view returns (address)", "function hasher3() view returns (address)", "function verifier() view returns (address)", "function ragequitVerifier() view returns (address)"], provider);
  const pool = await (await new ethers.ContractFactory(poolArt.abi, poolArt.bytecode, deployer).deploy(
    await livePool.verifier(), await livePool.ragequitVerifier(), await livePool.hasher1(), await livePool.hasher2(), await livePool.hasher3(), await register.getAddress()
  )).waitForDeployment();
  const regAddr = await register.getAddress(), poolAddr = await pool.getAddress();
  await (await register.setPool(poolAddr, true)).wait();
  const stagingFile = path.join(ROOT, "notes", "governance-staging.json");
  fs.writeFileSync(stagingFile, JSON.stringify({ register: regAddr, pool: poolAddr, safeOwners: owners.map((o) => o.privateKey) }, null, 1));
  console.log("staging register", regAddr, "pool", poolAddr);

  const safeAddr = await G.createSafe(deployer, owners.map((o) => o.address), 2);
  const safeC = new ethers.Contract(safeAddr, G.SAFE_ABI, provider);
  rec("H3-S0 Safe v1.4.1 created on-chain (2-of-3)", (await safeC.getThreshold()) === 2n && (await safeC.getOwners()).length === 3, safeAddr);

  // fund the two publisher keys with a little gas money
  for (const w of [pubA, pubB]) await (await deployer.sendTransaction({ to: w.address, value: ethers.parseEther("0.0003") })).wait();

  const env = (extra) => ({ ...process.env, DEPLOYMENT_FILE: stagingFile, SAFE: safeAddr, ...extra });
  const run = (script, extra) => {
    try {
      return { ok: true, out: execFileSync(process.execPath, [path.join(__dirname, "governance", script)], { env: env(extra), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 300000 }) };
    } catch (e) { return { ok: false, out: (e.stdout || "") + (e.stderr || "") }; }
  };
  const keys2 = `${owners[0].privateKey},${owners[1].privateKey}`;

  // ---- precondition guards of transfer-roles (negative tests, nothing changes on-chain)
  let r = run("transfer-roles.js", { PUBLISHER: deployer.address });
  rec("H3-T2a refuses a deployer-as-publisher", !r.ok && /dedicated key/.test(r.out), r.out.split("\n").find((l) => /dedicated/.test(l))?.trim() || r.out.slice(0, 80));
  const weakSafe = await G.createSafe(deployer, owners.map((o) => o.address), 1);
  r = run("transfer-roles.js", { SAFE: weakSafe, PUBLISHER: pubA.address });
  rec("H3-T2b refuses a Safe with threshold 1", !r.ok && /threshold/.test(r.out), r.out.split("\n").find((l) => /threshold/.test(l))?.trim() || r.out.slice(0, 80));
  const selfSafe = await G.createSafe(deployer, [deployer.address, owners[0].address, owners[1].address], 2);
  r = run("transfer-roles.js", { SAFE: selfSafe, PUBLISHER: pubA.address });
  rec("H3-T2c refuses a Safe that includes the deployer as owner", !r.ok && /must not be a Safe owner/.test(r.out), r.out.split("\n").find((l) => /must not/.test(l))?.trim() || r.out.slice(0, 80));
  r = run("transfer-roles.js", { PUBLISHER: pubA.address });
  rec("H3-T2d dry run changes nothing", r.ok && /Dry run only/.test(r.out) && (await register.owner()) === deployer.address, "owner is still the deployer");

  // ---- the real transfer
  const t0 = Date.now();
  r = run("transfer-roles.js", { PUBLISHER: pubA.address, CONFIRM: "transfer-roles", SAFE_SIGNER_KEYS: keys2 });
  console.log(r.out.split("\n").filter((l) => /done|executed|Safe /.test(l)).join("\n"));
  const poolC = new ethers.Contract(poolAddr, G.POOL_ABI, deployer);
  const regC = new ethers.Contract(regAddr, G.REGISTER_ABI, deployer);
  rec("H3-T3 roles moved: owner=Safe, guardian=Safe, magistrate=publisher A",
    r.ok && (await regC.owner()) === safeAddr && (await poolC.guardian()) === safeAddr && (await regC.magistrate()) === pubA.address, `owner=${await regC.owner()}`);

  // ---- H3-TEST1: the deployer EOA has lost every admin power
  const regI = new ethers.Interface(G.REGISTER_ABI), poolI = new ethers.Interface(G.POOL_ABI);
  const regF = new ethers.Contract(regAddr, regArt.abi, deployer);
  const poolF = new ethers.Contract(poolAddr, poolArt.abi, deployer);
  const ifaces = [new ethers.Interface(regArt.abi), new ethers.Interface(poolArt.abi)];
  const t1 = [
    ["register.setMagistrate", "NotOwner", () => regF.setMagistrate.staticCall(deployer.address)],
    ["register.transferOwnership", "NotOwner", () => regF.transferOwnership.staticCall(deployer.address)],
    ["register.setPool", "NotOwner", () => regF.setPool.staticCall(deployer.address, true)],
    ["register.publishRoot", "NotMagistrate", () => regF["publishRoot(uint256,string)"].staticCall(1n, "x")],
    ["register.approveLabels", "NotMagistrate", () => regF.approveLabels.staticCall([1n])],
    ["pool.setDepositsPaused", "NotGuardian", () => poolF.setDepositsPaused.staticCall(true)],
    ["pool.setMaxDepositAmount", "NotGuardian", () => poolF.setMaxDepositAmount.staticCall(1n)],
    ["pool.transferGuardian", "NotGuardian", () => poolF.transferGuardian.staticCall(deployer.address)],
  ];
  let allRevert = true; const names = [];
  for (const [n, want, f] of t1) {
    try { await f(); allRevert = false; names.push(n + ":NO REVERT"); }
    catch (e) { const got = errName(e, ifaces); if (got !== want) allRevert = false; names.push(`${n.split(".")[1]}=${got}`); }
  }
  rec("H3-TEST1 deployer EOA: all 8 admin calls revert with the exact access-control error", allRevert, names.join(", "));

  // ---- H3-TEST2: Safe threshold is enforced; two signatures work
  const one = (() => { try { return execFileSync(process.execPath, [path.join(__dirname, "governance", "rotate-magistrate.js")], { env: env({ NEW_PUBLISHER: pubB.address, SAFE_SIGNER_KEYS: owners[0].privateKey }), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }), true; } catch (_) { return false; } })();
  rec("H3-TEST2a Safe with only 1 of 2 signatures cannot rotate the Magistrate", one === false && (await regC.magistrate()) === pubA.address, "still publisher A");
  const tRot = Date.now();
  r = run("rotate-magistrate.js", { NEW_PUBLISHER: pubB.address, SAFE_SIGNER_KEYS: keys2 });
  rec("H3-TEST2b Safe with 2 of 3 signatures rotates the Magistrate", r.ok && (await regC.magistrate()) === pubB.address, `in ${((Date.now() - tRot) / 1000).toFixed(1)}s`);

  // ---- H3-TEST3: old publisher is dead, new one works (publishRoot)
  const regAsA = new ethers.Contract(regAddr, ["function publishRoot(uint256,string)"], pubA);
  const regAsB = new ethers.Contract(regAddr, ["function publishRoot(uint256,string)"], pubB);
  let oldName = "none";
  try { await regAsA.publishRoot.staticCall(11n, "ipfs://old"); } catch (e) { oldName = errName(e, [new ethers.Interface(regArt.abi)]); }
  await (await regAsB.publishRoot(12345n, "ipfs://new")).wait();
  rec("H3-TEST3 rotated-out publisher reverts; new publisher publishes", oldName === "NotMagistrate" && (await new ethers.Contract(regAddr, ["function latestRoot() view returns(uint256)"], provider).latestRoot()) === 12345n, `old key -> ${oldName}`);

  // ---- H3-TEST4: pause stops deposits ONLY; withdraw/ragequit keep working
  const dep = async (v) => { const s = await M.newSecret(); const rc = await (await pool.deposit(s.precommitment, { value: v })).wait(); return M.noteFromDepositReceipt(pool, rc, s); };
  const note = await dep(ethers.parseEther("0.0002"));
  const tPause = Date.now();
  r = run("pause-deposits.js", { PAUSED: "true", SAFE_SIGNER_KEYS: keys2 });
  const pauseSecs = ((Date.now() - tPause) / 1000).toFixed(1);
  let depName = "none";
  try { const s = await M.newSecret(); await pool.deposit.staticCall(s.precommitment, { value: 1n }); } catch (e) { depName = errName(e, [new ethers.Interface(poolArt.abi)]); }
  rec("H3-TEST4a paused: new deposits revert (DepositsPaused)", r.ok && (await poolC.depositsPaused()) === true && depName === "DepositsPaused", `${depName}; pause took ${pauseSecs}s`);
  const bal0 = await provider.getBalance(deployer.address);
  const rq = await M.proveRagequit({ note });
  await (await pool.ragequit(note.label, deployer.address, rq.proof)).wait();
  rec("H3-TEST4b while paused, ragequit still returns the money", (await provider.getBalance(deployer.address)) > bal0 + ethers.parseEther("0.00019"), "refund received");
  r = run("pause-deposits.js", { PAUSED: "false", SAFE_SIGNER_KEYS: keys2 });
  const note2 = await dep(ethers.parseEther("0.0002"));
  rec("H3-TEST4c unpaused by the Safe: deposits work again", r.ok && (await poolC.depositsPaused()) === false && !!note2, "deposit succeeded");
  await (await pool.ragequit(note2.label, deployer.address, (await M.proveRagequit({ note: note2 })).proof)).wait();

  // ---- H3-TEST6: the runbook drill (pause) is far below the 30 minute target
  rec("H3-TEST6 incident drill: pause executed via Safe well under 30 minutes", Number(pauseSecs) < 1800, `${pauseSecs}s`);

  // ---- sweep leftovers back to the deployer
  for (const w of [pubA, pubB]) {
    const bal = await provider.getBalance(w.address);
    const gp = (await provider.getFeeData()).gasPrice ?? 10_000_000n;
    const reserve = gp * 21000n * 3n;
    if (bal > reserve * 2n) await (await w.sendTransaction({ to: deployer.address, value: bal - reserve, gasLimit: 21000n, gasPrice: gp })).wait();
  }
  const end = await provider.getBalance(deployer.address);
  console.log(`deployer ETH change for this whole run: ${ethers.formatEther(start - end)} (gas for 2 deployments, 3 Safes and ~25 txs)`);
  rec("H3-Z no test ETH stranded (loss is gas only, < 0.0003)", start - end < ethers.parseEther("0.0003"), ethers.formatEther(start - end));
  const pass = results.filter(Boolean).length;
  console.log(`\n${pass}/${results.length} PASS`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
