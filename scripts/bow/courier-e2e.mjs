// Courier end to end on the 0xbow core: a real proof is produced here and sent to the running front-end route /api/relay/bow, which
// validates it against the Entrypoint, pays the gas and is repaid by the proof-bound percentage fee. Needs the Next server running with
// BOW_ENTRYPOINT and RELAYER_PRIVATE_KEY (see docs/bow_migration.md) and this script's own DEPLOYER_PRIVATE_KEY as depositor and ASP postman.
//   COURIER_URL=http://127.0.0.1:3009 SDK_DIR=<sdk dir> node scripts/bow/courier-e2e.mjs deployments/bow-robinhoodTestnet.json
import "dotenv/config";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { pathToFileURL } from "url";
import { ethers } from "ethers";

const file = process.argv[2];
const URL_ = process.env.COURIER_URL || "http://127.0.0.1:3009";
if (!file || !process.env.SDK_DIR) { console.error("usage: SDK_DIR=<sdk> courier-e2e.mjs <deployment.json>"); process.exit(1); }
const sdk = await import(pathToFileURL(path.join(process.env.SDK_DIR, "dist/node/index.mjs")).href);
const { PrivacyPoolSDK, Circuits, getCommitment, hashPrecommitment, generateMerkleProof, calculateContext } = sdk;
const rec = JSON.parse(fs.readFileSync(file, "utf8"));
const provider = new ethers.JsonRpcProvider(process.env.RH_TESTNET_RPC_URL);
const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
if (rec.chainId !== 46630) throw new Error("testnet only");

const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const rnd = () => BigInt("0x" + crypto.randomBytes(31).toString("hex")) % FIELD;
const entry = new ethers.Contract(rec.entrypoint, [
  "function deposit(uint256) payable returns (uint256)", "function updateRoot(uint256,string) returns (uint256)", "function latestRoot() view returns (uint256)",
], wallet);
const poolIface = new ethers.Interface([
  "event Deposited(address indexed _depositor, uint256 _commitment, uint256 _label, uint256 _value, uint256 _precommitmentHash)",
  "event LeafInserted(uint256 _index, uint256 _leaf, uint256 _root)",
]);
const pool = new ethers.Contract(rec.pool, ["function currentTreeDepth() view returns (uint256)"], provider);
const SCOPE = BigInt(rec.scope);
const psdk = new PrivacyPoolSDK(new Circuits({ browser: false }));
const silent = async (fn) => { const w = process.stdout.write, e = process.stderr.write; process.stdout.write = () => true; process.stderr.write = () => true; try { return await fn(); } finally { process.stdout.write = w; process.stderr.write = e; } };
const idx = (i) => (Number.isNaN(Number(i)) ? 0 : i);
const pad = (s) => { const a = [...s]; while (a.length < 32) a.push(0n); return a; };
const depthOf = (n) => (n <= 1 ? 0 : Math.ceil(Math.log2(n)));
const coder = ethers.AbiCoder.defaultAbiCoder();
const relayData = (r, f, b) => coder.encode(["tuple(address recipient, address feeRecipient, uint256 relayFeeBPS)"], [[r, f, b]]);
const results = [];
const rec_ = (id, name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${id} ${name}${detail ? "  " + detail : ""}`); };
const post = async (p, body) => { const r = await fetch(URL_ + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };

async function leaves() {
  const head = await provider.getBlockNumber(), topic = poolIface.getEvent("LeafInserted").topicHash, out = [];
  for (let from = rec.contracts[0].block; from <= head; from += 10) {
    for (const l of await provider.getLogs({ address: rec.pool, topics: [topic], fromBlock: from, toBlock: Math.min(from + 9, head) })) out.push(poolIface.parseLog(l).args);
  }
  return out.sort((a, b) => Number(a._index - b._index)).map((a) => a._leaf);
}

// ---- quote from the Courier
const value = ethers.parseEther("0.002");
const q = (await post("/api/relay/bow/quote", { value: value.toString() })).json;
rec_("C1", "the Courier quotes a relayable amount with a minimum percentage under the pool cap", q.relayable === true && Number(q.minRelayFeeBps) <= Number(q.maxRelayFeeBps), `min ${q.minRelayFeeBps} BPS, cap ${q.maxRelayFeeBps} BPS, relayer ${q.relayer}`);
const tiny = (await post("/api/relay/bow/quote", { value: "1000" })).json;
rec_("C2", "a dust amount is reported as not relayable", tiny.relayable === false, `minRelayFeeBps ${tiny.minRelayFeeBps}`);

// ---- deposit + ASP root
const nullifier = rnd(), secret = rnd();
const r = await (await entry.deposit(hashPrecommitment(nullifier, secret), { value })).wait();
const dep = r.logs.map((l) => { try { return poolIface.parseLog(l); } catch { return null; } }).find((l) => l && l.name === "Deposited").args;
const note = { value: dep._value, label: dep._label, nullifier, secret };
const labelsAll = [note.label];
const aspProof = generateMerkleProof(labelsAll, note.label);
await (await entry.updateRoot(aspProof.root, "QmCourierE2ETestAspListForTheBowMigration0001")).wait();

async function proveFor(feeRecipient, bps, recipient) {
  const withdrawal = { processooor: rec.entrypoint, data: relayData(recipient, feeRecipient, bps) };
  const commitment = getCommitment(note.value, note.label, note.nullifier, note.secret);
  const st = generateMerkleProof(await leaves(), commitment.hash);
  const depth = Number(await pool.currentTreeDepth());
  const context = calculateContext(withdrawal, SCOPE);
  const { proof, publicSignals } = await silent(() => psdk.proveWithdrawal(commitment, {
    context, withdrawalAmount: note.value,
    stateMerkleProof: { root: st.root, leaf: commitment.hash, index: idx(st.index), siblings: pad(st.siblings) },
    aspMerkleProof: { root: aspProof.root, leaf: note.label, index: idx(aspProof.index), siblings: pad(aspProof.siblings) },
    stateRoot: st.root, stateTreeDepth: depth, aspRoot: aspProof.root, aspTreeDepth: depthOf(labelsAll.length), newSecret: rnd(), newNullifier: rnd(),
  }));
  const s = (x) => x.toString();
  return {
    withdrawal, scope: s(SCOPE),
    proof: { pA: [s(proof.pi_a[0]), s(proof.pi_a[1])], pB: [[s(proof.pi_b[0][1]), s(proof.pi_b[0][0])], [s(proof.pi_b[1][1]), s(proof.pi_b[1][0])]], pC: [s(proof.pi_c[0]), s(proof.pi_c[1])], pubSignals: publicSignals.slice(0, 8).map(s) },
  };
}

// ---- a fee below the Courier's requirement is refused BEFORE gas is spent
const recipient = ethers.Wallet.createRandom().address;
const lowBps = 1n; // 0.01%: far below the cost
const lowPayload = await proveFor(q.relayer, lowBps, recipient);
const low = await post("/api/relay/bow", lowPayload);
rec_("C3", "a proof binding a fee below the cost is refused (400) and nothing is sent", low.status === 400 && /Fee too low/.test(low.json.error || ""), `${low.status} ${String(low.json.error).slice(0, 90)}`);

// ---- a wrong fee recipient is refused
const wrongFee = await post("/api/relay/bow", { ...lowPayload, withdrawal: { ...lowPayload.withdrawal, data: relayData(recipient, recipient, lowBps) } });
rec_("C4", "a payload naming another fee recipient is refused", wrongFee.status === 400 && /fee recipient/i.test(wrongFee.json.error || ""), `${wrongFee.status}`);

// ---- the real relay at the quoted minimum
const bps = BigInt(q.minRelayFeeBps) + 5n;
const payload = await proveFor(q.relayer, bps, recipient);
const before = await provider.getBalance(recipient);
const feeBefore = await provider.getBalance(q.relayer);
const ok = await post("/api/relay/bow", payload);
const gotRecipient = (await provider.getBalance(recipient)) - before;
const fee = (note.value * bps) / 10000n;
rec_("C5", "the Courier relays a valid proof and pays the gas", ok.status === 200 && ok.json.success === true, `${ok.status} tx ${String(ok.json.txHash).slice(0, 14)}... gas ${ok.json.gasUsed}`);
rec_("C6", "the recipient receives the amount minus the proof-bound fee", gotRecipient === note.value - fee, `${ethers.formatEther(gotRecipient)} ETH (expected ${ethers.formatEther(note.value - fee)})`);
if (ok.json.gasCostWei) console.log(`     courier cost ${ok.json.gasCostWei} wei, fee ${ok.json.feeWei} wei, net ${BigInt(ok.json.feeWei) - BigInt(ok.json.gasCostWei)} wei`);

// ---- replay
const replay = await post("/api/relay/bow", payload);
rec_("C7", "replaying the same proof is refused by the contract check (400)", replay.status === 400, `${replay.status} ${String(replay.json.error).slice(0, 80)}`);

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
