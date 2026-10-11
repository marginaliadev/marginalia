# Test report, 2026-10-11 (testnet; commit `dev` after PR #2)

Scope: every shipped feature, the automated suite, the live site (production and preview) and the operational checks. **This report covers testnet only.**

## Result at a glance
| Area | Result | Evidence |
|---|---|---|
| Automated suite (`npx hardhat test`) | **249 / 250 pass** | 1 timing test failed under load (8.8 s vs an 8 s budget) while the frontend build ran concurrently; **it passes in isolation (4.9 s)** |
| Frontend type-check and production build | pass | `tsc --noEmit` clean, `next build` compiled |
| Relayer health / fee policy script | **14 / 14** | one expectation was stale (it assumed no relay samples) and was corrected |
| Supabase schema | complete | `node scripts/supabase-check.js`; append-only trigger blocks UPDATE and DELETE (live test) |
| Production API (24 checks) | **pass** | status, folio, ASP root equals on-chain root, quote, nullifier and note validation, disclosure, relay input rejection, rate limiter, CSP/HSTS |
| Production pages (44 checks) | **43 pass, 1 real bug found and fixed** | see Finding 1 |
| Browser E2E phase L on production (deposit, ragequit, double ragequit rejected, CSP) | **7 / 7** | 0 ETH stranded, cost only gas |
| Browser E2E full flow on **production** with scaled-down amounts (vault, 2 deposits, automated Magistrate approval, withdraw by wallet, withdraw by Courier, spent-note rejection, ragequit, double ragequit rejected) | **every step passed, but not in one run** | run 1 (0.00012 / 0.00008 ETH): B1-B7 pass except B2B (the test wallet was under-funded, a test artefact) so B8/B9 could not run; run 3 (0.00006 / 0.00004 ETH): B1-B5, B7-B9 pass, B6 refused by the fee-share guard because the change note (0.00003 ETH) was too small for a Courier fee (about 0.0000243 ETH) = the guard working as designed. B6 itself passed in run 1 (change note 0.00006 ETH, recipient +0.0000357 ETH). Approval by the Railway worker took 7 s and 41 s. Last single-run 15/15: preview, 2026-10-10 |
| Real Courier relays (fee quote) | 20 relays, 0 failures; fee covered the cost in 18 / 18 measured | `docs/phase3_hardening_report.md` |
| Soak (`scripts/soak-check.js`, 24 h gate) | **11 / 11** | 25.2 h; low traffic (5 deposits, 2 roots) |
| CI on `main` | green | after PR #2 |
| Circuits `--O2` native build and ceremony rehearsal with a real proof | pass | CI job `circuits-o2` |

## Findings of this round
1. **Explorer (Wax Seal verifier) reported "UNSPENT" for invalid input and for API failures** (EX-04). On an error response `data.isSpent` was `undefined` and the UI printed "WAX SEAL INTACT (UNSPENT)": false reassurance. **Fixed**: only an explicit on-chain boolean produces a status; errors show an alert (`#sealError`). Verified locally (EX-04 pass); reaches production with the next merge.
2. Explorer showed "Magistrate ASP Active Roots: 2 / 2" (a hard-coded denominator). **Fixed**: shows the number of published roots.
3. `scripts/test-relayer-health.js` assumed an empty relay history; with live Supabase samples the quote is "observed". **Fixed** (accepts default below 3 samples, observed otherwise).
4. One performance test is sensitive to machine load (10,000-leaf tree build budget 8 s). Left as is; passes alone.

## Not tested (and why)
- **Anything on mainnet**: not deployed; guarded.
- **Safe pause/resume drill on the live Safe** and the register ownership transfer: waiting for two owner signatures.
- **Filebase (second IPFS pin), Chainalysis screening, alert webhook**: no credentials yet.
- **A single clean 15/15 run on production today**: the deployer holds about 0.00013 ETH after the runs above; a full-size run needs about 0.002 ETH from a faucet.
- Load and stress tests, hardware-wallet flows, mobile wallets, long-run (> 1 day) soak.
- Anything that needs the audit or the real ceremony.

## Verdict
All features pass on testnet. **Mainnet is not ready**: the proving keys still come from a single-party development setup (finding I-1) and no external audit exists. Both are gated in code (`scripts/ceremony/mainnet-guard.js`) and in `docs/mainnet_readiness.md` (B1, B2, B4, B5, B6).
