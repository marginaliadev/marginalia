# B5 runbook: redeploy from the ceremony output (after B1-B4)

**Do not run any step before:** the audit findings are fixed and the circuits are frozen (B4/B6 inputs), the ceremony transcripts verify (B1), and Phase 1 is `VERIFIED` (B2).
The mainnet guard (`scripts/ceremony/mainnet-guard.js`, called by `scripts/deploy.js` on chain 4663) refuses otherwise. Do the full procedure on **testnet first**, then repeat on mainnet.

## 0. Inputs
- `ceremony/withdraw/{final.zkey,transcript.json,out/Groth16Verifier.sol}`, `ceremony/ragequit/{final.zkey,transcript.json,out/RagequitVerifier.sol}`
- the `--O2` witness generators built with native circom (`withdraw.wasm`, `ragequit.wasm`), built from the frozen sources (CI job `circuits-o2`)
- two independent `node scripts/ceremony/cli.js verify ...` reports (PASS on every line), published with the artefacts

## 1. Install the artefacts (a PR, reviewed by two people)
1. Copy the verifiers over `contracts/Groth16Verifier.sol` and `contracts/RagequitVerifier.sol`; `git diff` must show only the verifier constants changed.
2. Copy `final.zkey` and the `--O2` wasm to `build/` and `frontend/public/zk/` (names: `withdraw_final.zkey`, `withdraw.wasm`, `ragequit_final.zkey`, `ragequit.wasm`).
3. `node scripts/zk-hashes.js write` and commit `frontend/src/lib/zk-hashes.ts`; update the table in `docs/audit/zk_assets.md`.
4. Update the constraint counts and the "24,236" figures in the UI and docs (finding I-3) **in the same PR**.
5. `npx hardhat clean && npx hardhat test` (the whole suite), then `node scripts/audit/manifest.js write`; this is the freeze manifest.

## 2. Deploy on testnet (rehearsal of mainnet)
```bash
npx hardhat run scripts/deploy.js --network robinhoodTestnet     # new verifiers + pool + register; writes deployments/<network>.json
```
- Set the Magistrate to the **publisher** key at deploy time (`MAGISTRATE_ADDRESS=<publisher>`), never the deployer.
- Transfer roles to the Safe: `SAFE=0x.. PUBLISHER=0x.. node scripts/governance/transfer-roles.js` (dry run first), then the Safe accepts guardian and the owner transfer runs last.
- Update env on every service: `MARGINALIA_POOL_ADDRESS`, `MAGISTRATE_REGISTER_ADDRESS`, `POOL_DEPLOY_BLOCK`, and the worker's `DEPLOYMENT_FILE`; redeploy web and worker.
- Verify: `node scripts/supabase-check.js`; E2E (`scripts/test-browser-e2e.js all`, `AUTO_MAGISTRATE=1`); **a proof made with the old dev key is rejected** (`test/ceremony_rehearsal.test.js`, D-TEST6); `node scripts/soak-check.js`.

## 3. Mainnet
```bash
CEREMONY_WITHDRAW_TRANSCRIPT=ceremony/withdraw/transcript.json CEREMONY_RAGEQUIT_TRANSCRIPT=ceremony/ragequit/transcript.json \
MAGISTRATE_ADDRESS=<publisher> npx hardhat run scripts/deploy.js --network robinhood
```
- Fresh Safe (3 hardware wallets) on chain 4663; fresh publisher key; paid RPC + backup; two IPFS providers; paid sanctions screening.
- Start with a **deposit cap** (`setMaxDepositAmount` through the Safe) and a small announced launch window; keep the pause drill and incident runbook rehearsed.
- Verify the deployed bytecode of both verifiers against the published `.sol` and publish the addresses with the transcript.

## 4. Rollback
There is no upgrade path (immutable verifiers). If something is wrong **before** announcing: pause deposits via the Safe and deploy again. After users deposit, only `ragequit`
and withdraw remain, so test everything on testnet first.
