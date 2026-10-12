// Incident drill on a THROWAWAY 0xbow core on the testnet (runbook section 6). It rehearses the two emergency tools and proves what they promise:
//   1. postman rotation: the old postman loses the right to publish a root, the new one has it;
//   2. windDownPool: deposits stop for good, while withdraw, ragequit and relay keep working and the scope mapping stays intact.
// NEVER point this at a live pool: windDown is permanent. It refuses any record that is not marked as a drill.
//   SDK_DIR=<.../@0xbow/privacy-pools-core-sdk> node scripts/bow/drill.mjs deployments/bow-drill-testnet.json [--evidence docs/bow/drill-testnet.md]
import "dotenv/config";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { pathToFileURL } from "url";
import { ethers } from "ethers";

const file = process.argv[2];
const evidenceOut = process.argv.includes("--evidence") ? process.argv[process.argv.indexOf("--evidence") + 1] : null;
if (!file || !process.env.SDK_DIR) { console.error("usage: SDK_DIR=<sdk> drill.mjs <drill-record.json> [--evidence file.md]"); process.exit(1); }
if (!/drill/i.test(path.basename(file))) { console.error("refusing: the record file name must contain 'drill' (windDown is permanent, never run this on a live pool)"); process.exit(1); }
const rec = JSON.parse(fs.readFileSync(file, "utf8"));
if (rec.chainId !== 46630) { console.error("testnet only"); process.exit(1); }

const sdk = await import(pathToFileURL(path.join(process.env.SDK_DIR, "dist/node/index.mjs")).href);
const { PrivacyPoolSDK, Circuits, getCommitment, hashPrecommitment, generateMerkleProof, calculateContext } = sdk;
const provider = new ethers.JsonRpcProvider(process.env.RH_TESTNET_RPC_URL, 46630, { staticNetwork: true });
const owner = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
const newPostman = ethers.Wallet.createRandom().connect(provider);

const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const rnd = () => BigInt("0x" + crypto.randomBytes(31).toString("hex")) % FIELD;
const OWNER_ROLE = ethers.id("OWNER_ROLE"), POSTMAN_ROLE = ethers.id("ASP_POSTMAN");
const entry = new ethers.Contract(rec.entrypoint, [
  "function deposit(uint256) payable returns (uint256)", "function updateRoot(uint256,string) returns (uint256)", "function latestRoot() view returns (uint256)",
  "function grantRole(bytes32,address)", "function revokeRole(bytes32,address)", "function hasRole(bytes32,address) view returns (bool)",
  "function windDownPool(address)", "function scopeToPool(uint256) view returns (address)",
  "function relay((address processooor, bytes data) w, (uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[8] pubSignals) p, uint256 scope)",
], owner);
const POOL_ABI = [
  "event Deposited(address indexed _depositor, uint256 _commitment, uint256 _label, uint256 _value, uint256 _precommitmentHash)",
  "event LeafInserted(uint256 _index, uint256 _leaf, uint256 _root)",
  "function withdraw((address processooor, bytes data) w, (uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[8] pubSignals) p)",
  "function ragequit((uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[4] pubSignals) p)",
  "function dead() view returns (bool)", "function currentTreeDepth() view returns (uint256)",
];
const pool = new ethers.Contract(rec.pool, POOL_ABI, owner);
const poolIface = new ethers.Interface(POOL_ABI);
const SCOPE = BigInt(rec.scope);
const psdk = new PrivacyPoolSDK(new Circuits({ browser: false }));
const silent = async (fn) => { const w = process.stdout.write, e = process.stderr.write; process.stdout.write = () => true; process.stderr.write = () => true; try { return await fn(); } finally { process.stdout.write = w; process.stderr.write = e; } };
const idx = (i) => (Number.isNaN(Number(i)) ? 0 : i);
const pad = (s) => { const a = [...s]; while (a.length < 32) a.push(0n); return a; };
const depthOf = (n) => (n <= 1 ? 0 : Math.ceil(Math.log2(n)));
const coder = ethers.AbiCoder.defaultAbiCoder();
const relayData = (r, f, b) => coder.encode(["tuple(address,address,uint256)"], [[r, f, b]]);
const results = [], lines = [];
const step = (id, name, ok, detail = "") => { results.push(ok); const l = `${ok ? "PASS" : "FAIL"} ${id} ${name}${detail ? "  " + detail : ""}`; console.log(l); lines.push(l); };
const reverted = async (fn) => { try { await fn(); return null; } catch (e) { return String(e.shortMessage || e.message).slice(0, 100); } };
const toProof = (p, s, n) => ({ pA: [BigInt(p.pi_a[0]), BigInt(p.pi_a[1])], pB: [[BigInt(p.pi_b[0][1]), BigInt(p.pi_b[0][0])], [BigInt(p.pi_b[1][1]), BigInt(p.pi_b[1][0])]], pC: [BigInt(p.pi_c[0]), BigInt(p.pi_c[1])], pubSignals: s.slice(0, n).map(BigInt) });

async function leaves() {
  const head = await provider.getBlockNumber(), topic = poolIface.getEvent("LeafInserted").topicHash, out = [];
  for (let from = rec.contracts[0].block; from <= head; from += 10) for (const l of await provider.getLogs({ address: rec.pool, topics: [topic], fromBlock: from, toBlock: Math.min(from + 9, head) })) out.push(poolIface.parseLog(l).args);
  return out.sort((a, b) => Number(a._index - b._index)).map((a) => a._leaf);
}
async function deposit(value) {
  const nullifier = rnd(), secret = rnd();
  const r = await (await entry.deposit(hashPrecommitment(nullifier, secret), { value })).wait();
  const ev = r.logs.map((l) => { try { return poolIface.parseLog(l); } catch { return null; } }).find((l) => l && l.name === "Deposited").args;
  return { nullifier, secret, label: ev._label, value: ev._value };
}
async function proveWithdrawal(note, amount, withdrawal, aspLabels) {
  const commitment = getCommitment(note.value, note.label, note.nullifier, note.secret);
  const st = generateMerkleProof(await leaves(), commitment.hash), ap = generateMerkleProof(aspLabels, note.label);
  const depth = Number(await pool.currentTreeDepth());
  const context = calculateContext(withdrawal, SCOPE);
  const { proof, publicSignals } = await silent(() => psdk.proveWithdrawal(commitment, {
    context, withdrawalAmount: amount,
    stateMerkleProof: { root: st.root, leaf: commitment.hash, index: idx(st.index), siblings: pad(st.siblings) },
    aspMerkleProof: { root: ap.root, leaf: note.label, index: idx(ap.index), siblings: pad(ap.siblings) },
    stateRoot: st.root, stateTreeDepth: depth, aspRoot: ap.root, aspTreeDepth: depthOf(aspLabels.length), newSecret: rnd(), newNullifier: rnd(),
  }));
  return toProof(proof, publicSignals, 8);
}

console.log(`drill pool ${rec.pool}  entrypoint ${rec.entrypoint}  owner ${owner.address}`);
lines.push(`Drill on throwaway core: entrypoint ${rec.entrypoint}, pool ${rec.pool}, owner ${owner.address}, run ${new Date().toISOString()}`);

// ---- 1. postman rotation
await (await owner.sendTransaction({ to: newPostman.address, value: ethers.parseEther("0.00005") })).wait();
await (await entry.grantRole(POSTMAN_ROLE, newPostman.address)).wait();
await (await entry.revokeRole(POSTMAN_ROLE, owner.address)).wait();
step("D1", "after the rotation the new key is the postman and the old one is not", (await entry.hasRole(POSTMAN_ROLE, newPostman.address)) && !(await entry.hasRole(POSTMAN_ROLE, owner.address)));
const oldTry = await reverted(() => entry.updateRoot.staticCall(1n, "QmDrillOldPostmanMustNotBeAbleToPublishThisRoot0001"));
step("D2", "the old postman can no longer publish a root", oldTry !== null, oldTry || "NOT rejected");

// ---- 2. state before the incident
const v = ethers.parseEther("0.00003");
const A = await deposit(v), B = await deposit(v), C = await deposit(v);
const approved = [A.label, B.label]; // C is deliberately not approved
const aspRoot = generateMerkleProof(approved, A.label).root;
const newEntry = entry.connect(newPostman);
await (await newEntry.updateRoot(aspRoot, "QmDrillNewPostmanPublishesTheApprovedListVersion0001")).wait();
step("D3", "the new postman publishes the approved list (A and B, not C)", (await entry.latestRoot()) === aspRoot);

// ---- 3. the incident: windDown
await (await entry.windDownPool(rec.pool)).wait();
step("D4", "windDownPool marks the pool dead", (await pool.dead()) === true);
const dep = await reverted(() => entry.deposit.staticCall(hashPrecommitment(rnd(), rnd()), { value: v }));
step("D5", "a new deposit is refused after windDown (PoolIsDead)", dep !== null, dep || "NOT rejected");
step("D6", "the scope mapping is intact (relay can still find the pool)", (await entry.scopeToPool(SCOPE)).toLowerCase() === rec.pool.toLowerCase());

// ---- 4. what must keep working
const rq = await silent(() => psdk.proveCommitment(C.value, C.label, C.nullifier, C.secret));
const rqr = await (await pool.ragequit(toProof(rq.proof, rq.publicSignals, 4))).wait();
step("D7", "ragequit of the unapproved deposit C works after windDown", rqr.status === 1, `gas ${rqr.gasUsed}`);

const wDirect = { processooor: owner.address, data: "0x" };
const rd = await (await pool.withdraw(wDirect, await proveWithdrawal(A, A.value, wDirect, approved))).wait();
step("D8", "a direct withdrawal of the approved deposit A works after windDown", rd.status === 1, `gas ${rd.gasUsed}`);

const recipient = ethers.Wallet.createRandom().address;
const wRelay = { processooor: rec.entrypoint, data: relayData(recipient, owner.address, 10n) };
const before = await provider.getBalance(recipient);
const rr = await (await entry.relay(wRelay, await proveWithdrawal(B, B.value, wRelay, approved), SCOPE)).wait();
const got = (await provider.getBalance(recipient)) - before;
step("D9", "a relayed withdrawal of the approved deposit B works after windDown, net of the fee", rr.status === 1 && got === B.value - (B.value * 10n) / 10000n, `recipient got ${got} wei, gas ${rr.gasUsed}`);

// ---- 5. accounting
const left = await provider.getBalance(rec.pool);
step("D10", "the pool is empty again: every deposit left through withdraw, ragequit or relay", left === 0n, `balance ${left} wei`);

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (evidenceOut) {
  const md = `# Incident drill on a throwaway 0xbow core (testnet)\n\nThis is rehearsal evidence for the emergency tools, run with the deployer EOA as owner. It does NOT exercise the Safe signing step, which must be rehearsed with the real signers (runbook section 6).\n\n\`\`\`\n${lines.join("\n")}\n\n${results.length - failed}/${results.length} passed\n\`\`\`\n`;
  fs.mkdirSync(path.dirname(path.resolve(evidenceOut)), { recursive: true });
  fs.writeFileSync(evidenceOut, md);
  console.log("evidence written to " + evidenceOut);
}
process.exit(failed ? 1 : 0);
