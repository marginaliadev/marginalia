// Prints the browser SDK's (frontend/src/lib/zk.ts) Merkle results as JSON so the Node test suite can compare them with lib/marginalia.js.
import { MerkleTree, DEPTH, recoverNote, commitmentOf, nullifierOf, serializeNote, parseNote } from "../src/lib/zk.ts";

const out: any = { trees: {}, timing: {} };
for (const n of [0, 1, 2, 5, 33, 100]) {
  const leaves = Array.from({ length: n }, (_, i) => BigInt(i + 1) * 7919n);
  const t = new MerkleTree(DEPTH, leaves);
  out.trees[n] = { root: t.root().toString(), path0: n ? t.path(0).pathElements.map(String) : [], pathLast: n ? t.path(n - 1).pathElements.map(String) : [] };
}
const many = Array.from({ length: 10000 }, (_, i) => BigInt(i + 1) * 98765432123456789n);
const t0 = Date.now();
const big = new MerkleTree(DEPTH, many);
out.timing = { ms10k: Date.now() - t0, root10k: big.root().toString() };

// notes: same wire format and commitment as the CLI
const sk = 123456789n, rho = 987654321n, value = 1000000000000000n, label = 424242n;
const commitment = commitmentOf(value, label, sk, rho);
out.note = { commitment: commitment.toString(), nullifier: nullifierOf(sk, rho).toString(), serialized: serializeNote({ sk, rho, value, label, commitment }) };
out.noteRoundTrip = parseNote(out.note.serialized).commitment.toString() === commitment.toString();
console.log(JSON.stringify(out));
