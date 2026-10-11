# MARGINALIA: Phase 03 "Hardening" Execution Report

**Date:** 2026-10-09 (updated 2026-10-11) · **Reference:** the internal Phase 03 plan (not published)
**Summary:** all *code and test* work for H1–H4 and H6 is done and passing; H5 was legitimately stopped by the decision gate. **Status update 2026-10-11:** the automated Magistrate, IPFS lists (Pinata), fee quote model, Safe guardian/owner roles, the full Safe pause and resume cycle (tx `0xd46822b8…98f6`), and the 24 h soak gate are done and live on testnet (see `docs/mainnet_readiness.md`). Still open: a second IPFS provider and paid screening verified with real credentials, and the decisions listed in section 4.

## 1. Test results

| Suite | How to run | Result |
|---|---|---|
| Whole hardhat suite (without `.env`, as in CI) | `npx hardhat test` | **141 passing** (previously 78); 249/250 on 2026-10-11, see `docs/test_report_2026-10-11.md` |
| Contract security (21 tests, specific errors) | `test/security_onchain.test.js` | 21/21 |
| Gas regression guard | `test/gas_benchmark.test.js` | passing (baseline 944,941 / 1,067,838 / 321,308) |
| Magistrate service (14 tests) | `test/magistrate_service.test.js` | 14/14 |
| IPFS storage (10 tests) | `test/asp_store.test.js` | 10/10 |
| Bulk Merkle tree = one-by-one insert | `test/merkle_bulk.test.js` | 13/13 |
| Browser SDK (TypeScript) parity with the Node SDK | `test/browser_sdk_parity.test.js` | 4/4 |
| Relayer health, fee policy, webhook | `scripts/test-relayer-health.js` | 14/14 |
| Governance with a **real Safe v1.4.1** on testnet | `scripts/test-governance.js` | 15/15 |
| Full browser E2E, **automated Magistrate**, staging deployment on testnet | `AUTO_MAGISTRATE=1 DEPLOYMENT_FILE=notes/staging-deployment.json node scripts/test-browser-e2e.js` | 15/15 (two runs; cost ≈ 0.00006 ETH gas) |

## 2. Per workstream

### H1: Automated Magistrate ✔ (code + tests + live)
- `services/magistrate/` (denylist policy, atomic store + append-only audit log, service, CLI with health endpoint, single-instance lock, webhook alarms).
- Proven: idempotent, rate limited (3 simulated hours → 12 publications, the oldest root stays valid), negative control (without the limit, 18 publications exhaust the 16-root window), a crash between pin and publish yields the same CID, losing the state changes nothing, ragequit deposits and later-added denylist addresses drop out of the next list, only the Magistrate key can publish.
- On testnet: a deposit from the UI → the list is published automatically in **22–67 seconds** with no manual step (7 s and 41 s on production runs of 2026-10-11).
- **Soak (H1-TEST9) passed at the 24 h gate (owner's decision 2026-10-11, 11/11 checks, 25.2 h); the worker runs on Railway.** Traffic was low (5 deposits, 2 roots in the window), so long-run behaviour has been exercised only lightly.
- **Added later:** `SupabaseStore` (state, verdicts, *append-only* log, `asp_roots` index) + migration `supabase/migrations/20261009000000_phase3_magistrate.sql` + `scripts/supabase-check.js` (8 tests). **The migration has been applied** to the Supabase project (2026-10-09): `node scripts/supabase-check.js` reports "Schema is complete"; the `SupabaseStore` round trip, the `asp_roots` provenance columns and RLS (anon rejected on the service tables) were verified live.

### H2: IPFS ✔ (code + tests), partly verified with real providers
- `lib/aspStore.js` (pin to several providers, fetch with multi-gateway fallback, on-chain root verification), the server-side reader `frontend/src/lib/aspStore.ts`, and `folio.ts` uses the CID from `rootData(latestRoot)` as its first source.
- No contract change needed (the `data` string already exists).
- Integrity does not depend on any gateway: documents with extra labels, another consistent set, a wrong version, duplicates, non-decimal numbers and CID traversal are all rejected.
- **Scale finding:** building a 10,000-label tree took **21 seconds** → replaced by level-by-level bulk construction: **1.3 seconds** (Node), bit-for-bit identical to inserting one by one (12 cases, including paths).
- **Target missed:** the browser SDK (plain JS) needs **4.6 seconds** for 10,000 leaves against a plan target of 3 seconds. Irrelevant at the current scale (tens of leaves); fix path if the list grows beyond ±5,000: an IndexedDB layer cache and inserting only the new leaves.
- **Verified with real credentials:** Pinata (the worker pinned and the list was fetched back from the Pinata gateway; the root matched). **Not yet verified:** Filebase (second provider). Public gateways (`ipfs.io`, `dweb.link`) rate-limit freshly pinned CIDs, so the default gateway list now starts with the Pinata gateway.

### H3: Multisig ✔ on staging and on live testnet (roles)
- Safe v1.4.1 is **deployed** on Robinhood Testnet (spike H3-T0: the biggest risk is gone).
- `scripts/governance/` (`transfer-roles.js` with a built-in dry run and precondition checks, `rotate-magistrate.js`, `pause-deposits.js`).
- Proven with a real 2-of-3 Safe: the deployer loses all 8 admin functions with specific errors (`NotOwner` / `NotMagistrate` / `NotGuardian`); one signature is rejected; rotation takes 1.6 s; the old publisher gets `NotMagistrate`; pause takes 1.4 s, deposits are rejected while **ragequit keeps working**; the script refuses publisher = deployer, a threshold-1 Safe, and a Safe that contains the deployer.
- **Live (2026-10-11):** Safe `0xE4F1CE7C30753a9aF8125d53A1c35DE172635765` (3 owners, threshold 2) is the pool guardian and the register owner; the pause drill was executed through the Safe (tx `0xb0d11f06…6def`, deposits refused with `DepositsPaused`); the resume transaction was executed through the Safe (tx `0xd46822b8…98f6` at block 133081913, `setDepositsPaused(false)`), reopening deposits (`depositsPaused = false`). Production E2E Phase L passed 7/7.

### H4: Healthy relayer ✔
- Balance/health in `/api/status`, the Courier is switched off automatically (UI + API 503) below `RELAYER_MIN_BALANCE_ETH`, webhook alarm at most once per 10 minutes, 90% fee tolerance and a fee cap of 50% of the value, relays are serialised (one nonce), actual gas cost vs fee is recorded.
- Real data: fee 25.3 µETH vs gas cost ≈ 10.8 µETH; the relayer balance **rose** after relaying.
- **Added later:** the quote is now empirical (90th percentile of real relay gas + headroom; a measured constant until 3 samples exist) and at relay time `eth_estimateGas` of the actual transaction must be covered by the fee (6 gas-model tests); gas cost vs fee is recorded in `relayer_jobs`.
- **H4-TEST1 measured (2026-10-10, preview `marginalia-dev`, `scripts/relay-samples.js`):** 18 real relays without failure + 2 from E2E = 20 samples. Gas used min 1,038,093 / p50 1,048,245 / p90 1,053,303 / max 1,058,361. The quote moved from the 1,150,000 constant to the empirical 1,111,292 (1.055× the actual p90). The fee covered the cost in 18/18 relays (net margin 1.6e12 to 2.2e12 wei). Note: at a gas price of 0.01 gwei the cost per relay is only ~1e13 wei, so accuracy under gas-price spikes still has to be monitored (see risk 5).
- **The `asp_decisions` append-only trigger was tested live (2026-10-10):** a real Magistrate worker (staging deployment, `MAGISTRATE_STORE=supabase`) wrote 4 rows; `UPDATE` and `DELETE` by the service role were rejected by the trigger ("asp_decisions is append-only") and the row was unchanged.

### H5: Gas optimisation: **stopped by the decision gate** (as planned)
- Spike: assembly Poseidon (`poseidon-solidity`) is **bit-identical but not cheaper**: T3 +4.5%, T4 +75% more expensive than the current circomlibjs hasher. 20 T3 hashes = 644k of the 930k deposit gas; the old claim "deposit ≈ 220k" was not substantiated.
- No contract change, so **no redeploy and no new ceremony**. The spike artefacts were removed from the repo so the audit surface does not grow; the gas regression guard was kept.
- A small opportunity that was not pursued (≈ 4%): `zeros` as code constants instead of `SLOAD`. On this chain gas is very cheap (0.01 gwei), so it was not chased.

### H6: Integration ✔
- Contract security tests moved into CI (21 tests, specific errors), CI updated (Node 22, frontend job, production audit, secret scan), E2E supports the automated Magistrate and alternative deployments, the incident runbook was updated (governance model, rotation, pause).
- Soak passed at the 24 h gate; tag `v0.3.0-rc1` created (2026-10-11).

## 3. Findings and corrections along the way
1. Decision D6 proved right: the H5 gate saved about 1 week of work.
2. Building the tree in `O(20n)` was a real bottleneck, now `O(2n)`.
3. Some of my own tests were too loose (they only checked "revert"); tightened to specific errors.
4. The public RPC reads a balance one block late; the E2E test now polls the balance delta instead of assuming the Courier is broken (the Courier was shown to work on chain).
5. The relayer fee does not necessarily cover the cost if the gas price jumps by more than 10% between quote and relay (the 90% tolerance is accepted); safe at this scale, to be monitored through the `[relay] ... net=` log.

## 3b. Owner decisions (accepted 2026-10-09) and their follow-up

| Decision | Follow-up in code/docs |
|---|---|
| Safe **2-of-3**, three keys on different hardware wallets; a separate publisher key that may only publish | Implemented as designed and tested (15/15). The official Safe v1.4.1 is available on chain 46630 (checked in H3-T0). |
| IPFS: **Pinata + Filebase** | Configuration documented (`PINATA_JWT`, `IPFS_RPC_URL`+`IPFS_RPC_AUTH`); both use the same pinner code as the tests. Pinata verified with real credentials; Filebase not yet. |
| Denylist: public sources first, paid ones before mainnet | Built: OFAC policy (the real 120-address list loaded), Chainalysis free API, manual list; fail-closed composition; 10 new tests. |
| Daily reviewer; override through the Safe; appeals process on the Compliance page | A "Screening policy & appeals" section was added to `/compliance`. An override through the Safe is a policy, not yet enforced technically. |
| Worker on Railway, automatic restart, paid RPC + backup | `services/magistrate/railway.json` (restart ALWAYS); `RH_LOGS_RPC_URL` accepts several URLs with automatic failover. |
| Deploy to production through staging first | Done: preview (`dev`) then production (`main`). |
| Wrong `canonical` / `og:url` metadata | Fixed (see 3c). |

## 3c. SEO / link-preview findings from the site check
- `canonical` and `og:url` pointed to the old Railway domain; they now use `https://marginaliazk.tech` (overridable with `NEXT_PUBLIC_SITE_URL`).
- **A bigger bug:** every page had `canonical` set to `/` (telling search engines to treat `/app`, `/explorer`, and so on as duplicates of the home page). Canonicals are now per page.
- **The OG image never existed:** `/images/marginalia-hero.webp` returned 404 on the live site, so link previews on X had no image. Replaced by generated images (`opengraph-image` / `twitter-image`, PNG 1200x630) attached to every page.
- Page titles use the template `"%s | MARGINALIA"`; the 404 page is `noindex`.

## 4. Decisions still needed from the project owner
1. A second IPFS provider (Filebase) and the Chainalysis key verified with real credentials, and a paid RPC with a backup.
2. The name of the **daily reviewer** for screening decisions.
3. The alert webhook URL.
4. ~~Execute the pending *resume* transaction on the Safe so deposits reopen.~~ **Done (2026-10-11):** executed via Safe tx `0xd46822b8…98f6` at block 133081913; deposits reopened and verified live (production E2E Phase L 7/7).

## 5. Next steps
See `docs/mainnet_readiness.md` and `docs/mainnet_launch_checklist.md`. The remaining gates (external audit, public ceremony, redeploy) are tracked there; Phase 03 itself has no further code work.
