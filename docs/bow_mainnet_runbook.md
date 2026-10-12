# Mainnet runbook for the 0xbow core (chain 4663)

**Status:** prepared, NOT executed. Nothing in this repository deploys to mainnet by itself: `scripts/bow/deploy.js --network mainnet` sends
nothing unless every gate of `scripts/bow/preflight.js` (except D1, the record it produces) is green AND the owner sets `CONFIRM=deploy-bow-mainnet`.
Follow the order. If a step fails, stop and read the "rollback" column; do not improvise on a live pool.

## 0. What the owner must prepare (nothing below can be done by engineering)

| # | Item | Why | How it is checked |
|---|---|---|---|
| 1 | **Mainnet Safe**, at least 3 owners on separate hardware wallets, threshold 2 | it will hold OWNER_ROLE: windDown, upgrade, registerPool, withdrawFees | `MAINNET_SAFE` -> gate R1 reads owners and threshold from chain |
| 2 | **Publisher key** (the future ASP postman): a new key on its own machine or KMS, funded about 0.001 ETH, never the deployer, never a testnet key | it only calls `updateRoot`; if it leaks the damage is censorship, not theft | `MAINNET_PUBLISHER` -> gate R2 |
| 3 | **Deployer key**: a new key on a hardware wallet or clean machine, funded at least 0.05 ETH (`MIN_DEPLOYER_ETH`), NOT a Safe owner, NOT the publisher | it deploys and then loses every role | `MAINNET_DEPLOYER`, `MAINNET_DEPLOYER_PRIVATE_KEY` -> gate R3 |
| 4 | **Relayer key** (Courier hot wallet), separate again, funded for gas, alert at 0.0005 ETH | pays gas for `relay` | `RELAYER_PRIVATE_KEY` in the web service only |
| 5 | **Paid RPC plus a backup**, and a log-capable RPC (`RH_LOGS_RPC_URL`) | free tiers limit `eth_getLogs` to 10 blocks | gate N1 |
| 6 | **Second IPFS provider** (Filebase) and **Chainalysis** key, **alert webhook** | redundancy of the approved list; screening beyond OFAC; alarms | sign-off S7 |
| 7 | **External reviewer** for glue code, configuration and the post-audit delta (email draft: `docs/outreach/audit_quote_request_bow_scope.md`) | the waiver covers circuits and verifiers only | sign-off S1 |
| 8 | **Independent check of the upstream ceremony figures** (Phase-1 base, contributor count) by someone who is not us | the two public sources disagree; the transcript is not in the upstream repository | sign-off S2 |
| 9 | **Owner decision signed** (`docs/bow_migration.md` section 5) including the **TVL number** at which a timelock will be installed | upgradeable entrypoint, no cap, no pause, windDown permanent | sign-off S3 |
| 10 | **Legal review** of the screening policy, the appeals process and the public wording | amounts are public; no cap; windDown is permanent | sign-off S8 |
| 11 | **Launch limits**: soft cap in the UI and relayer, size of the first deposits, launch window, a named person who watches the alerts | the contract has no cap | sign-off S9 |
| 12 | **Linux CI run** of the upstream suite: push the branch so `.github/workflows/bow.yml` runs; keep the run URL | Windows cannot give this evidence | sign-off S4 |
| 13 | **Incident drill** on the new deployment (windDown on a throwaway pool, postman rotation, relayer off) | windDown is permanent, so rehearse it on a throwaway pool, never on the live one | sign-off S6 |

Sign-offs are recorded in `docs/bow/signoff.json` (template: `docs/bow/signoff.example.json`); each needs `by`, `date` and `evidence`.

## 1. Before the deploy (engineering)

1. `git checkout` the release commit; the working tree must be clean.
2. `node scripts/vendor/0xbow.js verify --upstream` -> empty diff against `v1.2.1`; `node scripts/vendor/0xbow.js vkey` -> verifier constants equal the ceremony keys.
3. Build the contracts **from a pristine clone of the tag** on Linux (`forge build`, upstream profile) and keep the `out` directory: the post-deploy bytecode check compares the chain to it.
4. `node scripts/vendor/0xbow.js fetch --out frontend/public/zk-bow --hashes-ts frontend/src/lib/zk-hashes-bow.ts` -> the proving assets equal the pinned hashes.
5. Set the mainnet environment (`.env.mainnet.example`, comments only) on the operator machine: `MAINNET_RPC`, `MAINNET_SAFE`, `MAINNET_PUBLISHER`, `MAINNET_DEPLOYER`, `MAINNET_DEPLOYER_PRIVATE_KEY`.
6. `node scripts/bow/preflight.js --ignore D1` -> everything else must be GO.

## 2. Deploy (owner orders it; two people present)

```bash
# dry run: runs the preflight, prints the verdict, sends nothing
node scripts/bow/deploy.js --artifacts <forge out> --network mainnet
# real deploy (only after the dry run says every gate is green)
CONFIRM=deploy-bow-mainnet node scripts/bow/deploy.js --artifacts <forge out> --network mainnet
```

Pool parameters on mainnet: `minimumDepositAmount` 0.001 ETH (change with `--min-deposit`), `vettingFeeBPS` 0 (enforced), `maxRelayFeeBPS` 100.
The script writes `deployments/bow-robinhood.json` and never overwrites an existing one. **Nobody can use the pool yet:** the UI points at the old pool until step 5.

## 3. Verify what was deployed

```bash
node scripts/bow/readback.js deployments/bow-robinhood.json --artifacts <forge out>
```

Must print `read-back OK`, including "code equals the build of the pinned tag" for both verifiers, the Entrypoint implementation and the pool.
Also verify the sources on the Blockscout explorer with the upstream compiler settings (solc 0.8.28, optimizer runs 10000, bytecode hash none, the profile that was built).

## 4. Hand over the roles (irreversible)

```bash
SAFE=<safe> PUBLISHER=<publisher> node scripts/bow/governance.js deployments/bow-robinhood.json            # dry run
CONFIRM=bow-handover SAFE=<safe> PUBLISHER=<publisher> node scripts/bow/governance.js deployments/bow-robinhood.json
node scripts/bow/readback.js deployments/bow-robinhood.json --expect-owner <safe> --expect-postman <publisher>
```

The script grants first and renounces last; after it, the deployer key can do nothing. Destroy or archive the deployer key.
On mainnet the script uses `MAINNET_RPC` and `MAINNET_DEPLOYER_PRIVATE_KEY` (the deployer key), and refuses a Safe with fewer than 3 owners or threshold below 2.

## 5. Open the system (only with S1-S10 signed)

1. Deploy the Magistrate worker against the new Entrypoint (`services/magistrate/bow-target.js`; the worker needs `MAGISTRATE_PUBLISHER_KEY` = the publisher key, nothing else changes).
   Publish the first ASP root only after the first deposit; the pool accepts deposits with no root, withdrawals need one.
2. Set the web service variables (`.env.mainnet.example`): `NEXT_PUBLIC_CHAIN=mainnet`, `BOW_ENTRYPOINT`, `RELAYER_PRIVATE_KEY`, `RH_MAINNET_RPC_URL`, `RH_LOGS_RPC_URL`.
3. Freeze the old pool with its guardian (Safe), after publishing one last root to the old register, then make the new pool the default.
4. First deposits are small, by the owner. Run the Courier end to end once with your own funds (`scripts/bow/courier-e2e.mjs` is the template) before announcing.
5. Watch: relayer balance, Magistrate failures and lag, `latestRoot` age, Entrypoint events, pool balance versus the invariant (`scripts/bow/verify-pool-invariant.mjs`).

## 6. Incident handling

| Situation | Action | Reversible? |
|---|---|---|
| Suspected bug or exploit in the pool | Safe calls `windDownPool(pool)`: deposits stop, withdraw, ragequit and relay keep working | **No**, permanent for that pool |
| Publisher key leaked | Safe revokes the postman role and grants a new one; until then the worst case is a bad root (censorship), not theft | yes |
| Relayer key leaked | switch the Courier off (remove `RELAYER_PRIVATE_KEY`), rotate the key; users can self-relay | yes |
| ASP list wrong or screening source down | stop publishing (fail closed); users can ragequit | yes |
| Need to upgrade the Entrypoint | announce, review the new implementation, Safe executes; after a TVL trigger a timelock must sit in front | process, not code |

Never run `removePool` as a rollback: it deletes the scope mapping and breaks `relay` for the old pool.
