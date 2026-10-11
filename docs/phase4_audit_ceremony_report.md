# MARGINALIA: Phase 04 "Audit & Ceremony" Execution Report

**Date:** 2026-10-09 (updated 2026-10-11) · **Reference:** `docs/phase4_audit_ceremony_plan.md`
**Summary:** all work that **can be done without outside parties** is complete and tested (audit preparation, static analysis, internal circuit audit, invariant fuzzing, ceremony toolkit and rehearsal, mainnet guard). **What cannot be done alone and does not exist yet:** the external audits (contracts and ZK), the real ceremony with ≥ 15 contributors, an independently confirmed Phase-1 hash pin, redeploying the O2 circuits, and the mainnet launch. Live status: `docs/mainnet_readiness.md`; go/no-go: `node scripts/mainnet-preflight.js`.

## 1. Test results (whole suite: 218 passing, no failures at the time of the first report)

| Suite | Content | Result |
|---|---|---|
| `test/circuit_audit.test.js` (B-TEST1–3) | Mutation of every withdraw input (+1, 0, FIELD−1) and every path element (4×20), non-bit indices, 128-bit overflow, withdraw of 1 wei and of the full amount, differential with 40 random notes, ragequit | 31/31 |
| `test/invariant_fuzz.test.js` (A-TEST3) | 3 seeds × 28 random steps with a shadow model: value conservation, nullifier replay, single exit door, Folio root | 3/3 |
| `test/ceremony_rehearsal.test.js` (D-TEST1–4, 6) | Clean rehearsal with 5 contributors + beacon on the ragequit circuit; 9 kinds of transcript forgery; the ceremony verifier on chain accepts a new proof and **rejects a proof from the dev setup** (and vice versa) | 17/17 |
| `scripts/ceremony/rehearsal.js withdraw` | Full clean rehearsal on withdraw (11,432 constraints): chain of 5 zkeys, 16-check transcript, the Solidity verifier compiles | 6/6 with a real O2 proof since 2026-10-10 (native circom) |
| `test/reproducible_build.test.js` (A-TEST1) | Two compilations = identical R1CS; plain solc = Hardhat artefact bytecode; provenance of the committed artefacts | 6/6 |
| `test/mainnet_ceremony_guard.test.js` | A mainnet deploy is refused without a valid transcript; 9 refusal scenarios | 11/11 |
| Slither on the current code | 12 contracts, 102 detectors | **0 High, 0 Medium**; 3 Low + 6 Info accepted (`docs/audit/slither_triage.md`) |

## 2. What was built
- `scripts/ceremony/` (`lib.js`, `cli.js`, `compile.js`, `rehearsal.js`, `mainnet-guard.js`, later `coordinator.js`, `contribute.js`, `phase1-check.js`, `check-deployed-verifier.js`): init → contribution → beacon → finalize → transcript → **public verifier**; the mainnet deploy guard (at least 15 contributors, beacon ≥ 2^10, pinned Phase 1, verifier = export of the final zkey).
- `scripts/audit/manifest.js` + `docs/audit/manifest.json` (provisional, not yet frozen): hash of every in-scope file, tool versions, build settings, and a `check` mode for CI after the freeze; `scripts/audit/package.js` builds the auditor bundle.
- Documents: `docs/ceremony_guide.md`, `docs/audit/README.md` (scope, assumptions, invariants ↔ tests, internal findings), `docs/audit/slither_triage.md`, `docs/audit/AUDITOR_PACKAGE.md`.
- CI: the `static-analysis` job (Slither `--fail-medium`, circuit compilation) and `circuits-o2` (checksum-pinned native circom, real-proof rehearsal); `lib/marginalia.js` gained `buildWithdrawInput` (the circuit can be attacked without generating a proof).

## 3. Real findings from this work
1. **Inconsistent build (I-2, Medium).** `build/withdraw_js/withdraw.wasm` is an `--O1` build (24,282 wires, 24,236 constraints) while `ragequit.wasm` is `--O2` (696 wires). No flag was pinned. `--O2` is now pinned in `build-circuit.sh` and the compiler; the result is **11,432** constraints for withdraw (≈ 2× smaller, faster proving). The figure "24,236" in the UI/docs is still correct for the deployed build; change it together with the O2 build + ceremony.
2. **The provenance of the old setup cannot be proven (I-1).** `snarkjs` rejects the committed zkey against another ptau ("Invalid alpha1"): the original dev ptau no longer exists. One more reason to redo everything from source through the ceremony.
3. **`deploy.js` had no mainnet guard (I-6, High if deployed by mistake).** A verifier from the dev setup could have been deployed to chain 4663. It is now refused by `mainnet-guard`; `docs/ceremony/phase1.json` was deliberately `null` so mainnet stayed blocked until the owner filled it (it is now pinned as PROVISIONAL, and mainnet is still blocked by the missing transcripts).
4. The "no constraint on `context`" property is documented and tested (intentional; bound on-chain).
5. The older Slither report that mentioned `arbitrary-send-eth` came from stale build artefacts; it does not exist in the current code.

## 3b. Completed after the first report
- **A0-T3** `docs/audit/circuit_notes.md`: signals, constraints per component (213 / 240 / 261 / 128 / 4,860, summing to exactly 11,432), security properties, intentional design points, and how to reproduce.
- **A0-T2** `docs/threat_model_and_audit_pack.md` rewritten (v2.0): trust boundaries, invariants against tests, 19 threats with an honest status, privacy leaks, status of L1–L13, a checklist. Corrections to version 1.0: the `ragequit` signature was wrong, the vault description was wrong, the claim of a "formal invariant" was overstated.
- A new gap recorded in the threat model, since closed: **no CSP/SRI** on the front end and the proving-asset hashes were not published (T18). A CSP is now enforced and the browser verifies SHA-256 of every wasm/zkey against `frontend/src/lib/zk-hashes.ts` (hashes published in `docs/audit/zk_assets.md`).

## 4. Not finished or not possible here
| Item | Reason / step |
|---|---|
| **External audit of contracts and ZK** (B, C) | Needs auditors and a budget. The audit pack is ready (`docs/audit/`, `docs/audit/RFP_EMAIL.md`) |
| **Real ceremony** (D-T4/T5) | Needs ≥ 15 independent contributors and a drand beacon. Tools, guide, coordinator and clean rehearsal are ready (`docs/ceremony_b1_plan.md`) |
| **Public Phase-1 hash pin** | Pinned as PROVISIONAL; needs a second independent confirmation (`docs/ceremony/phase1.json`, `scripts/ceremony/phase1-check.js`) |
| **Real-proof evidence for the O2 withdraw** | Done (native circom v2.2.3, 2026-10-10); the served artefacts still come from the old build until the post-ceremony redeploy |
| Large-scale fuzzing (Echidna/Foundry, millions of steps) | The in-repo fuzz is only 84 steps with proofs; install Echidna/Foundry in CI |
| Reproducible build in Docker / on a clean machine | Reproducibility on one machine is proven; not yet in Docker |
| Redeploy of verifiers/pool after the ceremony, E2E with the final zkey (D-T7) | After the real ceremony (`docs/redeploy_runbook.md`) |
| Freeze (tag, final manifest, `audit:check` in CI) | After the audit fixes |

## 5. Next steps
1. Send the audit request and recruit the ceremony contributors (`docs/outreach/`).
2. Obtain the second independent confirmation of the Phase-1 hash.
3. Schedule the ceremony after the circuit freeze.
4. Install Echidna/Foundry in CI for large-scale fuzzing.
