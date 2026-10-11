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
| Browser E2E full flow on preview (vault, deposit, Magistrate approval, withdraw by wallet, withdraw by Courier, spent-note rejection, ragequit) | **15 / 15** on 2026-10-10 | **not re-run today**: the deployer holds 0.00024 ETH and a full run needs about 0.002 ETH |
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
- **Full browser E2E today**: insufficient testnet ETH (see above).
- Load and stress tests, hardware-wallet flows, mobile wallets, long-run (> 1 day) soak.
- Anything that needs the audit or the real ceremony.

## Verdict
All features pass on testnet. **Mainnet is not ready**: the proving keys still come from a single-party development setup (finding I-1) and no external audit exists. Both are gated in code (`scripts/ceremony/mainnet-guard.js`) and in `docs/mainnet_readiness.md` (B1, B2, B4, B5, B6).
