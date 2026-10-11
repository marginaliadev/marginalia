# Mainnet readiness: what is done, what blocks, who does it

Last updated 2026-10-10. Testnet only; **do not deploy mainnet** until every BLOCKER is closed. The deploy script already refuses chain 4663
without ceremony transcripts (`scripts/ceremony/mainnet-guard.js`).

> Live go / no-go: `node scripts/mainnet-preflight.js` (read-only). The step-by-step sequence for the day itself is [`mainnet_launch_checklist.md`](mainnet_launch_checklist.md); env variables per service are in `.env.mainnet.example`.

## BLOCKERS (technical, cannot be waived)
| # | Gate | Status | Owner / how |
|---|---|---|---|
| B1 | Public Phase-2 ceremony, >= 15 independent contributors + public beacon (drand), transcript verified | not started (toolkit + rehearsal done) | project owner recruits; `docs/ceremony_guide.md` |
| B2 | Phase-1 file pinned in `docs/ceremony/phase1.json` (blake2b), checked against independent sources | **provisional (2026-10-11):** `powersOfTau28_hez_final_15.ptau` (37,831,832 bytes) downloaded from circom.info; blake2b-512 `982372c8…ae6e` equals the hash published in the snarkjs README, and `snarkjs powersoftau verify` passes (54 contributions + beacon, 2^10). **Still needed:** at least two more independent publications of the same hash before the real ceremony |
| B3 | Circuits rebuilt with the pinned `--O2` flag using native `circom` | **partly done (2026-10-10):** native circom v2.2.3 (checksum verified against the release digest) builds withdraw = 11,432 and ragequit = 693 constraints; the ceremony rehearsal now proves a **real withdraw proof under the ceremony key (6/6 PASS, no SKIP)**; CI job `circuits-o2` repeats it. **Not done:** the artifacts served by the site are still the `--O1`/dev-setup files; replacing them needs a new zkey, a new verifier and a pool redeploy, which belongs to B5 (after the real ceremony) |
| B4 | External audit of contracts and of circuits, findings fixed, re-verified | not started | owner selects auditors; send `docs/audit/` + `manifest.json` |
| B5 | Redeploy verifiers + pool from the ceremony output; full E2E on the final zkey | after B1-B4 | engineering |
| B6 | Freeze: tag, final `manifest.json`, `audit:check` in CI | after B4 | engineering |

## REQUIRED before launch (operations)
| # | Item | Status |
|---|---|---|
| R1 | Safe 2-of-3 on mainnet with 3 hardware wallets; roles transferred; pause drill executed | **testnet done (2026-10-11):** Safe `0xE4F1CE7C30753a9aF8125d53A1c35DE172635765` (3 owners, threshold 2) is guardian (tx `0xc0df25ca…a013e`) and **owner of the register** (tx `0x57c2d98b…d686`); the pause was executed through the Safe (tx `0xb0d11f06…6def`) and deposits were refused with `DepositsPaused`; the **RESUME was executed through the Safe** (tx `0xd46822b8…98f6` at block 133081913, sent by `0x8694…4Aea`) setting `depositsPaused = false`; production E2E phase L verified (7/7 pass); deployer EOA has no admin power left. Mainnet needs its own Safe, hardware wallets and a repeat of the drill |
| R2 | Magistrate worker on its own service, own key, two IPFS providers, paid sanctions screening (Chainalysis KYT/TRM) | testnet worker running (Pinata proven; Filebase and Chainalysis not yet verified) |
| R3 | Soak on testnet with `scripts/soak-check.js` | **passed at the 24 h gate (owner's decision 2026-10-11, shortened from 48/72 h):** 25.2 h elapsed since 2026-10-10 11:00 UTC, 11/11 checks pass (worst publish lag 0.7 min, IPFS list equals the on-chain root, folio not stale, 20 observed relay samples, 66 decision rows). Honest limits: low traffic (5 deposits, 2 roots in the window), so the rate-limit and long-run behaviour are only lightly exercised; keep the checker running until mainnet |
| R4 | Paid RPC with generous `eth_getLogs` + a backup (`RH_LOGS_RPC_URL`) on every service | public RPC works; not set on web services |
| R5 | Monitoring: alert webhook, relayer and publisher balance alerts | webhook not configured |
| R6 | Legal review of the Magistrate policy and the disclosure/appeals process | not started |
| R7 | Bug bounty / incident runbook rehearsed (`docs/incident_response_runbook.md`) | runbook written; full pause and resume cycle drill completed on testnet Safe |

## DONE (evidence in repo)
Automated Magistrate with IPFS lists and append-only decision log (live); empirical Courier fee quote (20 relays, 18/18 covered); Safe governance scripts on a real
Safe; CSP + pinned proving-asset hashes; circuit audit (31 mutation tests), invariant fuzz, ceremony rehearsal, Slither triage, reproducible build checks.
