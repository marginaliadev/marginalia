# Mainnet launch checklist

**Status 2026-10-11: NOT READY.** Run `node scripts/mainnet-preflight.js` for the live go / no-go (it must end with "GO" before anything below the line "Launch day" is executed).
This file is the single sequence to follow; the reasons behind each gate are in [`mainnet_readiness.md`](mainnet_readiness.md), the exact commands in [`redeploy_runbook.md`](redeploy_runbook.md), incidents in [`incident_response_runbook.md`](incident_response_runbook.md).

## 0. The rule
Nothing below is skipped, reordered or "accepted as a risk" to meet a date. Four gates protect other people's money and are enforced in code or by a third party:
1. a **public ceremony** (>= 15 independent contributors) so no one can forge proofs (`scripts/ceremony/mainnet-guard.js` refuses the deploy otherwise);
2. an **external audit** of contracts and circuits with a fix review;
3. a **verified Phase-1 file** (second independent hash);
4. a **Safe on hardware wallets** holding every admin role, with the pause drill done on mainnet.

## 1. Facts about the target chain (checked 2026-10-11)
| Item | Value | Source |
|---|---|---|
| Chain | Robinhood Chain, chainId **4663** (hex `0x1237`), native ETH | chainid.network; `eth_chainId` on `https://robinhood-rpc.publicnode.com` returned `0x1237` |
| Public RPCs | `https://rpc.mainnet.chain.robinhood.com` (official; did not answer from our network today), `https://robinhood-rpc.publicnode.com`, `https://robinhood.drpc.org` | chainid.network |
| Explorers | `https://robinhoodchain.blockscout.com`, `https://hoodscan.co`, `https://stonkscan.io` | chainid.network |
| Safe | confirm that Safe contracts and the Safe UI support 4663 before buying hardware wallets for signers (testnet 46630 is supported: `robinhood-testnet`; mainnet was listed in Safe's config as chain 4663) | `safe-config.safe.global` |
| Tooling | `hardhat.config.js` network `robinhood` (chainId 4663) exists; the front end is still wired to testnet constants (see section 5) | repo |

## 2. Before the ceremony (can start now)
- [ ] Send the audit request (`docs/outreach/audit_email.md`, bundle from `node scripts/audit/package.js`).
- [ ] Recruit the coordinator and 20 contributors (`docs/outreach/contributor_invite.md`, `docs/ceremony_b1_plan.md`).
- [ ] Second and third independent confirmation of the Phase-1 hash (`scripts/ceremony/phase1-check.js`).
- [ ] Legal review of the Magistrate policy, appeals and disclosure (R6).
- [ ] Choose a paid RPC with a backup, and the alert channel (R5).
- [ ] Safe: three hardware wallets, three different people, seed phrases backed up separately; decide who holds which.
- [ ] Mainnet keys (never reused from testnet): deployer, Magistrate publisher. Hardware wallet or a clean machine for the deployer.

## 3. Launch parameters to decide (proposals, not decisions)
| Parameter | Proposal | Why |
|---|---|---|
| Deposit cap (`setMaxDepositAmount`) | start small (for example 0.1 ETH per deposit) and raise it through the Safe after a clean week | limits the loss from any bug found after launch |
| Launch window | announced date, a weekday morning in the team's time zone, with all three signers reachable | pause and publisher rotation need two signatures |
| Announcement | "audited, ceremony of N contributors, mainnet beta with a deposit cap"; link `/ceremony` and the audit reports | honest claims only |
| Magistrate interval | 15 minutes (do not lower: the register keeps 16 roots) | gives users >= 4 h to use a proof |
| Relayer | funded wallet with an alert at 0.0005 ETH; fee policy as on testnet | the Courier turns itself off when low |

## 4. Launch day (only after the preflight says GO)
1. [ ] `node scripts/mainnet-preflight.js` -> **GO**. Archive its output.
2. [ ] Final tag on the audited, frozen commit; release with the ceremony artefacts and the audit reports.
3. [ ] Deploy to **testnet** with the final artefacts (runbook section 2); full E2E (`scripts/test-browser-e2e.js all`, `AUTO_MAGISTRATE=1`); a proof made with the old development key is **rejected**; soak at least 24 h.
4. [ ] Deploy to mainnet (runbook section 3) with `MAGISTRATE_ADDRESS=<publisher>`; record every address in `deployments/robinhood.json`.
5. [ ] Verify both verifiers on chain: `node scripts/ceremony/check-deployed-verifier.js ...` -> `executable code: MATCH`.
6. [ ] Move roles to the Safe (`transfer-roles.js`, dry run first); the Safe accepts the guardian role; **pause and resume drill on mainnet**.
7. [ ] Set the deposit cap through the Safe.
8. [ ] Start the Magistrate worker (own service, own key, two IPFS providers); wait for the first root.
9. [ ] Configure the web service for mainnet (section 5); deploy; `scripts/soak-check.js` against it.
10. [ ] Smoke test with your own funds, small amounts: deposit, approval, wallet withdraw, Courier withdraw, ragequit.
11. [ ] Announce.

## 5. Front end and services for mainnet
**Done (2026-10-11):** the front end now takes its chain from one place, `frontend/src/lib/chain.ts`. The default is the testnet and nothing changes for it; `NEXT_PUBLIC_CHAIN=mainnet` selects Robinhood Chain (4663: chainId, wallet-add parameters, public RPC fallback, explorer, `RH_MAINNET_RPC_URL`). There are **no mainnet defaults for the contract addresses**: a mainnet build needs `NEXT_PUBLIC_MARGINALIA_POOL_ADDRESS`, `NEXT_PUBLIC_MAGISTRATE_REGISTER_ADDRESS` and `NEXT_PUBLIC_POOL_DEPLOY_BLOCK`, otherwise `/api/folio` answers with a configuration error and the app refuses to send transactions ("Not Configured"). Tested in `test/chain_config.test.js`; a mainnet build was started and verified to report chainId 4663.

**Still to do before launch (copy and ops, not code risk):**
- Review the copy that changes with the chain: the footer says "Mainnet beta" and the landing card "Mainnet Beta" on a mainnet build; decide the final wording, and remove or rewrite the testnet-only statements ("Testnet Only", the roadmap line mentioning 46630).
- The Magistrate worker, `scripts/` (deploy, governance, soak-check, sync-folio) and the Hardhat network `robinhood` still read their chain from `deployments/<network>.json` and their own env; use the per-service variables in `.env.mainnet.example`.
- Update the live-test and soak scripts to take the chain from env before running them against mainnet.
**Do not change contracts or circuits for any of this.**

## 6. Monitoring from minute zero
- `scripts/soak-check.js` on a schedule (hourly) with an alert on non-zero exit.
- Alerts: publisher below 0.0005 ETH, relayer below 0.0005 ETH, no root published while deposits wait > 25 min, IPFS list unreachable, folio `stale`, CI red on `main`.
- A named person on call for the first 72 h, with the three signers' contact details in the incident runbook.

## 7. Rollback and incident
There is no upgrade path (immutable verifiers). If something is wrong: **pause deposits** through the Safe (withdraw and ragequit keep working), publish a status note, investigate; fix means a new deployment and migration, not a patch. Rotate the publisher with `rotate-magistrate.js` if its key leaks.

## 8. After launch
- [ ] 1 week clean: raise the deposit cap through the Safe.
- [ ] Publish the audit reports, the ceremony transcript and independent verification reports.
- [ ] Retire the testnet deployment from the main navigation, keep it as a public sandbox.
