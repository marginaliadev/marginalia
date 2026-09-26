# MARGINALIA — Threat Model & Security Audit Packet

**Version:** 1.0.0-AUDIT-READY  
**Status:** Audit Preparation & Formal Verification (Phase 3)  
**Target Deployment:** Robinhood Chain (Arbitrum Orbit L2, Chain ID 46630 testnet / 4663 mainnet)  
**Cryptographic Primitives:** Groth16 on BN254 (`alt_bn128`), Poseidon Hasher ($t=3, 4$), AES-256-GCM, X25519 ECDH  

---

## 1. Executive Summary & Architecture

MARGINALIA is a zero-knowledge shielded privacy pool implementing an Association Set Provider (ASP) model. It allows users to deposit ETH or ERC-20 tokens, establish an anonymity set (the **Folio**), have deposit provenance vetted by an off-chain compliance engine (the **Magistrate**), and withdraw privately to fresh addresses via zero-knowledge proofs.

```
+---------------+      Deposit ETH      +------------------------+
|  User Alice   | --------------------> |     MarginaliaPool     |
+---------------+                       |   - Poseidon Merkle    |
                                        |   - Nullifier Registry |
                                        +------------------------+
                                                    |
                                                    | Leaves & Labels
                                                    v
+---------------+   Signed Groth16 Proof+------------------------+
| Relayer / Bob | <-------------------- |   Magistrate ASP Reg   |
| (Clean Addr)  | --------------------> |   - 16-Root Ring Buffer|
+---------------+   Withdraw ETH        +------------------------+
```

---

## 2. Core Cryptographic Invariants

| Axiom | Invariant | Enforcement Mechanism |
|---|---|---|
| **Axiom I: Soundness** | A Wax Seal (nullifier $N = \text{Poseidon}(sk, \rho)$) can transition from `false` to `true` exactly once. No double-spends. | `mapping(uint256 => bool) public nullifierSpent` in smart contract + circuit check `nul.out === nullifierHash`. |
| **Axiom II: Zero Knowledge** | Public signals disclose nothing about the private witness ($sk, \rho, \text{leafIndex}$). | Groth16 zero-knowledge property over BN254; fresh $\rho'$ generated per change note. |
| **Axiom III: Lawful Shade** | Private withdrawals can only occur if the deposit label exists within the Magistrate's ASP root. | `MerkleInclusion(aspDepth)` circuit constraint checked on-chain against `MagistrateRegister.isValidRoot(aspRoot)`. |
| **Solvency** | Contract Balance $\ge \sum \text{Unspent Liabilities}$. | Native conservation of value: `remaining <== value - withdrawnValue`, bounded by `Num2Bits(128)`. |

---

## 3. Threat Matrix & Vulnerability Analysis

### Threat 1: Nullifier Double-Spending
* **Attack Scenario:** An adversary attempts to withdraw a single note multiple times.
* **Mitigation:**
  1. The circuit enforces $N = \text{Poseidon}(sk, \rho) == \text{nullifierHash}$.
  2. The contract strictly asserts `if (nullifierSpent[nullifierHash]) revert NullifierAlreadySpent()`.
  3. The nullifier is recorded as spent *before* external token/ETH transfers occur, preventing reentrancy-assisted double-spends.

### Threat 2: Front-Running & Calldata Malleability
* **Attack Scenario:** An MEV bot observes a valid proof in the public mempool, copies the proof $(pA, pB, pC)$, changes `recipient` to its own address, and steals the funds.
* **Mitigation:**
  1. The transaction context is cryptographically bound into the Groth16 proof:
     $$\text{context} = \text{keccak256}(\text{chainId}, \text{poolAddress}, \text{recipient}, \text{relayer}, \text{fee}) \pmod p$$
  2. The circuit constrains `context` quadratically (`contextSquare <== context * context`).
  3. Modifying `recipient`, `relayer`, or `fee` produces an mismatched public signal and causes `Groth16Verifier.verifyProof()` to revert.

### Threat 3: Finite Field Overflow / Modulo Wrap-Around
* **Attack Scenario:** In BN254 arithmetic, $a - b$ wraps around modulo $p$ if $b > a$. An adversary attempts an overdraft ($withdrawnValue > noteValue$), expecting negative numbers to wrap into valid field elements.
* **Mitigation:**
  1. In `withdraw.circom`, both `withdrawnValue` and `remaining = value - withdrawnValue` are strictly constrained by `Num2Bits(128)`.
  2. If an overdraft occurs, `remaining` becomes $\approx p - \delta$, which requires $> 250$ bits and causes witness generation to fail immediately.

### Threat 4: Stale ASP Root Race Conditions (Mitigated in Phase 2)
* **Attack Scenario:** A user takes 3.6 seconds to synthesize a Groth16 proof against ASP Root $R_1$. Concurrently, the Magistrate publishes Root $R_2$. The user's transaction fails with `StaleAspRoot`.
* **Mitigation:**
  1. `MagistrateRegister.sol` maintains a 16-root ring buffer.
  2. `MarginaliaPool.sol` verifies `register.isValidRoot(aspRoot)`, which checks the latest root plus the previous 15 roots.

### Threat 5: Hostage Deposits via ASP Censorship (Mitigated in Phase 1)
* **Attack Scenario:** The Magistrate refuses to approve a deposit from a legitimate user, permanently locking their funds.
* **Mitigation:**
  1. `MarginaliaPool.sol` implements `ragequit(label, nullifierHash, recipient)`.
  2. Only the original `labelDepositor[label]` can invoke ragequit.
  3. Reclaims deposited funds directly and burns the nullifier on-chain so the note cannot be double-spent.

### Threat 6: Plaintext Note Theft from Client Disk (Mitigated in Phase 1)
* **Attack Scenario:** Malicious software on a user's machine reads `notes/` and drains the pool.
* **Mitigation:**
  1. `lib/vault.js` enforces AES-256-GCM authenticated encryption.
  2. Keys are derived deterministically on-demand via EIP-712 wallet signatures (`personal_sign`).

### Threat 7: ERC-20 Fee-on-Transfer / Rebasing Griefing (Mitigated in Phase 2)
* **Attack Scenario:** In `MarginaliaTokenPool.sol`, depositing a deflationary token causes the contract to receive less balance than the specified `amount`, leading to pool insolvency.
* **Mitigation:**
  1. `MarginaliaTokenPool.sol` performs a pre- and post-transfer balance check:
     $$\text{actualAmount} = \text{balanceAfter} - \text{balanceBefore}$$
  2. Commitments are strictly minted based on `actualAmount`.

---

## 4. Circuit Public Signal Specification

The Groth16 verifier and contracts depend strictly on this ordering:

| Index | Signal Name | Verification Rule |
|:---:|:---:|---|
| `[0]` | `withdrawnValue` | $0 < \text{withdrawnValue} \le 2^{128}-1$; $\ge \text{fee}$. |
| `[1]` | `stateRoot` | Must exist in `MarginaliaPool.roots[]` (last 64 Folio roots). |
| `[2]` | `aspRoot` | Must satisfy `MagistrateRegister.isValidRoot()` (last 16 ASP roots). |
| `[3]` | `context` | Must strictly equal `computeContext(Withdrawal)`. |
| `[4]` | `nullifierHash` | Must be `false` in `nullifierSpent[]` mapping. |
| `[5]` | `newCommitment` | Re-inserted into Folio as the change note. |

---

## 5. Audit Readiness Verification Checklist

- [x] All state-changing methods employ `nonReentrant` mutex.
- [x] EVM target configured to `cancun` with 200 optimizer runs.
- [x] Public signals checked strictly $< \text{SNARK\_SCALAR\_FIELD}$.
- [x] No unconstrained signals in `withdraw.circom` or `merkle.circom`.
- [x] Zero-knowledge properties verified with randomized $\rho'$ on change notes.
- [x] Formal invariant test suite passing 100%.
