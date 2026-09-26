# MARGINALIA — Tasks Breakdown & Phase-by-Phase Testing Matrix

**Standard:** Institutional Zero-Knowledge Protocol Engineering  
**Version:** 1.0.0-EXEC  
**Purpose:** Actionable work breakdown structure (WBS) with verifiable test suites for every development phase.

---

## Testing Philosophy & Invariants

At all phases, the Marginalia protocol must enforce five non-negotiable cryptographic invariants:
1. **Solvency Invariant:** $\sum \text{Contract ETH Balance} \ge \sum \text{Unspent Note Values}$.
2. **Double-Spend Invariant:** $\forall \text{Note } i, \text{Nullifier } N_i \text{ can transition from False} \to \text{True exactly once}$.
3. **Soundness Invariant:** No withdrawal proof can verify without a valid path in Folio and ASP Register.
4. **Zero-Knowledge Invariant:** The witness (private keys, leaf position, note value) cannot be deduced from public signals or transaction calldata.
5. **Anti-Frontrunning Invariant:** Proof context binds $H(\text{chainId}, \text{pool}, \text{recipient}, \text{relayer}, \text{fee})$; modifying any field invalidates the proof.

---

## Phase 0: Baseline Setup & Prototype Verification

### Tasks (Phase 0)
- [ ] **TASK-0.1:** Toolchain & Dependency Installation (`npm install`).
- [ ] **TASK-0.2:** Environment Configuration (Generate local `.env` with dev-only keys).
- [ ] **TASK-0.3:** Hardhat & Solidity Compilation (`npx hardhat compile`).
- [ ] **TASK-0.4:** Baseline Test Suite Execution (`npx hardhat test`).

### Testing Matrix (Phase 0)
| Test ID | Test Category | Target Component | Description / Scenario | Pass Criteria |
|:---:|:---:|:---:|---|---|
| `TEST-0.1` | Unit | `lib/marginalia.js` vs `MarginaliaPool.sol` | Parity between off-chain Merkle tree and on-chain Folio (empty + after inserts). | Both calculate identical root. |
| `TEST-0.2` | Unit | `MarginaliaPool.sol` | Commitment calculation matches $Poseidon(value, label, precommitment)$. | Contract commitment == JS SDK calculation. |
| `TEST-0.3` | Integration | End-to-End Pool | Full withdrawal to a fresh address via a relayer. | Funds delivered to recipient; relayer fee paid; leaf inserted. |
| `TEST-0.4` | Integration | End-to-End Pool | Partial withdrawal, then spend change note. | Correct change note minted; second withdrawal succeeds. |
| `TEST-0.5` | Security | `MarginaliaPool.sol` | **Axiom I:** Double spend attempt using identical nullifier. | Reverts with `NullifierAlreadySpent`. |
| `TEST-0.6` | Security | `MagistrateRegister.sol` | **Axiom III:** Withdrawal using an unapproved label. | Prover/Verifier rejects; cannot prove against ASP root. |
| `TEST-0.7` | Security | Context Binding | Front-running test: change recipient or fee on a generated proof. | Reverts with `InvalidContext` or `InvalidProof`. |
| `TEST-0.8` | Circuit | `withdraw.circom` | Overdraw attempt: withdrawing amount > note value. | Circuit witness generation fails with `Num2Bits` overdraft error. |
| `TEST-0.9` | Performance | Gas Telemetry | Gas reporting for `deposit()` and `withdraw()`. | Gas consumption measured and logged. |
| `TEST-0.10` | Security | `Groth16Verifier.sol` | Tampering with public signals submitted to verifier. | Reverts with `InvalidProof`. |
| `TEST-0.11` | Access | `MagistrateRegister.sol` | Non-magistrate address attempts `publishRoot()`. | Reverts with `NotMagistrate`. |
| `TEST-0.12` | SDK | `lib/marginalia.js` | Note serialization and deserialization round-trip. | Decoded note matches original struct exactly. |

---

## Phase 1: Testnet Alpha & Core Security Remediation

### Tasks (Phase 1)
- [ ] **TASK-1.1: Ragequit / Emergency Exit Mechanism (L3)**
  - Add `ragequit(uint256 precommitment, uint256 index, address recipient)` to `MarginaliaPool.sol`.
  - Create exit nullifier mapping `exitNullifiers[N_exit]`.
  - Add time-delay logic (e.g. 7 days if unapproved by Magistrate).
- [ ] **TASK-1.2: Client-Side Note Encryption Module (L6)**
  - Implement `lib/vault.js` using EIP-712 wallet signature derivation (`personal_sign`).
  - Encrypt notes with AES-256-GCM before saving to disk/browser storage.
- [ ] **TASK-1.3: Real-Time Event Indexer (L11)**
  - Initialize Ponder indexer in `indexer/`.
  - Index `LeafInserted`, `Deposited`, `Withdrawn`, `RootPublished`.
  - Expose GraphQL query for 20-level Merkle path witness.
- [ ] **TASK-1.4: Next.js Web UI & Web Worker Prover**
  - Scaffold Next.js 14/15 application in `webapp/`.
  - Offload `snarkjs.groth16.fullProve` to a Web Worker.
  - Implement Deposit, ASP Status, and Withdraw flows.
- [ ] **TASK-1.5: Testnet Deployment to Robinhood Chain (Chain ID `46630`)**
  - Deploy contracts and verify on Blockscout explorer.

### Testing Matrix (Phase 1)
| Test ID | Test Category | Target Component | Description / Scenario | Pass Criteria |
|:---:|:---:|:---:|---|---|
| `TEST-1.1` | Access Control | `MarginaliaPool.sol` | Non-depositor attempts to execute `ragequit()`. | Reverts with `NotOriginalDepositor`. |
| `TEST-1.2` | Security | `MarginaliaPool.sol` | Depositor tries double ragequit on same deposit. | Reverts with `ExitNullifierSpent`. |
| `TEST-1.3` | Integration | `MarginaliaPool.sol` | Note that is ragequit cannot subsequently be withdrawn via ZK proof. | Shielded withdraw fails because leaf or nullifier is invalidated. |
| `TEST-1.4` | Crypto / Vault | `lib/vault.js` | Note encryption round-trip with correct signature. | Decrypted plaintext equals original note. |
| `TEST-1.5` | Crypto / Vault | `lib/vault.js` | Attempt to decrypt note with wrong wallet signature or tampered ciphertext. | Throws authentication tag mismatch error. |
| `TEST-1.6` | Integration | `indexer/` (Ponder) | Ingest 100 random deposits and verify Merkle root against on-chain `getLastRoot()`. | Roots match 100% across all 100 blocks. |
| `TEST-1.7` | Performance | Web Worker Prover | Client generates Groth16 proof in browser environment without blocking main UI thread. | UI maintains 60 FPS; proof generated in $\le 5$ seconds. |
| `TEST-1.8` | Testnet E2E | Robinhood Chain | End-to-end cycle on live testnet (`46630`). | Real testnet tx confirmed; funds received at clean address. |

---

## Phase 2: Protocol Hardening & Institutional Extensions

### Tasks (Phase 2)
- [ ] **TASK-2.1: Mersenne Courier Relayer Daemon (L7)**
  - Standalone Node.js/Fastify service in `services/relayer/`.
  - Dynamic gas estimation + fee quoting API.
  - Private RPC dispatch to prevent mempool front-running.
- [ ] **TASK-2.2: Magistrate Decentralization & Sliding-Window ASP (L4, L5)**
  - Modify `MarginaliaPool.sol` to maintain ring buffer of last 16 ASP roots.
  - Update `magistrate-approve.js` to pin label datasets to IPFS and store IPFS hash on-chain.
- [ ] **TASK-2.3: Inlined Yul Poseidon Hasher (L8)**
  - Replace external Poseidon calls with inlined assembly Yul Poseidon implementation.
- [ ] **TASK-2.4: Multi-Asset & ERC-20 Support (L9)**
  - Develop `MarginaliaTokenPool.sol` with `SafeERC20`.
  - Add `assetId` into commitment circuit.
- [ ] **TASK-2.5: Viewing Keys / Letter of Disclosure (L10)**
  - Implement asymmetric ECDH encryption for on-chain deposit memos.
  - Build `lib/disclosure.js` for tax/auditor compliance verification.

### Testing Matrix (Phase 2)
| Test ID | Test Category | Target Component | Description / Scenario | Pass Criteria |
|:---:|:---:|:---:|---|---|
| `TEST-2.1` | Integration | Relayer Daemon | Relayer simulates withdrawal, verifies fee margin, and submits tx. | User receives withdrawn amount; relayer receives fee; gas payer detached. |
| `TEST-2.2` | Concurrency | `MarginaliaPool.sol` | ASP publishes new root while user is proving with previous root (within 16 roots). | Transaction succeeds without `StaleAspRoot`. |
| `TEST-2.3` | Benchmark | Gas Optimization | Gas consumption comparison between external Poseidon vs Inlined Yul Poseidon. | Deposit gas drops from ~930k to $\le 250\text{k}$; Withdraw gas drops by $\ge 30\%$. |
| `TEST-2.4` | Fuzz / Edge Cases | `MarginaliaTokenPool.sol` | Deposit and withdraw using fee-on-transfer, rebasing, and non-standard ERC-20s. | Reverts or properly accounts for actual transferred balance. |
| `TEST-2.5` | Compliance | `lib/disclosure.js` | Auditor with Viewing Key decrypts deposit details from on-chain event. | Auditor obtains `value`, `depositor`, `timestamp`; cannot forge withdrawals. |

---

## Phase 3: Formal Verification, Security Audits & Ceremony

### Tasks (Phase 3)
- [ ] **TASK-3.1: Automated Static Analysis & Invariant Fuzzing**
  - Run Slither, Aderyn, Echidna property tests.
- [ ] **TASK-3.2: Formal ZK Circuit Verification**
  - Execute Circomspect and Picus on `withdraw.circom` and `merkle.circom`.
- [ ] **TASK-3.3: External Audits**
  - Contract audit (Tier-1 firm) & ZK circuit audit (specialist firm).
- [ ] **TASK-3.4: Phase-2 Trusted Setup MPC Ceremony**
  - Coordinate decentralized Phase-2 ceremony via `p0tion`.

### Testing Matrix (Phase 3)
| Test ID | Test Category | Target Component | Description / Scenario | Pass Criteria |
|:---:|:---:|:---:|---|---|
| `TEST-3.1` | Static Analysis | Solidity Contracts | Comprehensive Slither and Aderyn scans. | Zero high or medium severity findings. |
| `TEST-3.2` | Property Fuzzing | `MarginaliaPool.sol` | Echidna runs 100,000 iterations asserting invariant: pool balance $\ge$ liabilities. | Invariant never violated. |
| `TEST-3.3` | Formal Circuit | `withdraw.circom` | Picus formal check for under-constrained signals and unique witness determination. | Formally proven: each public output is strictly uniquely determined. |
| `TEST-3.4` | Cryptographic | MPC Ceremony | Verification of Phase-2 contribution transcript and beacon. | All signatures and hashes verified against public transcript. |

---

## Phase 4: Production Mainnet Launch (Robinhood Chain ID 4663)

### Tasks (Phase 4)
- [ ] **TASK-4.1: Guarded Launch Parameters**
  - Configure deposit caps (e.g. 10 ETH) and emergency pause multisig.
- [ ] **TASK-4.2: Infrastructure & Real-Time Monitoring**
  - Set up Tenderly alerts, OpenZeppelin Defender, and Datadog dashboards.
- [ ] **TASK-4.3: Incident Runbook Execution Drill**
  - Simulate emergency pause of deposits and verify withdrawals remain operational.

### Testing Matrix (Phase 4)
| Test ID | Test Category | Target Component | Description / Scenario | Pass Criteria |
|:---:|:---:|:---:|---|---|
| `TEST-4.1` | Mainnet Fork | Complete System | Run full end-to-end deposit-approve-withdraw pipeline on mainnet RPC fork. | All transactions confirm cleanly under mainnet gas rules. |
| `TEST-4.2` | Emergency Drill | Pause Guardian | Guardian triggers deposit pause. | `deposit()` reverts with `Paused`; `withdraw()` continues to work uninterrupted. |
| `TEST-4.3` | Stress / Reorg | Indexer & Relayer | Simulate 5-block L2 reorg during withdrawal submission. | Indexer automatically heals tree; no double-spends occur. |
