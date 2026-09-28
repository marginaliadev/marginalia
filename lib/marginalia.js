// MARGINALIA client SDK (prototype): notes, Merkle trees, proofs.
const crypto = require("crypto");
const path = require("path");
const snarkjs = require("snarkjs");
const { buildPoseidon, poseidonContract } = require("circomlibjs");

const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const DEPTH = 20;
const ASP_DEPTH = 20;
const BUILD_DIR = path.join(__dirname, "..", "build");
const WASM = path.join(BUILD_DIR, "withdraw_js", "withdraw.wasm");
const ZKEY = path.join(BUILD_DIR, "withdraw_final.zkey");
const RQ_WASM = path.join(BUILD_DIR, "ragequit_js", "ragequit.wasm");
const RQ_ZKEY = path.join(BUILD_DIR, "ragequit_final.zkey");

// ---------------------------------------------------------------- Poseidon
let _poseidon;
async function getPoseidon() {
  if (!_poseidon) _poseidon = await buildPoseidon();
  return _poseidon;
}
async function hasher() {
  const p = await getPoseidon();
  return (inputs) => p.F.toObject(p(inputs.map((x) => BigInt(x))));
}

function randomField() {
  // 31 random bytes is always < FIELD
  return BigInt("0x" + crypto.randomBytes(31).toString("hex"));
}

// ---------------------------------------------------------------- Merkle tree
// Mirrors MarginaliaPool._insert exactly (zero leaf = 0, Poseidon(left, right)).
class MerkleTree {
  constructor(depth, hash, leaves = []) {
    this.depth = depth;
    this.hash = hash;
    this.zeros = [0n];
    for (let i = 1; i <= depth; i++) this.zeros.push(hash([this.zeros[i - 1], this.zeros[i - 1]]));
    this.layers = [[]];
    for (let i = 1; i <= depth; i++) this.layers.push([]);
    for (const l of leaves) this.insert(l);
  }
  insert(leaf) {
    let idx = this.layers[0].length;
    this.layers[0].push(BigInt(leaf));
    for (let lvl = 0; lvl < this.depth; lvl++) {
      const parentIdx = idx >> 1;
      const left = this.layers[lvl][parentIdx * 2];
      const right = this.layers[lvl][parentIdx * 2 + 1] ?? this.zeros[lvl];
      this.layers[lvl + 1][parentIdx] = this.hash([left, right]);
      idx = parentIdx;
    }
    return this.layers[0].length - 1;
  }
  root() {
    return this.layers[this.depth][0] ?? this.zeros[this.depth];
  }
  indexOf(leaf) {
    return this.layers[0].findIndex((l) => l === BigInt(leaf));
  }
  path(index) {
    if (index < 0 || index >= this.layers[0].length) throw new Error("leaf not in tree");
    const pathElements = [];
    const pathIndices = [];
    let idx = index;
    for (let lvl = 0; lvl < this.depth; lvl++) {
      const sibling = idx ^ 1;
      pathElements.push(this.layers[lvl][sibling] ?? this.zeros[lvl]);
      pathIndices.push(idx & 1);
      idx >>= 1;
    }
    return { pathElements, pathIndices };
  }
}

// ---------------------------------------------------------------- Notes
// A note is the secret the user must keep. Losing it = losing the funds.
async function newSecret(sk = randomField(), rho = randomField()) {
  const H = await hasher();
  const P = H([sk]);
  const precommitment = H([P, rho]);
  return { sk, rho, P, precommitment };
}

async function commitmentOf(value, label, precommitment) {
  const H = await hasher();
  return H([value, label, precommitment]);
}

async function nullifierOf(sk, rho) {
  const H = await hasher();
  return H([sk, rho]);
}

function serializeNote(note) {
  const plain = Object.fromEntries(Object.entries(note).map(([k, v]) => [k, v.toString()]));
  return "marginalia-note-v1-" + Buffer.from(JSON.stringify(plain)).toString("base64url");
}
function parseNote(str) {
  if (!str.startsWith("marginalia-note-v1-")) throw new Error("not a marginalia note");
  const obj = JSON.parse(Buffer.from(str.slice("marginalia-note-v1-".length), "base64url").toString());
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = /^\d+$/.test(v) ? BigInt(v) : v;
  return out;
}

// ---------------------------------------------------------------- Chain helpers
async function deployHashers(signer, ethers) {
  const F1 = new ethers.ContractFactory(poseidonContract.generateABI(1), poseidonContract.createCode(1), signer);
  const F2 = new ethers.ContractFactory(poseidonContract.generateABI(2), poseidonContract.createCode(2), signer);
  const F3 = new ethers.ContractFactory(poseidonContract.generateABI(3), poseidonContract.createCode(3), signer);
  const h1 = await F1.deploy();
  await h1.waitForDeployment();
  const h2 = await F2.deploy();
  await h2.waitForDeployment();
  const h3 = await F3.deploy();
  await h3.waitForDeployment();
  return { h1, h2, h3 };
}

/** Rebuild the Folio from LeafInserted events. */
async function buildStateTree(pool, fromBlock = 0) {
  const H = await hasher();
  const events = await pool.queryFilter(pool.filters.LeafInserted(), fromBlock);
  events.sort((a, b) => Number(a.args.index - b.args.index));
  return new MerkleTree(DEPTH, H, events.map((e) => e.args.leaf));
}

async function buildAspTree(labels) {
  const H = await hasher();
  return new MerkleTree(ASP_DEPTH, H, labels);
}

/** Parse the Deposited event of a deposit tx receipt and complete the note. */
function noteFromDepositReceipt(pool, receipt, secret) {
  for (const log of receipt.logs) {
    try {
      const ev = pool.interface.parseLog(log);
      if (ev && ev.name === "Deposited") {
        return {
          sk: secret.sk,
          rho: secret.rho,
          value: ev.args.value,
          label: ev.args.label,
          commitment: ev.args.commitment,
        };
      }
    } catch (_) {}
  }
  throw new Error("Deposited event not found");
}

// ---------------------------------------------------------------- Proving
/**
 * Build a withdrawal proof.
 * @returns {{ proof, changeNote, nullifierHash }} proof is shaped for MarginaliaPool.withdraw
 */
async function proveWithdraw({ note, stateTree, aspTree, withdrawnValue, context, wasm = WASM, zkey = ZKEY, unsafeSkipChecks = false }) {
  withdrawnValue = BigInt(withdrawnValue);
  if (!unsafeSkipChecks && withdrawnValue > note.value) throw new Error("withdrawnValue exceeds note value");

  const H = await hasher();
  const leafIndex = stateTree.indexOf(note.commitment);
  if (leafIndex < 0) throw new Error("note commitment not found in state tree");
  const labelIndex = aspTree.indexOf(note.label);
  if (labelIndex < 0) throw new Error("label not approved by the Magistrate (not in ASP tree)");

  const sp = stateTree.path(leafIndex);
  const ap = aspTree.path(labelIndex);

  const newRho = randomField();
  const remaining = note.value - withdrawnValue;
  const P = H([note.sk]);
  const newCommitment = H([remaining, note.label, H([P, newRho])]);
  const nullifierHash = H([note.sk, note.rho]);

  const input = {
    withdrawnValue,
    stateRoot: stateTree.root(),
    aspRoot: aspTree.root(),
    context: BigInt(context),
    nullifierHash,
    newCommitment,
    sk: note.sk,
    value: note.value,
    label: note.label,
    rho: note.rho,
    statePathElements: sp.pathElements,
    statePathIndices: sp.pathIndices,
    aspPathElements: ap.pathElements,
    aspPathIndices: ap.pathIndices,
    newRho,
  };
  const stringify = (o) =>
    JSON.parse(JSON.stringify(o, (_, v) => (typeof v === "bigint" ? v.toString() : v)));

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(stringify(input), wasm, zkey);

  const solidityProof = {
    pA: [proof.pi_a[0], proof.pi_a[1]],
    pB: [
      [proof.pi_b[0][1], proof.pi_b[0][0]],
      [proof.pi_b[1][1], proof.pi_b[1][0]],
    ],
    pC: [proof.pi_c[0], proof.pi_c[1]],
    pubSignals: publicSignals,
  };

  const changeNote = {
    sk: note.sk,
    rho: newRho,
    value: remaining,
    label: note.label,
    commitment: newCommitment,
  };
  return { proof: solidityProof, changeNote, nullifierHash, publicSignals };
}

/**
 * Build a ragequit proof (circuits/ragequit.circom). Reveals only the precommitment
 * (already public on-chain) and the note's genuine nullifier. sk / rho stay private.
 * @returns {{ proof, nullifierHash }} proof is shaped for MarginaliaPool.ragequit
 */
async function proveRagequit({ note, wasm = RQ_WASM, zkey = RQ_ZKEY }) {
  const H = await hasher();
  const precommitment = H([H([note.sk]), note.rho]);
  const nullifierHash = H([note.sk, note.rho]);
  const input = {
    precommitment: precommitment.toString(),
    nullifierHash: nullifierHash.toString(),
    sk: note.sk.toString(),
    rho: note.rho.toString(),
  };
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
  return {
    proof: {
      pA: [proof.pi_a[0], proof.pi_a[1]],
      pB: [
        [proof.pi_b[0][1], proof.pi_b[0][0]],
        [proof.pi_b[1][1], proof.pi_b[1][0]],
      ],
      pC: [proof.pi_c[0], proof.pi_c[1]],
      pubSignals: publicSignals,
    },
    nullifierHash,
  };
}

module.exports = {
  RQ_WASM,
  RQ_ZKEY,
  proveRagequit,
  FIELD,
  DEPTH,
  ASP_DEPTH,
  WASM,
  ZKEY,
  hasher,
  randomField,
  MerkleTree,
  newSecret,
  commitmentOf,
  nullifierOf,
  serializeNote,
  parseNote,
  deployHashers,
  buildStateTree,
  buildAspTree,
  noteFromDepositReceipt,
  proveWithdraw,
};
