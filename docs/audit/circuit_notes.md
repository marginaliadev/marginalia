# MARGINALIA: Circuit Notes for Auditors

Sources: `circuits/withdraw.circom` (112 lines), `circuits/ragequit.circom` (49), `circuits/lib/merkle.circom` (37). Language: circom 2.1.9, BN254 curve, Groth16 proofs. Primitives from `circomlib` 2.0.5 (`Poseidon`, `Num2Bits`). Every number below was measured with a `--O2` compilation (`scripts/ceremony/compile.js`) and can be reproduced.

## 1. Notation
| Symbol | Meaning |
|---|---|
| `sk`, `rho` | note secrets (random, < p). `sk` is the owner key, `rho` is per-note randomness |
| `P = Poseidon(sk)` | the owner's public key |
| `pre = Poseidon(P, rho)` | *precommitment* (published at deposit time) |
| `C = Poseidon(value, label, pre)` | *commitment*, a leaf of the Folio tree |
| `N = Poseidon(sk, rho)` | nullifier ("Wax Seal"), burned when the note exits |
| `label` | deposit label created by the contract: `keccak256(chainId, pool, nonce) mod p` |

## 2. The `Withdraw(20, 20)` circuit

### 2.1 Signals
| Signal | Kind | Meaning | Checked on-chain by |
|---|---|---|---|
| `withdrawnValue` | public [0] | value leaving the pool (wei) | `> 0`, `fee <= withdrawnValue`; `withdrawnValue - fee` is sent |
| `stateRoot` | public [1] | root of the Folio tree (depth 20) | `isKnownRoot` (last 64 roots) |
| `aspRoot` | public [2] | root of the approved-label tree (depth 20) | `register.isValidRoot` (last 16 roots) |
| `context` | public [3] | binding to the transaction | `== computeContext(recipient, relayer, fee)` |
| `nullifierHash` | public [4] | `N` | never used before; then marked as spent |
| `newCommitment` | public [5] | commitment of the change note | inserted into the Folio (always, even with value 0) |
| `sk, value, label, rho` | private | secrets and contents of the note | |
| `statePathElements/Indices[20]` | private | Merkle path in the Folio | |
| `aspPathElements/Indices[20]` | private | Merkle path in the ASP tree | |
| `newRho` | private | new `rho` for the change note | |

### 2.2 Constraints (in source order) and their cost
| # | Statement proven | Component | Constraints |
|---|---|---|---|
| 1 | `P = Poseidon(sk)` (ownership) | `Poseidon(1)` | 213 |
| 2 | `pre = Poseidon(P, rho)` | `Poseidon(2)` | 240 |
| 2 | `C = Poseidon(value, label, pre)` | `Poseidon(3)` | 261 |
| 3 | `C` is a leaf under `stateRoot` | `MerkleInclusion(20)` | 4,860 |
| 4 | `label` is a leaf under `aspRoot` | `MerkleInclusion(20)` | 4,860 |
| 5 | `Poseidon(sk, rho) = nullifierHash` | `Poseidon(2)` | 240 |
| 6 | `remaining = value - withdrawnValue`; both in `[0, 2^128)` | 2 × `Num2Bits(128)` | 256 |
| 7 | change note: `newPre = Poseidon(P, newRho)`, `newCommitment = Poseidon(remaining, label, newPre)` | `Poseidon(2)` + `Poseidon(3)` | 501 |
| 8 | `contextSquare = context * context` (keeps `context` from being optimised away) | 1 multiplication | 1 |
| | **Total (`--O2`)** | | **11,432** (6 public, 85 private, 11,478 wires) |

The `--O1` build (without full simplification) yields 24,236 constraints and a **different** circuit; the optimisation level must be pinned (see `docs/audit/README.md`, finding I-2).

### 2.3 `MerkleInclusion(depth)` (`lib/merkle.circom`)
For each level: `pathIndices[i]` is forced to be a bit (`b * (b - 1) === 0`), `left = node + b*(sibling - node)`, `right = sibling + b*(node - sibling)`, `node' = Poseidon(left, right)`; the output is `root = node[depth]`. Cost: 20 × (240 + 3) = 4,860. The hashing order is identical to `MarginaliaPool._insert` (zeros for empty siblings: `zeros[level]`) and is tested to match the JS and TypeScript implementations (`test/merkle_bulk.test.js`, `test/browser_sdk_parity.test.js`).

### 2.4 Security properties claimed
| Property | Why it holds in the circuit |
|---|---|
| **Value soundness** (cannot withdraw more than the note holds) | `value = withdrawn + remaining` with both 128-bit; a negative difference becomes ≈ p and fails `Num2Bits(128)` |
| **One note, one nullifier** | `N` is a deterministic function of `(sk, rho)`; the change note uses a fresh `newRho`, so its nullifier differs |
| **Label membership** | the (private) label must be in the ASP tree; labels are created by the contract, not by users |
| **Change-note linkage** | same `sk` and `label`, only `rho` and `value` change: owner and label provenance are preserved |
| **Transaction binding** | `context` is public and constrained by the contract; changing recipient/relayer/fee changes a public signal, so verification fails |
| **Zero-knowledge** | only the 6 values above are public; `sk`, `rho`, `value`, `label`, the leaf index and the paths stay private |

### 2.5 Intentional design points (not defects)
1. **`context` is only squared inside the circuit.** It is the only input that still yields a witness after being changed. This is intentional: the value is bound by `computeContext` in the contract and by the Groth16 public-signal check. Tested: `test/circuit_audit.test.js` (a context mutation is accepted at witness level) and `test/security_onchain.test.js` (changing recipient, relayer or fee → `InvalidContext`).
2. **`value` and `label` have no range check of their own.** `value` is bounded indirectly (`withdrawn + remaining < 2^129`) and must match the commitment the contract builds from `msg.value` (≤ `uint128`). `label` is < p naturally, being a field element.
3. **`withdrawnValue = 0` passes in the circuit.** The contract rejects it (`InvalidValue`).
4. **No "leaf is non-zero" check.** An empty leaf is `0`; proving membership of `0` requires `C = 0`, i.e. a Poseidon preimage: infeasible.
5. **Depth 20 is hardcoded** (`main = Withdraw(20, 20)`): capacity 1,048,576 leaves; the contract rejects further deposits once full (`TreeFull`).

## 3. The `Ragequit()` circuit
Public: `precommitment` [0], `nullifierHash` [1]. Private: `sk`, `rho`.
| Statement | Component | Constraints |
|---|---|---|
| `Poseidon(Poseidon(sk), rho) = precommitment` | `Poseidon(1)` + `Poseidon(2)` | 453 |
| `Poseidon(sk, rho) = nullifierHash` | `Poseidon(2)` | 240 |
| **Total (`--O2`)** | | **693** (2 public, 2 private, 696 wires) |

The contract checks `precommitment == labelPrecommitment[label]` (only the original deposit can be ragequit; **change notes cannot**, because their `rho` is new) and that the caller is `labelDepositor[label]`. The nullifier burned is the same as the withdraw nullifier, so ragequit and withdraw exclude each other.

## 4. Circuit ↔ contract ↔ client compatibility
| Item | Location | Guarded by |
|---|---|---|
| Order of the withdraw public signals `[value, stateRoot, aspRoot, context, nullifier, newCommitment]` | `Groth16Verifier` (6) and `MarginaliaPool.withdraw` | `test/circuit_audit.test.js` (B-TEST2), `security_onchain` |
| Identical Poseidon: circomlib, hasher contracts, `circomlibjs`, `poseidon-lite` (browser) | whole system | `test/browser_sdk_parity.test.js` and differential fuzz |
| Swapped `pB` format (G2 coordinate order) | `lib/marginalia.js`, `frontend/src/lib/zk.ts` | on-chain proof tests |

## 5. How to reproduce
```bash
npm ci
node -e 'const {compileCircuit}=require("./scripts/ceremony/compile");for (const c of ["withdraw","ragequit"]) console.log(c, compileCircuit(c,{force:true}).r1cs)'
npx snarkjs r1cs info .audit-build/withdraw.r1cs      # 11,432 constraints, 6 public, 85 private
npx hardhat test test/circuit_audit.test.js           # mutation attacks against the deployed witness generator
```
The breakdown in 2.2 was measured by compiling each component on its own: `Poseidon(1)=213`, `Poseidon(2)=240`, `Poseidon(3)=261`, `Num2Bits(128)=128`, `MerkleInclusion(20)=4,860`.

## 6. Suggested checklist for auditors
- Can any signal be changed without breaking the witness, other than `context`? (We test every input and every path element, `test/circuit_audit.test.js`.)
- Are the `Num2Bits(128)` checks on `withdrawnValue` and `remaining` enough to prevent overdraft under the BN254 field bound?
- Can a depositor manipulate the relation between `label` (created by the contract) and the ASP tree?
- Behaviour when `remaining = 0` (a zero-value change note is still inserted as a leaf).
- Consistency of the Poseidon parameters between circomlib (circuit), the deployed hasher contracts and the client libraries.
- Soundness at the setup level: it depends on the ceremony (`docs/ceremony_guide.md`); the setup currently committed is the development setup.
