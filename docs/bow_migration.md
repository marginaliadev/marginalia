# MARGINALIA: migration to the unmodified 0xbow core (no new ceremony, no circuit audit)

**Status:** in progress on branch `feat/0xbow-core` · **Updated:** 2026-10-12 · **Decision record:** `docs/decision_0xbow_core_adoption.md` (internal)
**Mainnet:** NOT READY. Nothing here changes the mainnet guards; `node scripts/bow/preflight.js` and `node scripts/mainnet-preflight.js` must both be green.

## 1. Goal and the one rule

Replace our own circuits, verifiers and pool with the public **0xbow Privacy Pools core, tag `v1.2.1` (commit `a80836a`), byte for byte**.
Its circuits were audited and its proving keys come from a public ceremony, so we neither run a ceremony nor commission a circuit audit.

**The rule:** no new cryptography and no edited vendor code: zero lines of our own Solidity or circom on the fund-moving path.
Everything custom lives around the core, off-chain. One edited line in the pool, entrypoint, verifiers or circuits voids the waiver for that part.
`node scripts/vendor/0xbow.js verify --upstream` enforces this (it fails on any difference from the tag).

What this does **not** remove: an external review of our glue code and configuration, verification of the upstream ceremony figures,
the owner decisions below, and every operational gate of `scripts/mainnet-preflight.js` (paid screening, Safe/publisher/deployer, legal review, incident drill, launch limits).

## 2. What changes for users and operators (be honest about it)

| Topic | Our pool today | 0xbow core (this plan) |
|---|---|---|
| Entrypoint | none; pool is immutable | UUPS-upgradeable by `OWNER_ROLE` (one role guards `windDownPool`, upgrade, `registerPool`, `withdrawFees`) |
| Deposit cap / pause | guardian pauses deposits, cap available | none. Only `windDownPool`, which is permanent for that pool (withdraw, ragequit, relay keep working) |
| ASP roots | last 16 valid | only the **latest** root is valid: every publication invalidates proofs in flight |
| Tree | fixed depth 20 | lean incremental tree, depth up to 32 |
| Amounts | single note per deposit | any amount, partial withdrawal with a change note; amounts are public, so amount correlation is possible |
| Ragequit | original deposit only | original depositor can also ragequit change notes |
| Relayer fee | absolute amount bound in the proof | percentage (BPS) bound in the proof, capped by the pool configuration |
| Gas (measured) | deposit 945k, withdraw 1.07M | deposit ~300k, withdraw ~440-500k |
| Browser proving (measured, 12-core desktop, snarkjs in Chromium) | ~2.1 s | ~3.4 s (1.6x, same ratio as the constraint count); Node with the same snarkjs: 3.9 s. Mobile devices are NOT measured |

## 3. Milestones and status

| Step | Work | Status |
|---|---|---|
| M0 | Remove the Letter of Disclosure generator (it attested facts the server could not verify) | **done** (commit `3d73a95`) |
| M1 | Vendor the tag, manifest, empty-diff check, verifier-vs-ceremony-key check, proving-asset hash pins | **done**: `vendor/0xbow`, `scripts/vendor/0xbow.js`, `test/vendor_0xbow.test.js` |
| M2 | Deploy the unmodified core on testnet, read back every setting | **done**: `deployments/bow-robinhoodTestnet.json`, `scripts/bow/{deploy,readback}.js` |
| M3 | SDK, note format, indexer and front end | proof cycle with the upstream SDK **done** (`scripts/bow/e2e.mjs`, 12 checks + invariant). Browser client library **done**: `frontend/src/lib/bow-zk.ts` and `bow-tree.ts` reproduce the SDK known answers, build the circuit input and produce a real proof that verifies with the ceremony key (`test/bow_zk.test.js`); proving assets are fetched and pinned by `node scripts/vendor/0xbow.js fetch`. **Not started:** the `/app` pages (deposit, withdraw, ragequit UI), the vault format migration, the event indexer and the dual-read of the old pool |
| M4 | Magistrate publishes to `Entrypoint.updateRoot` | **done on testnet**: `services/magistrate/bow-target.js` leaves `service.js` unchanged; `scripts/bow/magistrate-live.js` passed 5/5 (root == lean root == SDK root, ragequit excluded, 59-byte CID, idempotent). Worker deployment against a bow entrypoint: not started |
| M5 | Courier relays through `Entrypoint.relay` with one fee policy | **done on testnet**: `/api/relay/bow` and `/api/relay/bow/quote` (`frontend/src/lib/bow-relay.ts`, 6 unit tests); `scripts/bow/courier-e2e.mjs` passed 7/7 with real proofs (quote, dust refused, low fee refused before gas, wrong fee recipient refused, relay paid, replay refused). The old pool routes are untouched until M6 |
| M6 | Cutover: freeze the old pool, default the UI to the new pool | **not started** (needs Safe signatures) |
| M7 | Full gate and deployment record | **not started**; `scripts/bow/preflight.js` lists what is missing |

## 4. Gates (all must be green before the owner is asked to order a mainnet deployment)

Run `node scripts/bow/preflight.js` (automatic gates V1-V3, T1, D1, A1; manual gates S1-S6 signed in `docs/bow/signoff.json`):

- **V1-V3** vendored tree equals the manifest and the upstream tag; verifier constants equal the ceremony verification keys.
- **T1** a testnet deployment of the unmodified core exists and was exercised end to end.
- **D1** a fresh mainnet deployment is recorded and read back (`readback.js --expect-owner --expect-postman`). Never reuse testnet keys.
- **A1** the front end serves the upstream proving assets (hashes taken from the manifest, not from this repository).
- **S1** external review of glue code, configuration and the post-audit delta (Entrypoint, DeployLib, ICreateX, verifier signatures).
- **S2** independent verification of the upstream ceremony figures (public sources disagree on the Phase-1 base; the transcript is not in the upstream repository).
- **S3** owner decision signed (section 5).
- **S4** the upstream suite is green on Linux CI (`.github/workflows/bow.yml`; Windows cannot give this evidence).
- **S5** roles handed over: owner = Safe (>= 2-of-3), postman = dedicated publisher, deployer holds none (`scripts/bow/governance.js`, dry run by default).
- **S6** incident drill on the new deployment (windDown on a throwaway pool, postman rotation, relayer off).

## 5. Owner decisions (to be signed before mainnet)

1. Accept an upgradeable entrypoint controlled by one multisig role.
2. Accept no on-chain deposit cap and no pause: the only brake is `windDown`, which is permanent.
3. Launch controls are therefore soft (UI and relayer limits, small first deposits, monitoring). State this publicly; do not call it a cap.
4. No timelock at launch (so `windDown` takes minutes); install one by hand at a TVL trigger that must be written down **before** signing: `<ETH amount>`.
   When the timelock is active `windDown` is delayed too, so the incident runbook must change at that point.
5. Pin `vettingFeeBPS = 0` (a non-zero fee changes note values and fee quoting; the owner could change it, so read it back after every change).
6. ASP policy: one rule, published rarely (not per deposit), deterministic and verifiable from IPFS, fail-closed when the sanctions source is down.
7. Self-relay is the default until the Courier is stable; no gasless claim before health and quoting are live.

## 6. Findings about the upstream core that every client must handle

- The published SDK does not run on Windows as shipped (`fs.readFile(url.pathname)`); use Linux/CI.
- The SDK reports `index = NaN` for a one-leaf tree (first deposit in an empty pool, one-label ASP set). The index is 0; `lib/bow/lean-imt.js` and `e2e.mjs` map it.
- `eth_getLogs` is limited to 10 blocks on the free Alchemy plan, so the state tree needs chunked scanning or an indexer.
- The pool bytecode links two Poseidon libraries; deploy them once per chain.
- The 3 upstream fuzz tests that fail on Windows (extreme inputs) must be re-checked on Linux CI.
- In the SDK the field `getCommitment(...).nullifierHash` is the PRECOMMITMENT hash. The value the pool records as spent (public signal 1) is `Poseidon(nullifier)`; `bowNullifierHash` computes it and the proof test checks it.
- Ragequit links the depositor to the recipient publicly; self-relay with `processooor == depositor` reduces privacy. The UI must say so.

## 7. Commands

```bash
node scripts/vendor/0xbow.js verify --upstream        # empty diff against the tag
node scripts/vendor/0xbow.js vkey                     # verifier constants == ceremony keys
node scripts/bow/deploy.js --artifacts <forge out> --out deployments/bow-robinhoodTestnet.json   # testnet only
node scripts/bow/readback.js deployments/bow-robinhoodTestnet.json
SDK_DIR=<sdk dir> node scripts/bow/e2e.mjs deployments/bow-robinhoodTestnet.json
node scripts/bow/verify-pool-invariant.mjs deployments/bow-robinhoodTestnet.json
SDK_DIR=<sdk dir> node scripts/bow/magistrate-live.js deployments/bow-robinhoodTestnet.json
node scripts/bow/preflight.js
```
