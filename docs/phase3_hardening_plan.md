# MARGINALIA: Phase 03 "Hardening" Plan

**Status:** Mostly executed, see `docs/phase3_hardening_report.md` (code + tests for H1–H4 and H6 done; H5 stopped by the decision gate; the soak gate passed at 24 h and production deployment is live) · **Duration:** 3–4 weeks (2 developers) or 5–6 weeks (1 developer) · **Total:** ±28 person-days
**Predecessor:** Testnet Alpha (real browser app, relayer, vault, E2E, baseline security) · **Successor:** Phase 04 "Audit & Ceremony"

> Numbering: the roadmap on the web calls it "03 Hardening"; the older documents (`engineering_master_plan.md`, `tasks_and_test_matrix.md`) call it "Phase 2". The content is the same. This document is the detailed execution plan.

---

## 1. Goal, scope and out of scope

**Goal:** remove every remaining manual step and single point of failure before the code is frozen for audit.

| Problem in the Alpha (proven during live testing) | Solved by |
|---|---|
| Magistrate approval = a manual script + `git push` + waiting for the GitHub cache (a stale list makes withdrawals fail) | H1 + H2 |
| The label list depends on GitHub | H2 (IPFS) |
| One key (the deployer) holds Magistrate + guardian + owner | H3 (multisig) |
| Relayer balance 0 → the Courier fails silently; the fee quote is inaccurate | H4 |
| Deposit ≈ 930k gas, withdraw ≈ 1.10 million gas | H5 |
| Contract security tests exist only in a scratchpad, no CI | H6 |

**Out of scope:** the external audit and the ceremony (Phase 04), ERC-20/multi-asset (`MarginaliaTokenPool`), mainnet, circuit changes (do not change the circuit: the `zkey` and verifier must stay the same, so **no new ceremony is needed**).

## 2. Architecture decisions

| # | Decision | Reason |
|---|---|---|
| D1 | **No contract change for IPFS.** `publishRoot(root, data)` already accepts a string; fill it with `ipfs://<cid>`. The Supabase table `asp_roots.ipfs_cid` already exists | Reduces the audit surface |
| D2 | **Magistrate = a hot, rotatable "publisher" key; register Owner = a Safe multisig.** `setMagistrate()` by the owner already exists | A pure multisig does not suit automatic root publication every few minutes |
| D3 | **Order: H5 (pool redeploy) before H3 (role transfer).** Roles move to the final contract, once | Avoids two transfers and a gap in between |
| D4 | **Publish a root only when something changed, at least 15 minutes apart.** The register keeps only the last 16 roots (`ROOT_HISTORY_SIZE=16`); a 15-minute spacing → a window of ≥ 4 hours. Publishing every 5 minutes gives only an 80-minute window and expires users' proofs (`StaleAspRoot`) | The sliding window already exists in the contract |
| D5 | **Relayer top-up stays manual**, with an alarm. No high-value key on the web server | Principle of least privilege |
| D6 | **The gas target is set after a spike.** The old plan said deposit ≈ 220k, but that was never measured | See H5 (decision gate) |
| D7 | **The circuit and verifier are not touched** | No new ceremony; the audit focus stays narrow |

## 3. Measured baseline (testnet, as of 2026-10-09)

| Operation | Gas |
|---|---|
| deposit | 929,767 |
| withdraw (wallet) | 1,100,473 |
| ragequit | 348,556 |
| Cost of one full E2E run | ≈ 0.000045 ETH |
| Tests | 78 unit passing, browser E2E 14/14 |

## 4. Workstreams, tasks and tests

Estimates are in person-days (pd). Every task has acceptance criteria; tests have IDs so they can be traced in the matrix (section 6).

### H1: Automated Magistrate (6 pd)
A separate service `services/magistrate/` (a Railway worker), **not** part of the web server.

| ID | Task | Detail | pd |
|---|---|---|---|
| H1-T1 | Policy module | `policy.js`: denylist (file/URL), a plugin interface for external screening APIs. Default: denylist only. Every decision is written append-only to the `asp_decisions` table | 1 |
| H1-T2 | Deposit indexer | Read the `Deposited` event incrementally with a block cursor in the `magistrate_state` table (a new SQL migration). Use `RH_LOGS_RPC_URL` (a free RPC only allows 10 blocks) | 1 |
| H1-T3 | List builder | Approved labels = deposits that pass the policy, **except** those already ragequit. Build the ASP tree and compare it with `register.latestRoot()` | 0.5 |
| H1-T4 | Publisher | Pin to IPFS (H2) → `publishRoot(root, "ipfs://cid")`. Idempotent, handles nonce, gas bumps and retries. Publishes only when the root changed and ≥ 15 minutes since the last publication | 1.5 |
| H1-T5 | Scheduler | A `--loop` every 60 seconds (real work is limited by D4). A `--once` mode for CI | 0.5 |
| H1-T6 | Key management | A new `MAGISTRATE_PUBLISHER_KEY` (not the deployer), small balance. Registered through `setMagistrate` (before H3: by the deployer; after H3: by the Safe) | 0.5 |
| H1-T7 | Observability | `/health`, lag metrics, webhook alarms: lag > 30 minutes, publisher balance < threshold, 3 consecutive failures | 1 |

**Acceptance:** a new deposit appears in the list and the root is published ≤ 20 minutes later with no human action; no `git push`; stopping the process in the middle of a publication and starting it again creates neither a duplicate nor a lost label.

**Tests:**

| ID | Type | Scenario | Expected result |
|---|---|---|---|
| H1-TEST1 | Unit | Policy: denylist address → DENY; others → APPROVE; decisions recorded | Complete decision log |
| H1-TEST2 | Unit | The ASP tree from the service = the root accepted by the contract (compare with `lib/marginalia.js`) | Identical root |
| H1-TEST3 | Integration (hardhat) | Deposit → `--once` → root published → the client builds a withdraw proof and succeeds | Passes with no manual step |
| H1-TEST4 | Idempotency | Run `--once` twice in a row | Only one tx |
| H1-TEST5 | Policy | A deposit from a denylist address | Its label is not in the tree; withdraw is rejected; ragequit still works |
| H1-TEST6 | Ragequit | A ragequit deposit is removed from the next publication | The label is gone |
| H1-TEST7 | Root window | Publish 17 roots in a row (bypassing the cadence in the test) | A proof from the 1st root is rejected (`StaleAspRoot`); with the normal cadence it does not happen |
| H1-TEST8 | Crash | `kill -9` in the middle of a publication (after pin, before tx), then restart | Exactly one root published, nothing lost |
| H1-TEST9 | Testnet soak | 48 hours, a synthetic deposit every 30 minutes | 100% of deposits approved within ≤ 20 minutes, 0 false alarms |

### H2: Label list on IPFS (4 pd)

| ID | Task | Detail | pd |
|---|---|---|---|
| H2-T1 | Document format | JSON `{version, chainId, register, root, depth, labels[], generatedAt, prevCid}` | 0.5 |
| H2-T2 | Library `lib/aspStore.js` | `pin()`, `fetch(cid)` with multi-gateway fallback, and **verification**: recompute the root from `labels` = `root` in the document = the on-chain root | 1.5 |
| H2-T3 | Redundant pinning | Two providers (for example Pinata + web3.storage/Filebase); success if ≥ 1, alarm if only 1 | 0.5 |
| H2-T4 | Server integration | `frontend/src/lib/folio.ts`: source order = IPFS (CID from `rootData(latestRoot)`) → Supabase cache → GitHub (backup). The "prefer the latest root" logic stays | 1 |
| H2-T5 | Index | Fill `asp_roots` (root, ipfs_cid, label count, tx) | 0.5 |

**Acceptance:** a new root is visible in `/api/folio` ≤ 60 seconds after publication, without git; tampered content is rejected.

| ID | Type | Scenario | Result |
|---|---|---|---|
| H2-TEST1 | Integration | pin → fetch → verify the root | Matches |
| H2-TEST2 | Security | A document with labels added/removed, or a wrong root | Rejected, never served |
| H2-TEST3 | Resilience | Turn off one gateway/provider | Still served; the alarm fires |
| H2-TEST4 | Scale | 10,000 labels: document size, tree build time in the browser (target < 3 seconds), fetch time | Within budget |
| H2-TEST5 | E2E | Deposit in the UI → approved automatically → withdraw from the UI succeeds with no manual step | Passes |

### H3: Multisig and role separation (4 pd + 0.5 spike)

| ID | Task | Detail | pd |
|---|---|---|---|
| H3-T0 | **Spike: Safe availability on Robinhood Chain** | If the Safe is not deployed, fallback: deploy the Safe singleton ourselves, or a simple 2-of-3 multisig used in Phase 04 | 0.5 |
| H3-T1 | Role design | Register owner → Safe; Magistrate → the publisher key (H1); pool guardian → Safe (`transferGuardian` + `acceptGuardian`); the deployer holds nothing | 0.5 |
| H3-T2 | Governance scripts | `scripts/governance/`: `transfer-roles.js`, `rotate-magistrate.js`, `pause-deposits.js`. They produce Safe transactions, not send from an EOA | 1.5 |
| H3-T3 | Execution on testnet | Only **after the H5 redeploy** (D3). Document the Safe address and the signers | 0.5 |
| H3-T4 | Runbook | Update `docs/incident_response_runbook.md`: pause procedure, a leaked publisher key (the Safe calls `setMagistrate`), losing one signer | 1 |

**Acceptance:** no admin function can be called by a single EOA; publisher rotation from the Safe works while the H1 service is running, without disturbing deposits/withdrawals.

| ID | Type | Scenario | Result |
|---|---|---|---|
| H3-TEST1 | Contract | After the transfer: the deployer calls `setMagistrate`, `setPool`, `transferOwnership`, `setDepositsPaused`, `setMaxDepositAmount` | All revert |
| H3-TEST2 | Contract | The Safe calls the same functions | Succeeds |
| H3-TEST3 | Contract | The old publisher tries `publishRoot` after rotation | Reverts `NotMagistrate` |
| H3-TEST4 | Contract | The guardian (Safe) calls pause: deposits fail, **withdraw and ragequit keep working** | Matches the invariant |
| H3-TEST5 | Integration | Rotate the publisher in the middle of a running H1 service | The service recovers with the new key within ≤ 1 cycle |
| H3-TEST6 | Dry run | An incident exercise on testnet following the runbook, timed | Done in ≤ 30 minutes |

### H4: A healthy relayer and an accurate quote (3 pd)

| ID | Task | Detail | pd |
|---|---|---|---|
| H4-T1 | Accurate quote | Replace the fixed 1,150,000 gas with `estimateGas` of a sample withdraw (cached), plus a margin. A quote is valid for 120 seconds; a relay accepts a fee ≥ 90% of the current minimum (tolerance for gas-price movement) | 1 |
| H4-T2 | Balance health | `/api/status` shows `relayer.balanceEth` and `healthy`. Env `RELAYER_MIN_BALANCE_ETH`. `/api/relay/quote` returns `relayerAvailable=false` when low; the UI disables the Courier with an explanation | 0.75 |
| H4-T3 | Alarm | A webhook when the balance is low and when the failure ratio is high | 0.25 |
| H4-T4 | Abuse control | Nonce lock/queue for concurrent relays, a reasonable fee cap, a per-IP rate limit | 0.5 |
| H4-T5 | Profitability tracking | Record actual gas cost vs fee per relay in `relayer_jobs` | 0.5 |

| ID | Type | Scenario | Result |
|---|---|---|---|
| H4-TEST1 | Accuracy | 20 relays on testnet: actual cost vs fee | Fee ≥ cost on ≥ 95% of relays, average margin ≤ 25% |
| H4-TEST2 | Functional | Balance below the threshold | The Courier is disabled in the UI; wallet mode still works |
| H4-TEST3 | Concurrency | 5 simultaneous relays | No nonce conflict, all succeed or are rejected clearly |
| H4-TEST4 | Negative | A fee below the minimum / gas price ×3 after the quote | Rejected with a clear message; the relayer balance does not decrease |
| H4-TEST5 | UI | Browser test: Courier available vs disabled | As expected |

### H5: Gas optimisation (6 pd, with a decision gate)

| ID | Task | Detail | pd |
|---|---|---|---|
| H5-T1 | Benchmark harness | `test/gas_benchmark.test.js` prints a deposit/withdraw/ragequit table; keep the baseline in the repo | 0.5 |
| H5-T2 | **Spike (2 days, gate)** | Inline `PoseidonYul.sol` (T3 and T4). Measure the saving in `_insert` and the deposit. **If the saving is < 25%, stop** and record the result (D6) | 2 |
| H5-T3 | Differential fuzz | 10,000 random vectors: Yul = `circomlibjs` = the old on-chain hasher | 0.5 |
| H5-T4 | Pool v2 | Replace the external hasher calls in `_insert` and the commitment computation. Stays compatible with the circuit/verifier (unchanged). Also review storage writes per level | 2 |
| H5-T5 | Testnet redeploy | A new pool, the register stays (`setPool`). Update `deployments/*.json`, the frontend defaults, the Railway env and the Supabase migrations. Document the migration path for users of the old pool (ragequit/withdraw) | 1 |

**Target (re-set after the spike):** deposit ≤ 450k (−50%), withdraw ≤ 650k (−40%). An assumption, not proven.

| ID | Type | Scenario | Result |
|---|---|---|---|
| H5-TEST1 | Fuzz | Poseidon Yul vs the reference, 10,000 vectors | 100% identical |
| H5-TEST2 | Parity | After N=1..200 inserts, the `lib/marginalia.js` tree root = the on-chain root | Identical |
| H5-TEST3 | Regression | The whole 78 tests + invariants + `mainnet_guard` on pool v2 | Green |
| H5-TEST4 | Benchmark | A gas table v1 vs v2 | Meets the target, or a documented "stop" decision |
| H5-TEST5 | CI guard | Fail the build if gas > baseline + 2% | Active |
| H5-TEST6 | E2E | The whole browser E2E on pool v2 on testnet | 14/14 |

### H6: Integration, security and a release candidate (5 pd)

| ID | Task | Detail | pd |
|---|---|---|---|
| H6-T1 | Promote the security tests | Move the access-control and proof-manipulation tests (currently in a scratchpad) to `scripts/test-security-onchain.js` | 1 |
| H6-T2 | Update the E2E | Remove the manual approval step (now automatic from H1); the sweeper and ledger stay | 1 |
| H6-T3 | CI | GitHub Actions: hardhat test, `tsc`, lint, `npm audit --omit=dev`, the gas guard, secret scan | 1 |
| H6-T4 | 72-hour soak | Synthetic traffic every 15 minutes against the whole system | 0.5 (+ waiting time) |
| H6-T5 | Documents + freeze | Update the README, the web roadmap, the runbook, `threat_model_and_audit_pack.md`. Tag `v0.3.0-rc1` | 1.5 |

| ID | Type | Scenario | Result |
|---|---|---|---|
| H6-TEST1 | Security | 37 access-control/proof checks on the final contracts | 100% pass |
| H6-TEST2 | Soak | 72 hours, no ETH left behind (ledger), cost only gas | Z1/Z2 pass, 0 critical alarms |
| H6-TEST3 | Recovery | A crash drill (after deposit, after a partial withdraw, page reload) on the final system | All funds recover automatically |
| H6-TEST4 | Production | `scripts/test-browser-e2e.js` against https://marginaliazk.tech | Every step passes, including the Courier |

## 5. Schedule (2 developers; 1 developer ≈ 1.5×)

| Week | Work | End-of-week gate |
|---|---|---|
| **1** | H5-T1/T2/T3 (benchmark + spike) · H2-T1/T2/T3 · H3-T0 (Safe spike) · H4-T1/T2 | Gas go/no-go decision (D6); the Safe is available or a fallback is chosen |
| **2** | H1-T1…T5 · H5-T4 (pool v2) · H2-T4/T5 · H4-T3/T4/T5 | The automated Magistrate passes H1-TEST1…8 in hardhat |
| **3** | H5-T5 (redeploy) → **then** H3-T1…T4 · H1-T6/T7 on the new pool · H1-TEST9 (the 48-hour soak starts) | Roles are in the Safe; the service runs on pool v2 |
| **4** | All of H6 · the 72-hour soak · documents and freeze | **Release candidate `v0.3.0-rc1`** ready to hand to the audit |

**Critical path:** H5 spike → H5 redeploy → H3 role transfer → soak → freeze. H1/H2/H4 can run in parallel with H5.

## 6. Quality-gate matrix (must be green before the freeze)

| Gate | Criterion |
|---|---|
| Unit/contract | The whole hardhat suite (≥ 78 + new tests) green |
| On-chain security | H6-TEST1 100% |
| E2E | Browser E2E 14/14 on testnet **and** production |
| Automation | No manual step: deposit → approved → withdraw, verified by H1-TEST9 + H2-TEST5 |
| Governance | H3-TEST1…4 green; no single admin EOA |
| Gas | Does not exceed the v2 baseline (+2%) |
| Dependencies | `npm audit --omit=dev` = 0 in the root and the frontend |
| Funds | Z1/Z2 pass in every E2E run and the soak |

## 7. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The Safe does not exist on Robinhood Chain | H3 is blocked | The H3-T0 spike in week 1; fall back to our own multisig |
| The gas saving is far below 40% | The target is missed | The gate in H5-T2; stop if < 25%, document it |
| A stale label list or an exhausted root window | Withdrawals are rejected | D4 (cadence), "latest root preferred" (exists), a lag alarm |
| The IPFS provider is down | The list is unreadable | Redundant pins + multi-gateway fallback + a Supabase backup |
| The publisher key leaks | The list is misused | Least privilege, small balance, the Safe can rotate (`setMagistrate`) at any time |
| A free RPC limits `getLogs` to 10 blocks | A slow indexer | An incremental cursor + `RH_LOGS_RPC_URL`; consider a paid RPC |
| A pool redeploy splits addresses across places | Server/client out of sync | A deploy checklist; the client already refuses a server with a different pool ("Server Misconfigured") |
| The screening policy is inadequate for mainnet | Compliance risk | A plugin interface now; choose a provider before mainnet (outside Phase 03) |

## 8. Release and rollback

- Release order: H4 (safe, no contract) → H2+H1 (services, flag `MAGISTRATE_AUTO=on`) → H5 (pool v2) → H3 (roles).
- **Service rollback:** turn off the H1 worker; the old manual script still works; the server still has the GitHub backup.
- **Pool v2 rollback:** the old pool address stays recorded; the frontend supports changing the address through env; users of the old pool exit through ragequit/withdraw.
- No step is irreversible except the role transfer to the Safe, so do it last and only after the soak is green.

## 9. Definition of done (DoD)

1. Every gate in section 6 is green.
2. Tag `v0.3.0-rc1` and the audit pack (`threat_model_and_audit_pack.md`) updated.
3. The incident runbook has been rehearsed (H3-TEST6).
4. The README and the web roadmap state that Phase 03 is complete, with measured gas figures.
5. No single admin key, no manual step in the user flow.

## 10. Decisions needed from the project owner

1. **The IPFS provider** (Pinata / web3.storage / Filebase) and the budget.
2. **The three Safe signers** and who stores each key.
3. **The denylist source** (a public sanctions list or a paid provider).
4. **Who runs the Magistrate worker** and where (a Railway service separate from the web server).
5. **Approval of the gas target** after the week-1 spike.
6. **A paid RPC** for the indexer, or accepting the dependence on a public RPC.
