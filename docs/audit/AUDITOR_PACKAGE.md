# MARGINALIA: Auditor package (cover note)

**Project:** MARGINALIA, a zero-knowledge shielded ETH pool with an association-set (ASP) compliance model, for Robinhood Chain (Orbit L2)
**Status:** running on testnet (chain 46630), **not audited**, **not deployed on mainnet** · **Prepared:** 2026-10-11
**Repository:** `https://github.com/marginaliadev/marginalia` (public) · **Audit baseline:** the commit printed in `docs/audit/manifest.json` (`git.commit`); the final freeze commit is tagged after your findings are fixed.

We are asking for **two independent reviews** (they may be the same firm with two teams):
1. **Smart-contract audit** of `MarginaliaPool.sol` and `MagistrateRegister.sol`.
2. **ZK / circuit audit** of `withdraw.circom` and `ragequit.circom`, the Groth16 setup procedure, and the proof-to-contract bindings.

Everything in this folder is written for a reviewer who has not seen the project. Start with `README.md` (scope, trust model, invariants, internal findings), then `circuit_notes.md`, then `../threat_model_and_audit_pack.md`.

---

## 1. What the system does (one paragraph)
Users deposit ETH into the pool and receive a **note** `(sk, rho, value, label)`; the pool stores the commitment `Poseidon3(value, label, Poseidon2(Poseidon1(sk), rho))` in a depth-20 Merkle tree. To withdraw (fully or partially, with a change note) a user proves in zero knowledge that (a) the note is in the state tree, (b) its `label` is in the **approved-label tree** whose root the *Magistrate* has published in `MagistrateRegister`, (c) the nullifier `Poseidon2(sk, rho)` is correct, and (d) `withdrawn + remaining = value`. The proof is bound to `(recipient, relayer, fee, chainId, pool)` through a public `context`. A depositor can always exit with **ragequit** (no ASP needed) by revealing only the precommitment's preimage proof.

## 2. Scope
| Area | Files | Size | Notes |
|---|---|---|---|
| Contracts (in scope) | `contracts/MarginaliaPool.sol`, `contracts/MagistrateRegister.sol`, `contracts/interfaces/IPoseidon.sol` | 339 + 127 + 36 lines | solc 0.8.24, optimizer 200 runs, EVM cancun (pinned in `hardhat.config.js`, recorded in `manifest.json`) |
| Circuits (in scope) | `circuits/withdraw.circom`, `circuits/ragequit.circom`, `circuits/lib/merkle.circom` | 112 + 49 + 37 lines | circom 2.1.9 source; built with `--O2`: **withdraw 11,432 constraints** (6 public, 85 private inputs), **ragequit 693** |
| Generated (review by equality) | `contracts/Groth16Verifier.sol`, `contracts/RagequitVerifier.sol` | snarkjs output | must be byte-identical to the export of the final zkey (ceremony transcript) |
| Out of scope | `contracts/MarginaliaTokenPool.sol` (ERC-20 variant), `contracts/mocks/` | | not part of the initial launch |
| Informational | `lib/marginalia.js`, `frontend/src/lib/zk.ts`, `services/magistrate/`, `scripts/governance/` | | clients and off-chain services; parity with the circuit is tested |

## 3. Entry points and roles
**MarginaliaPool:** `deposit(precommitment)` payable · `withdraw(Withdrawal, Proof)` · `ragequit(label, recipient, RagequitProof)` · guardian only: `setDepositsPaused`, `setMaxDepositAmount`, `transferGuardian` / `acceptGuardian` · views: `computeContext`, `isKnownRoot`, `getLastRoot`.
**MagistrateRegister:** Magistrate only: `publishRoot` (two overloads), `approveLabels`, `markRevoked` · owner only: `setMagistrate`, `setPool`, `transferOwnership` · views: `isValidRoot` (16-root history), `isApproved`, `isRevoked`.

| Role | Can | Cannot (by design) |
|---|---|---|
| Magistrate (hot key, service) | publish approved-label roots | move funds, pause, change roles; **cannot block ragequit** |
| Guardian (Safe 2-of-3) | pause **new deposits**, set a deposit cap | pause withdraw or ragequit |
| Owner of the register (Safe 2-of-3) | replace the Magistrate, authorise pools | publish roots |
| Relayer | submit a withdrawal for a fee bound in the proof | change recipient or fee, steal |

## 4. Properties we want you to try to break
**Contracts**
1. Conservation: pool balance = deposits − withdrawals − ragequits at all times; no path creates or destroys value.
2. A nullifier is spendable once; replay and a second exit door (withdraw *and* ragequit) are impossible.
3. `computeContext` binds recipient, relayer, fee, chain and pool; any change invalidates the proof (`InvalidContext`).
4. Checks-effects-interactions in `_send`; `nonReentrant`; griefing by a reverting recipient.
5. Root handling: `UnknownStateRoot`, `StaleAspRoot`, the 16-root history, behaviour when the Magistrate publishes bad data.
6. Access control on guardian / owner / Magistrate, the two-step guardian handover, and interaction of the pause with exits.
7. Tree capacity (`TreeFull`) and gas of the 20-level insert.

**Circuits and setup**
1. Under-constrained signals; soundness of `withdrawn + remaining = value` in the 128-bit range (`Num2Bits(128)`).
2. Nullifier binding to `(sk, rho)`; separation of the state tree and the ASP tree; behaviour at BN254 field edges and at `remaining = 0`.
3. `context` is only squared inside the circuit (intentional, bound on-chain): please confirm there is no exploitable gap.
4. Ragequit leaks nothing about `sk` / `rho` beyond the two public signals.
5. Setup procedure (`docs/ceremony_guide.md`, `docs/ceremony_b1_plan.md`): is the transcript verification sufficient? Are the mainnet guards in `scripts/ceremony/mainnet-guard.js` correct?

## 5. How to build and test (about 10 minutes)
```bash
git clone https://github.com/marginaliadev/marginalia && cd marginalia
git checkout <commit from docs/audit/manifest.json>
npm ci
npx hardhat compile
npx hardhat test                                   # whole suite, no .env, no network (about 5-6 minutes, 230+ tests)

# circuits (native circom 2.2.3 is what CI uses; see .github/workflows/ci.yml job "circuits-o2")
circom circuits/withdraw.circom --r1cs --wasm --O2 -l node_modules -o out
circom circuits/ragequit.circom --r1cs --wasm --O2 -l node_modules -o out
npx snarkjs r1cs info out/withdraw.r1cs            # expect 11432 constraints
npx snarkjs r1cs info out/ragequit.r1cs            # expect 693

node scripts/audit/manifest.js check               # hashes of everything in scope
node scripts/zk-hashes.js check                    # hashes of the proving assets the site serves
```
Static analysis: `slither . --hardhat-ignore-compile --filter-paths "node_modules|Groth16Verifier|RagequitVerifier|mocks|TokenPool"` (0 High / 0 Medium; see `slither_triage.md`).

## 6. Evidence we already have (internal, not a substitute for your audit)
| Evidence | Where |
|---|---|
| Adversarial on-chain tests: every admin call needs its role, forged and malleated proofs, front-running, replay, one exit door | `test/security_onchain.test.js` |
| Circuit mutation audit: every input and every Merkle path element mutated, 128-bit overflow, differential against the JS SDK | `test/circuit_audit.test.js` (31 tests) |
| Stateful fuzz with a shadow model (value conservation, nullifier single use, root consistency), 3 seeds x 28 random steps with real proofs | `test/invariant_fuzz.test.js` |
| Ceremony rehearsal: full chain, 9 kinds of transcript forgery rejected, a **real withdraw proof** under the ceremony key, rejection under the old dev key | `test/ceremony_rehearsal.test.js`, `scripts/ceremony/rehearsal.js`, CI job `circuits-o2` |
| Reproducible build checks | `test/reproducible_build.test.js` |
| Live testnet drills: deposit, approval, withdraw by wallet and by relayer, ragequit; 20 real relays; Safe governance on a real Safe; automated Magistrate publishing to IPFS | `docs/phase3_hardening_report.md`, `docs/live-test/`, `scripts/soak-check.js` |

## 7. Known limitations and honest findings (please read before you start)
| # | Item | Status |
|---|---|---|
| I-1 | **The proving keys currently deployed on testnet come from a single-party development setup.** Provenance of the older zkey cannot be proven against its source (the original ptau is gone). Irrelevant for testnet funds, **fatal for mainnet**. | closed only by the public ceremony; `mainnet-guard` blocks any mainnet deploy without ceremony transcripts |
| I-2 | The served `withdraw.wasm` was built with `--O1` (24,236 constraints) while the pinned build is `--O2` (11,432). The pin and a provenance test exist; the served artefacts are replaced after the ceremony. | open until redeploy |
| I-4 | Slither: 0 High / 0 Medium; Low: external Poseidon call inside the Merkle loop (3 sites, immutable hasher contracts, by design) | accepted, `slither_triage.md` |
| I-5 | `context` enters the circuit only squared | intentional, bound by the contract, tested |
| L | Privacy limits (anonymity-set size, timing, amounts, relayer visibility, front-end metadata) are listed in `../threat_model_and_audit_pack.md` | informational |
| T18 | Front end: CSP in place with `'unsafe-inline'` scripts (no nonce pipeline yet); proving assets are hash-pinned but served from the same origin | mitigated, documented |
| Gov | Registry/pool admin roles: guardian is the Safe; transfer of register ownership to the Safe is pending a pause drill | in progress |
| Off-chain | Magistrate screening (OFAC list, Chainalysis, denylist) is a policy layer; an outage stops publication (fail-closed). It can mislead *which labels count as approved* but cannot move funds | informational |

## 8. What we ask you to deliver
- A written report with severity-rated findings, proofs of concept where possible, and recommended fixes.
- A **fix-review round** on the changes we make (please include it in the quote).
- Explicit statements on: soundness of the circuit relations, completeness of the constraints for each public signal, and the trusted-setup procedure.
- Permission to publish the final report.

## 9. Logistics
- Please tell us your preferred channel for findings (private issue, encrypted email). Do **not** open public issues for vulnerabilities.
- Questions are welcome at any time; we answer within one business day.
- Expected timeline: kick-off, a first findings call at the end of week 1, report at 3-4 weeks. The circuits are frozen at the audit commit; we will not change in-scope files during the audit except to fix findings (tracked in `manifest.json`).
- Contact: `<project contact to be filled in before sending>`.

## 10. Index of this folder
`README.md` (scope, invariants, findings) · `circuit_notes.md` (signals, constraint breakdown) · `slither_triage.md` · `manifest.json` (hashes, tool versions, build flags) · `zk_assets.md` (served proving-asset hashes) · `../threat_model_and_audit_pack.md` · `../ceremony_guide.md` · `../ceremony_b1_plan.md` · `../mainnet_readiness.md`.
