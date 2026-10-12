// End-to-end proof cycle against a deployed 0xbow core (migration plan section 9). No contract or circuit code is written here:
// secrets, trees and proofs come from the pinned upstream SDK; this script only sends transactions and checks outcomes.
//
//   SDK_DIR=<.../@0xbow/privacy-pools-core-sdk> node scripts/bow/e2e.mjs deployments/bow-robinhoodTestnet.json
//
// Needs DEPLOYER_PRIVATE_KEY (the deployer is depositor, ASP postman and direct processooor on this test deployment) and RH_TESTNET_RPC_URL.
// Cycle: deposit A -> publish ASP root -> prove -> PARTIAL relay to a fresh address (change note) -> spend the change note ->
//        deposit B (not in the ASP set) -> ragequit B -> negative tests (replay, tamper, expired root + retry) -> pool invariant.
import "dotenv/config";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { pathToFileURL } from "url";
import { ethers } from "ethers";
import { poolInvariant } from "./verify-pool-invariant.mjs";

const file = process.argv[2];
if (!file) { console.error("usage: e2e.mjs <deployment.json>"); process.exit(1); }
const SDK_DIR = process.env.SDK_DIR;
if (!SDK_DIR) { console.error("SDK_DIR must point at the installed @0xbow/privacy-pools-core-sdk (pinned version)"); process.exit(1); }
const sdk = await import(pathToFileURL(path.join(SDK_DIR, "dist/node/index.mjs")).href);
const { PrivacyPoolSDK, Circuits, getCommitment, hashPrecommitment, generateMerkleProof, calculateContext } = sdk;

const rec = JSON.parse(fs.readFileSync(file, "utf8"));
const provider = new ethers.JsonRpcProvider(process.env.RH_TESTNET_RPC_URL);
const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
if (Number((await provider.getNetwork()).chainId) !== 46630 || rec.chainId !== 46630) throw new Error("this script only runs against the testnet");

const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const rnd = () => BigInt("0x" + crypto.randomBytes(31).toString("hex")) % FIELD;
const ENTRY_ABI = [
  "function deposit(uint256 precommitment) payable returns (uint256)",
  "function relay((address processooor, bytes data) w, (uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[8] pubSignals) p, uint256 scope)",
  "function updateRoot(uint256 root, string cid) returns (uint256)",
  "function latestRoot() view returns (uint256)",
];
const POOL_ABI = [
  "event Deposited(address indexed _depositor, uint256 _commitment, uint256 _label, uint256 _value, uint256 _precommitmentHash)",
  "event LeafInserted(uint256 _index, uint256 _leaf, uint256 _root)",
  "function withdraw((address processooor, bytes data) w, (uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[8] pubSignals) p)",
  "function ragequit((uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[4] pubSignals) p)",
  "function currentRoot() view returns (uint256)",
  "function currentTreeDepth() view returns (uint256)",
  "function nullifierHashes(uint256) view returns (bool)",
];
const entry = new ethers.Contract(rec.entrypoint, ENTRY_ABI, wallet);
const pool = new ethers.Contract(rec.pool, POOL_ABI, wallet);
const poolIface = new ethers.Interface(POOL_ABI);
const SCOPE = BigInt(rec.scope);

const results = [];
const record = (id, name, ok, detail = "") => { results.push({ id, name, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${id} ${name}${detail ? "  " + detail : ""}`); };
const circuits = new Circuits({ browser: false });
const psdk = new PrivacyPoolSDK(circuits);
const silent = async (fn) => { const w = process.stdout.write, e = process.stderr.write; process.stdout.write = () => true; process.stderr.write = () => true; try { return await fn(); } finally { process.stdout.write = w; process.stderr.write = e; } };
const timed = async (label, fn) => { const t = Date.now(); const r = await fn(); console.log(`     ${label}: ${((Date.now() - t) / 1000).toFixed(1)} s`); return r; };
const toProof = (p, signals, n) => ({
  pA: [BigInt(p.pi_a[0]), BigInt(p.pi_a[1])],
  pB: [[BigInt(p.pi_b[0][1]), BigInt(p.pi_b[0][0])], [BigInt(p.pi_b[1][1]), BigInt(p.pi_b[1][0])]],
  pC: [BigInt(p.pi_c[0]), BigInt(p.pi_c[1])],
  pubSignals: signals.slice(0, n).map(BigInt),
});
// Upstream SDK quirk: a one-leaf tree has an empty path and the LeanIMT proof reports index = NaN (parseInt of ''). Its meaning is 0.
const idx = (i) => (Number.isNaN(Number(i)) ? 0 : i);
const pad = (s) => { const a = [...s]; while (a.length < 32) a.push(0n); return a; };
const depthOf = (n) => (n <= 1 ? 0 : Math.ceil(Math.log2(n)));
const reverted = async (fn) => { try { await fn(); return null; } catch (e) { return String(e.shortMessage || e.message).slice(0, 120); } };

async function deposit(valueWei) {
  const nullifier = rnd(), secret = rnd();
  const pre = hashPrecommitment(nullifier, secret);
  const tx = await entry["deposit(uint256)"](pre, { value: valueWei });
  const r = await tx.wait();
  const log = r.logs.map((l) => { try { return poolIface.parseLog(l); } catch { return null; } }).find((l) => l && l.name === "Deposited");
  if (!log) throw new Error("pool Deposited event not found");
  return { nullifier, secret, label: log.args._label, commitment: log.args._commitment, value: log.args._value, gasUsed: r.gasUsed, tx: r.hash };
}

async function stateLeaves() {
  // eth_getLogs may be limited to a few blocks per call on a free RPC plan (Alchemy: 10): scan in chunks.
  const chunk = Number(process.env.LOG_CHUNK || 10);
  const topic = poolIface.getEvent("LeafInserted").topicHash;
  const head = await provider.getBlockNumber();
  const out = [];
  for (let from = rec.contracts[0].block; from <= head; from += chunk) {
    const to = Math.min(from + chunk - 1, head);
    for (const l of await provider.getLogs({ address: rec.pool, topics: [topic], fromBlock: from, toBlock: to })) out.push(poolIface.parseLog(l).args);
  }
  return out.sort((a, b) => Number(a._index - b._index)).map((a) => a._leaf);
}

async function publishAsp(labels, cid) {
  const proof = generateMerkleProof(labels, labels[0]);
  await (await entry.updateRoot(proof.root, cid)).wait();
  return proof.root;
}

async function proveWithdrawal(note, withdrawnValue, withdrawal, aspLabels, aspRoot) {
  const leaves = await stateLeaves();
  const commitment = getCommitment(note.value, note.label, note.nullifier, note.secret);
  if (!leaves.includes(commitment.hash)) throw new Error("commitment not in the state tree");
  const stateProof = generateMerkleProof(leaves, commitment.hash);
  const aspProof = generateMerkleProof(aspLabels, note.label);
  if (aspProof.root !== aspRoot) throw new Error("local ASP root differs from the published root");
  const newNullifier = rnd(), newSecret = rnd();
  const context = calculateContext(withdrawal, SCOPE);
  const stateDepth = Number(await pool.currentTreeDepth());
  const { proof, publicSignals } = await silent(() => psdk.proveWithdrawal(commitment, {
    context, withdrawalAmount: withdrawnValue,
    stateMerkleProof: { root: stateProof.root, leaf: commitment.hash, index: idx(stateProof.index), siblings: pad(stateProof.siblings) },
    aspMerkleProof: { root: aspProof.root, leaf: note.label, index: idx(aspProof.index), siblings: pad(aspProof.siblings) },
    stateRoot: stateProof.root, stateTreeDepth: stateDepth,
    aspRoot: aspProof.root, aspTreeDepth: depthOf(aspLabels.length),
    newSecret, newNullifier,
  }));
  return { proof: toProof(proof, publicSignals, 8), newNullifier, newSecret, publicSignals };
}

const coder = ethers.AbiCoder.defaultAbiCoder();
const relayData = (recipient, feeRecipient, bps) => coder.encode(["tuple(address,address,uint256)"], [[recipient, feeRecipient, bps]]);

const t0 = Date.now();
console.log(`pool ${rec.pool}  entrypoint ${rec.entrypoint}  deployer ${wallet.address}`);

// 1. deposit A
const A = await deposit(ethers.parseEther("0.002"));
record("E1", "deposit A through the Entrypoint", A.value === ethers.parseEther("0.002"), `gas ${A.gasUsed}  label ${A.label.toString().slice(0, 12)}...`);

// 2. ASP root (A's label only)
const aspLabels = [A.label];
const rootA = await publishAsp(aspLabels, "QmE2ETestAspListForTheBowMigrationDryRunVersion001");
record("E2", "postman publishes the ASP root", (await entry.latestRoot()) === rootA, rootA.toString().slice(0, 12) + "...");

// 3. partial withdrawal through the Courier path (relay) to a fresh address
const recipient = ethers.Wallet.createRandom().address;
const feeBps = 100n;
const wRelay = { processooor: rec.entrypoint, data: relayData(recipient, wallet.address, feeBps) };
const part = ethers.parseEther("0.0008");
const p1 = await timed("proving (partial relay)", () => proveWithdrawal(A, part, wRelay, aspLabels, rootA));
const balBefore = await provider.getBalance(recipient);
const r1 = await (await entry.relay(wRelay, p1.proof, SCOPE)).wait();
const got = (await provider.getBalance(recipient)) - balBefore;
const expectedNet = part - (part * feeBps) / 10000n;
record("E3", "partial relay pays the recipient net of the relay fee", got === expectedNet, `gas ${r1.gasUsed}  recipient got ${ethers.formatEther(got)} ETH (expected ${ethers.formatEther(expectedNet)})`);
record("E4", "spent nullifier is recorded", await pool.nullifierHashes(p1.publicSignals[1]));

// 4. replay and tamper
const replay = await reverted(async () => (await entry.relay(wRelay, p1.proof, SCOPE)).wait());
record("E5", "replaying the same proof is rejected", replay !== null, replay || "NOT rejected");
const tampered = { processooor: rec.entrypoint, data: relayData(ethers.Wallet.createRandom().address, wallet.address, feeBps) };
const tamp = await reverted(async () => (await entry.relay(tampered, p1.proof, SCOPE)).wait());
record("E6", "changing the recipient after proving is rejected", tamp !== null, tamp || "NOT rejected");

// 5. spend the change note directly (processooor = msg.sender)
const change = { value: A.value - part, label: A.label, nullifier: p1.newNullifier, secret: p1.newSecret };
const wDirect = { processooor: wallet.address, data: "0x" };
const p2 = await timed("proving (change note, direct)", () => proveWithdrawal(change, change.value, wDirect, aspLabels, rootA));
const r2 = await (await pool.withdraw(wDirect, p2.proof)).wait();
record("E7", "the change note is spent in full (direct withdrawal)", r2.status === 1, `gas ${r2.gasUsed}`);

// 6. ragequit of a deposit that is NOT in the ASP set
const B = await deposit(ethers.parseEther("0.001"));
const rq = await silent(() => psdk.proveCommitment(B.value, B.label, B.nullifier, B.secret));
const rqProof = toProof(rq.proof, rq.publicSignals, 4);
const intruder = new ethers.Wallet(ethers.hexlify(crypto.randomBytes(32)), provider);
const nonDepositor = await reverted(async () => (await pool.connect(intruder).ragequit(rqProof)).wait());
record("E8", "a non-depositor cannot ragequit", nonDepositor !== null, nonDepositor || "NOT rejected");
const r3 = await (await pool.ragequit(rqProof)).wait();
record("E9", "the original depositor ragequits a deposit the ASP never approved", r3.status === 1, `gas ${r3.gasUsed}`);
const afterRq = await reverted(async () => (await pool.ragequit(rqProof)).wait());
record("E10", "ragequit twice is rejected (single door)", afterRq !== null, afterRq || "NOT rejected");

// 7. expired root: prove against the current root, publish a new one, the stale proof fails, a retry succeeds
const C = await deposit(ethers.parseEther("0.001"));
const labelsC = [A.label, C.label];
const rootC1 = await publishAsp(labelsC, "QmE2ETestAspListForTheBowMigrationDryRunVersion002");
const wRelayC = { processooor: rec.entrypoint, data: relayData(recipient, wallet.address, feeBps) };
const pC = await timed("proving (expired-root test)", () => proveWithdrawal(C, C.value, wRelayC, labelsC, rootC1));
const D = await deposit(ethers.parseEther("0.001"));
await publishAsp([...labelsC, D.label], "QmE2ETestAspListForTheBowMigrationDryRunVersion003");
const stale = await reverted(async () => (await entry.relay(wRelayC, pC.proof, SCOPE)).wait());
record("E11", "a proof against a superseded ASP root is rejected", stale !== null, stale || "NOT rejected");
const rootNow = await entry.latestRoot();
const pC2 = await timed("re-proving (retry)", () => proveWithdrawal(C, C.value, wRelayC, [...labelsC, D.label], rootNow));
const rC = await (await entry.relay(wRelayC, pC2.proof, SCOPE)).wait();
record("E12", "after re-proving against the latest root the relay succeeds", rC.status === 1, `gas ${rC.gasUsed}`);

// 8. invariant from the pool's own events (earlier runs may have left unspent deposits, so the test must not assume an empty pool)
const inv = await poolInvariant(provider, rec);
record("E13", "pool invariant: balance == deposits - withdrawals - ragequits (from events)", inv.ok, `balance ${ethers.formatEther(inv.balance)} ETH, expected ${ethers.formatEther(inv.expected)} ETH`);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(failed.length ? 1 : 0);
