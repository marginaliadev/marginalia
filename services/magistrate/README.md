# Automated Magistrate

Screens deposits, builds the approved-label list, pins it to IPFS and publishes its Merkle root on-chain
(`register.publishRoot(root, "ipfs://<cid>")`). Replaces the manual `scripts/magistrate-approve.js` + `git push` flow.

```bash
npm run magistrate:once      # one cycle, exits (CI / cron)
npm run magistrate           # loop with health endpoint
node services/magistrate/index.js --status
node services/magistrate/dev-ipfs.js   # local IPFS stand-in for development drills
```

## Environment
| Variable | Meaning |
|---|---|
| `MAGISTRATE_PUBLISHER_KEY` | **Dedicated** hot key that is the register's Magistrate. Never the deployer. Holds ~0.001 ETH. |
| `RH_TESTNET_RPC_URL`, `RH_LOGS_RPC_URL`, `RH_LOG_CHUNK` | RPC; free tiers allow only 10-block log ranges, so point `RH_LOGS_RPC_URL` at an RPC that allows large ranges. |
| `PINATA_JWT` and/or `IPFS_RPC_URL` (+`IPFS_RPC_AUTH`) | Pinning providers. Configure **two**; the worker alarms when only one pinned. |
| `DENYLIST`, `DENYLIST_FILE`, `DENYLIST_URL` | Screening policy (depositor addresses to refuse). A configured but unreachable URL fails closed. |
| `MAGISTRATE_MIN_INTERVAL_MIN` (15) | Minimum minutes between roots. The register keeps only the last 16 roots: 15 min gives users >= 4 h to use a proof. Do not lower it in production. |
| `MAGISTRATE_TICK_SEC` (60), `MAGISTRATE_LAG_ALERT_MIN` (30), `MAGISTRATE_MIN_BALANCE_ETH` (0.0005) | Cadence and alarms. |
| `MAGISTRATE_STATE_FILE`, `MAGISTRATE_HEALTH_PORT` (8081), `DEPLOYMENT_FILE`, `ALERT_WEBHOOK_URL`, `ASP_IPFS_GATEWAYS` | Paths, health, alerts, gateways used for the post-publish retrievability check. |

## Decisions taken (owner, 2026-10-09)
- **Safe 2-of-3** (not 3-of-3: one lost key must not lock the roles forever). Signers: owner, developer, one trusted outsider, each on a **different hardware wallet**.
- The Magistrate **publisher key is a separate hot key** with publish permission only; the Safe owns the register and can replace it (`scripts/governance/rotate-magistrate.js`).
- **IPFS: Pinata (primary) + Filebase (backup).** Two different providers; two credentials from one provider fail together.
  `PINATA_JWT=...` and `IPFS_RPC_URL=https://rpc.filebase.io` + `IPFS_RPC_AUTH="Bearer <filebase IPFS RPC key>"` (Filebase speaks the Kubo RPC; confirm the endpoint in Filebase's docs, the code path is the same one exercised by the tests).
  Consumers never trust a provider: every list is verified against the root published on-chain.
- **Screening: free public sources now, paid later.** Built in: OFAC public list (default on), Chainalysis free sanctions API (`CHAINALYSIS_API_KEY`), and a manual list of known exploit addresses (`DENYLIST`, `DENYLIST_FILE`, `DENYLIST_URL`).
  Any DENY wins; any screening outage stops publication (fail closed). Before mainnet add a paid provider (TRM / Chainalysis KYT) by implementing `screenAll(deposits)` (see `policy.js`).
  Reviewer: one named person checks the decision log daily. Overrides (approve a denied deposit / revoke an approved one) are a **policy** that requires the Safe (2-of-3); the code does not yet enforce it technically (documented on the Compliance page).
- **Railway**: separate service, own env and own key, restart policy ALWAYS (`services/magistrate/railway.json`).
  RPC: a paid provider with generous `eth_getLogs` for chain 46630 (check Alchemy / QuickNode / dRPC support) plus a fallback: `RH_LOGS_RPC_URL=https://primary,https://backup` (comma separated, automatic failover).

## Guarantees (all tested in `test/magistrate_service.test.js`)
idempotent (no change -> no tx) · rate limited · deterministic documents (same set -> same CID) · crash safe (state lost -> rebuilt from chain,
no duplicate) · ragequit deposits and later-denylisted depositors drop out of the next list · every decision change is appended to
`<state>.decisions.jsonl` · a second instance is refused (lock file) · only the Magistrate key can publish.

## Deploying (Railway)
Separate service from the web app. Start command `npm run magistrate`, a persistent volume for `MAGISTRATE_STATE_FILE` (optional: without
it the worker rescans from `deployBlock`), the variables above. The web app needs no change: it reads the CID from `rootData(latestRoot)`
and verifies the downloaded list against the on-chain root, so a wrong gateway can never mislead it.
