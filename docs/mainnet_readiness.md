# Mainnet readiness: what is done, what blocks, who does it

Last updated 2026-10-10. Testnet only; **do not deploy mainnet** until every BLOCKER is closed. The deploy script already refuses chain 4663
without ceremony transcripts (`scripts/ceremony/mainnet-guard.js`).

## BLOCKERS (technical, cannot be waived)
| # | Gate | Status | Owner / how |
|---|---|---|---|
| B1 | Public Phase-2 ceremony, >= 15 independent contributors + public beacon (drand), transcript verified | not started (toolkit + rehearsal done) | project owner recruits; `docs/ceremony_guide.md` |
| B2 | Phase-1 file pinned in `docs/ceremony/phase1.json` (blake2b), checked against independent sources | `null` | owner, from the Hermez/PSE publication |
| B3 | Circuits rebuilt with the pinned `--O2` flag using native `circom` (the served `withdraw.wasm` is `--O1`) | blocked: needs permission to install native circom | owner approves; then rebuild + regenerate `zk-hashes` |
| B4 | External audit of contracts and of circuits, findings fixed, re-verified | not started | owner selects auditors; send `docs/audit/` + `manifest.json` |
| B5 | Redeploy verifiers + pool from the ceremony output; full E2E on the final zkey | after B1-B4 | engineering |
| B6 | Freeze: tag, final `manifest.json`, `audit:check` in CI | after B4 | engineering |

## REQUIRED before launch (operations)
| # | Item | Status |
|---|---|---|
| R1 | Safe 2-of-3 on mainnet with 3 hardware wallets; roles transferred; pause drill executed | testnet: Safe `0xE4F1…5765` is guardian; register ownership transfer pending a successful pause drill |
| R2 | Magistrate worker on its own service, own key, two IPFS providers, paid sanctions screening (Chainalysis KYT/TRM) | testnet worker running (Pinata proven; Filebase and Chainalysis not yet verified) |
| R3 | Soak 72 h on testnet with `scripts/soak-check.js` passing | running from 2026-10-10 11:00 UTC |
| R4 | Paid RPC with generous `eth_getLogs` + a backup (`RH_LOGS_RPC_URL`) on every service | public RPC works; not set on web services |
| R5 | Monitoring: alert webhook, relayer and publisher balance alerts | webhook not configured |
| R6 | Legal review of the Magistrate policy and the disclosure/appeals process | not started |
| R7 | Bug bounty / incident runbook rehearsed (`docs/incident_response_runbook.md`) | runbook written; drill of pause done only after R1 |

## DONE (evidence in repo)
Automated Magistrate with IPFS lists and append-only decision log (live); empirical Courier fee quote (20 relays, 18/18 covered); Safe governance scripts on a real
Safe; CSP + pinned proving-asset hashes; circuit audit (31 mutation tests), invariant fuzz, ceremony rehearsal, Slither triage, reproducible build checks.
