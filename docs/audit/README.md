# MARGINALIA: Audit Pack (Phase 04)

This document is the entry point for the contract auditors and the ZK auditors. Companion documents: `circuit_notes.md` (circuits), `../threat_model_and_audit_pack.md` (threat model v2.0), `slither_triage.md`, `../ceremony_guide.md`. The exact hash of every in-scope file is in `manifest.json` (produced by `node scripts/audit/manifest.js write`, enforced by CI with `check` after the freeze).

## 1. Scope

| Category | Files | Notes |
|---|---|---|
| Circuits | `circuits/withdraw.circom` (112 lines), `circuits/ragequit.circom` (49), `circuits/lib/merkle.circom` (37) | compiled with **`--O2`**: withdraw 11,432 constraints, ragequit 693 |
| Contracts | `contracts/MarginaliaPool.sol` (339), `contracts/MagistrateRegister.sol` (127), `contracts/interfaces/IPoseidon.sol` | solc 0.8.24, optimizer 200 runs, evm cancun |
| Generated | `Groth16Verifier.sol`, `RagequitVerifier.sol` (snarkjs output) | not audited line by line: shown to be **identical to the export of the final zkey** (ceremony transcript) |
| Out of scope | `MarginaliaTokenPool.sol` (ERC-20), `mocks/` | will not be deployed at the initial launch |
| Off-chain (informational) | `lib/marginalia.js`, `frontend/src/lib/zk.ts`, `services/magistrate/`, `scripts/governance/` | clients and services; SDK parity is tested |

Reproducible build: `npm ci && npx hardhat compile` and `node -e 'require("./scripts/ceremony/compile").compileCircuit("withdraw")'`. Tool versions are pinned in `manifest.json`.

## 2. Threat model and trust assumptions
- The **Magistrate** only affects *who may withdraw privately*. It **cannot move funds** and cannot prevent `ragequit`.
- The **Guardian** can only stop *new deposits* and set a deposit cap; withdraw and ragequit cannot be stopped.
- The **register owner** (a 2-of-3 Safe) can replace the Magistrate and authorise pools.
- Confidentiality depends on the user's `sk` and `rho`; value security depends on Groth16 soundness and on an honest setup (ceremony).
- The relayer is not trusted: fee and recipient are bound to the proof through `context`.

## 3. Claimed invariants (and the tests that guard them)
| Invariant | Test |
|---|---|
| Pool value = deposits − withdrawals − ragequits (no value created or lost) | `test/invariant_fuzz.test.js` (3 seeds × 28 random steps with a shadow model) |
| Each nullifier can be used once; proof replay always reverts | fuzz + `test/security_onchain.test.js` |
| A note leaves through one door only (withdraw XOR ragequit) | fuzz + `security_onchain` |
| A proof is bound to recipient, relayer, fee, chain and pool address | `security_onchain` (`InvalidContext`) |
| The Folio root rebuilt from events = on-chain root; `nextIndex` = deposits + withdrawals | fuzz |
| Pause does not stop withdraw/ragequit | `security_onchain`, `scripts/test-governance.js` (real Safe on testnet) |
| The circuit rejects every input mutation (except `context`, which is bound on-chain) | `test/circuit_audit.test.js` (31 tests) |
| Ragequit does not reveal `sk`/`rho` | `circuit_audit` (only 2 public signals) |

## 4. Internal findings and their status (honest)
| # | Finding | Impact | Status |
|---|---|---|---|
| I-1 | **The committed setup is a development setup** (local ptau, single party). The provenance of the old zkey cannot be proven against its source (the original ptau no longer exists) | Critical for mainnet, irrelevant for testnet | Closed by the ceremony; `mainnet-guard` blocks mainnet deploys |
| I-2 | **Inconsistent build:** `build/withdraw_js/withdraw.wasm` is an `--O1` build (24,282 wires, 24,236 constraints) while `ragequit.wasm` is `--O2` (696 wires); the compiler was not pinned | Medium: two circuits built with different settings; no reproducibility guarantee | Fixed in code: `--O2` is pinned in `build-circuit.sh` and `compile.js`, with a provenance test. **Native circom v2.2.3 verified (2026-10-10): `--O2` = 11,432 / 693 constraints, and the ceremony rehearsal with a real withdraw proof passes (CI: `circuits-o2`).** The artefacts served by the site remain the old build until the post-ceremony redeploy |
| I-3 | The figure "24,236 constraints" (UI, README, devbrief) is correct for the committed and deployed `--O1` build; the pinned `--O2` build gives 11,432 | Low (documentation) | Update the figures in the UI and docs **together with** the O2 build + ceremony (not before) |
| I-4 | Slither (current code): 0 High/Medium findings. Low: external Poseidon call inside a loop (3 locations, by design, immutable hasher contracts) | Informational | Accepted, see `slither_triage.md` |
| I-5 | `context` is only squared inside the circuit | None: intentional, bound by the contract | Documented, tested |
| I-6 | `deploy.js` had no mainnet guard | High if deployed by mistake | Fixed: `scripts/ceremony/mainnet-guard.js` (10 tests) |

## 5. Internal test evidence (per commit of this pack)
`npx hardhat test` runs the whole suite (Phase 03 + Phase 04). Phase 04 specifically: `circuit_audit` (31), `invariant_fuzz` (3 seeds), `ceremony_rehearsal` (17), `reproducible_build` (6), `mainnet_ceremony_guard` (10). Clean ceremony rehearsal for withdraw: `node scripts/ceremony/rehearsal.js withdraw 3`.

## 6. What we ask of the auditors
Circuits: under-constrained signals, value soundness (withdrawn + remaining = value over the 128-bit range), binding of the nullifier to `(sk, rho)`, separation of the state and ASP trees, behaviour at the BN254 field bounds, safety when `remaining = 0`, ragequit not leaking secrets.
Contracts: checks-effects-interactions order in `_send`, root history and `StaleAspRoot`, access control of guardian/owner/magistrate, the `computeContext` computation, griefing by the recipient, tree capacity, interaction of the pause with exits.
