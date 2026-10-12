// Run with: node --experimental-strip-types tests/bow-zk.mts  (prints JSON for test/bow_zk.test.js)
// Known answers come from the pinned upstream SDK (test/fixtures/bow_client_kat.json, bow_lean_imt_kat.json). When the pinned proving assets
// were fetched (node ../scripts/vendor/0xbow.js fetch --out public/zk-bow) a real proof is also produced and verified with the ceremony vkey.
import fs from "fs";
import path from "path";
import { poseidon2 } from "poseidon-lite";
import * as Z from "../src/lib/bow-zk.ts";
import { leanProof } from "../src/lib/bow-tree.ts";

const root = path.resolve(import.meta.dirname, "..", "..");
const kat = JSON.parse(fs.readFileSync(path.join(root, "test/fixtures/bow_client_kat.json"), "utf8"));
const lean = JSON.parse(fs.readFileSync(path.join(root, "test/fixtures/bow_lean_imt_kat.json"), "utf8"));
const out: any = {};

const value = BigInt(kat.value), label = BigInt(kat.label), nullifier = BigInt(kat.nullifier), secret = BigInt(kat.secret);
out.precommitmentOk = Z.bowCommitment !== undefined && poseidon2([nullifier, secret]).toString() === kat.precommitment;
out.commitmentOk = Z.bowCommitment(value, label, nullifier, secret).toString() === kat.commitment;
out.contextOk = Z.withdrawalContext({ processooor: kat.entrypoint, data: kat.data }, BigInt(kat.scope)).toString() === kat.context;

out.lean = Object.entries(lean).map(([n, want]: any) => {
  const leaves = Array.from({ length: Number(n) }, (_, i) => BigInt(1000 + i * 7919));
  const p = leanProof(leaves, leaves[leaves.length - 1], (a, b) => poseidon2([a, b]));
  return p.root.toString() === want.root && p.siblings.map(String).join() === want.siblings.join() && String(p.index) === (want.index === "NaN" ? "0" : want.index);
}).every(Boolean);

const note: Z.BowNote = { chainId: 46630, asset: "0x" + "ee".repeat(20), scope: BigInt(kat.scope), value, label, nullifier, secret, precommitment: BigInt(kat.precommitment), commitment: BigInt(kat.commitment), block: 123, tx: "0xabc" };
const s = Z.serializeBowNote(note);
const back = Z.parseBowNote(s);
out.noteRoundTrip = back.commitment === note.commitment && back.value === note.value && back.block === 123 && s.startsWith("marginalia-bow-v1-");
const tamper = (mut: (o: any) => void) => {
  const o = JSON.parse(Buffer.from(s.slice("marginalia-bow-v1-".length), "base64url").toString());
  mut(o);
  try { Z.parseBowNote("marginalia-bow-v1-" + Buffer.from(JSON.stringify(o)).toString("base64url")); return "accepted"; } catch (e: any) { return e.message; }
};
out.tamperValue = tamper((o) => { o.value = "2000000000000001"; });
out.tamperNullifier = tamper((o) => { o.nullifier = "999"; });
out.zeroValue = tamper((o) => { o.value = "0"; });
out.missing = tamper((o) => { delete o.label; });
try { Z.parseBowNote("marginalia-note-v1-abc"); out.badPrefix = "accepted"; } catch (e: any) { out.badPrefix = e.message; }

const secrets = Z.newBowSecrets();
out.secretsOk = secrets.nullifier > BigInt(0) && secrets.nullifier < Z.FIELD && secrets.precommitment === poseidon2([secrets.nullifier, secrets.secret]);
out.nullifierHashIsNotPrecommitment = Z.bowNullifierHash(nullifier).toString() !== kat.precommitment;

// circuit input
const others = Array.from({ length: 6 }, (_, i) => BigInt(5000 + i));
const stateLeaves = [...others.slice(0, 3), note.commitment, ...others.slice(3)];
const aspLabels = [BigInt(77), note.label, BigInt(88)];
const withdrawnValue = value / BigInt(4);
const newNullifier = Z.randomField(), newSecret = Z.randomField();
const built = Z.buildBowWithdrawInput({ note, stateLeaves, aspLabels, withdrawnValue, context: BigInt(kat.context), newNullifier, newSecret });
out.inputShape = { siblings: built.input.stateSiblings.length === 32 && built.input.ASPSiblings.length === 32, depthState: built.input.stateTreeDepth, depthAsp: built.input.ASPTreeDepth, allStrings: Object.values(built.input).every((v) => typeof v === "string" || Array.isArray(v)) };
out.changeValue = built.change.value.toString() === (value - withdrawnValue).toString();
const guard = (f: () => unknown) => { try { f(); return "accepted"; } catch (e: any) { return e.message; } };
out.tooMuch = guard(() => Z.buildBowWithdrawInput({ note, stateLeaves, aspLabels, withdrawnValue: value + BigInt(1), context: BigInt(1), newNullifier, newSecret }));
out.zeroAmount = guard(() => Z.buildBowWithdrawInput({ note, stateLeaves, aspLabels, withdrawnValue: BigInt(0), context: BigInt(1), newNullifier, newSecret }));
out.notApproved = guard(() => Z.buildBowWithdrawInput({ note, stateLeaves, aspLabels: [BigInt(77), BigInt(88)], withdrawnValue, context: BigInt(1), newNullifier, newSecret }));
out.notInState = guard(() => Z.buildBowWithdrawInput({ note, stateLeaves: others, aspLabels, withdrawnValue, context: BigInt(1), newNullifier, newSecret }));

// a real proof, when the pinned assets are present
const dir = path.join(root, "frontend", "public", "zk-bow");
if (fs.existsSync(path.join(dir, "withdraw.zkey")) && fs.existsSync(path.join(dir, "withdraw.wasm"))) {
  const snarkjs: any = await import("snarkjs");
  const crypto = await import("crypto");
  const h = (f: string) => crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, f))).digest("hex");
  const { ZK_HASHES_BOW } = await import("../src/lib/zk-hashes-bow.ts");
  out.assetsMatchPins = h("withdraw.zkey") === ZK_HASHES_BOW["withdraw.zkey"] && h("withdraw.wasm") === ZK_HASHES_BOW["withdraw.wasm"];
  const t = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(built.input, path.join(dir, "withdraw.wasm"), path.join(dir, "withdraw.zkey"));
  out.proveMs = Date.now() - t;
  const vkey = JSON.parse(fs.readFileSync(path.join(root, "vendor/0xbow/packages/circuits/trusted-setup/final-keys/withdraw.vkey"), "utf8"));
  out.verifies = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  const newCommitment = Z.bowCommitment(built.change.value, label, newNullifier, newSecret);
  out.signals = {
    newCommitment: publicSignals[0] === newCommitment.toString(),
    nullifierHash: publicSignals[1] === Z.bowNullifierHash(nullifier).toString(),
    withdrawnValue: publicSignals[2] === withdrawnValue.toString(),
    stateRoot: publicSignals[3] === built.stateRoot.toString(),
    stateDepth: publicSignals[4] === built.input.stateTreeDepth,
    aspRoot: publicSignals[5] === built.aspRoot.toString(),
    aspDepth: publicSignals[6] === built.input.ASPTreeDepth,
    context: publicSignals[7] === kat.context,
  };
  const rp = Z.toRelayProof(proof, publicSignals);
  out.relayShape = rp.pA.length === 2 && rp.pB.length === 2 && rp.pB[0].length === 2 && rp.pC.length === 2 && rp.pubSignals.length === 8;
  // a tampered signal must not verify
  const bad = [...publicSignals]; bad[2] = (BigInt(bad[2]) + BigInt(1)).toString();
  out.tamperedRejected = (await snarkjs.groth16.verify(vkey, bad, proof)) === false;
  // ragequit: the commitment circuit
  const rq = await snarkjs.groth16.fullProve(Z.bowRagequitInput({ value, label, nullifier, secret }), path.join(dir, "commitment.wasm"), path.join(dir, "commitment.zkey"));
  const rqVkey = JSON.parse(fs.readFileSync(path.join(root, "vendor/0xbow/packages/circuits/trusted-setup/final-keys/commitment.vkey"), "utf8"));
  out.ragequit = { verifies: await snarkjs.groth16.verify(rqVkey, rq.publicSignals, rq.proof), signals: rq.publicSignals.length === 4 && rq.publicSignals[0] === kat.commitment && rq.publicSignals[1] === Z.bowNullifierHash(nullifier).toString() && rq.publicSignals[2] === kat.value && rq.publicSignals[3] === kat.label };
} else {
  out.proofSkipped = "pinned assets not fetched";
}
console.log(JSON.stringify(out));
process.exit(0);
