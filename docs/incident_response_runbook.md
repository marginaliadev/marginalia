# MARGINALIA — Incident Response & Emergency Runbook

**Standard:** Institutional Security & Risk Mitigation  
**Version:** 1.0.0-RUNBOOK  
**Scope:** MarginaliaPool (ETH) & MarginaliaTokenPool (ERC-20) on Robinhood Chain  

---

## 1. Incident Severity Classification

| Level | Definition | Response SLA | Action Trigger |
|:---:|---|:---:|---|
| **P0 - Catastrophic** | On-chain solvency discrepancy detected by Sentinel; Groth16 invalid proof accepted; double-spend observed. | **Immediate (< 15 mins)** | Trigger emergency deposit pause; convene war room. |
| **P1 - Critical** | Magistrate ASP service down; `StaleAspRoot` errors affecting users; RPC node failure. | **< 1 hour** | Switch to secondary RPC; publish cached ASP root. |
| **P2 - Medium** | Relayer gas price spike; indexer lag > 50 blocks. | **< 4 hours** | Adjust relayer fee parameters; scale indexer compute. |

---

## 2. Emergency Pause Protocol (Deposits Paused Only)

In the event of an active zero-day exploit attempt or critical anomaly:

### Step 1: Engage Pause Guardian
The authorized Guardian (or Gnosis Safe multisig) executes:
```bash
# Using Guardian hot key or multisig transaction
npx hardhat run scripts/emergency-pause.js --network robinhood
```
On-chain execution:
```solidity
pool.setDepositsPaused(true);
```

### Step 2: Critical Guarantee — User Withdrawals Remain Operational
> **Non-Negotiable Invariant:**  
> The `withdraw()` and `ragequit()` methods **CANNOT BE PAUSED**.  
> Pausing deposits protects incoming user capital without holding existing user deposits hostage. Users retain unconditional rights to reclaim or withdraw unspent notes at all times.

### Step 3: Investigate & Root Cause Analysis
1. Query `SolvencySentinel.verifyOnChainSolvency()`.
2. Inspect mempool and event history for the offending transaction hash.
3. Check `nullifierSpent` mapping to determine if invalid nullifiers were accepted.

---

## 3. Recovery & Unpausing Procedure

Once the vulnerability is patched or false-alarm resolved:
1. Validate pool balance equals unspent liabilities.
2. Ensure ASP root is synchronized and published to `MagistrateRegister`.
3. Guardian executes:
   ```solidity
   pool.setDepositsPaused(false);
   ```
4. Publish public post-mortem and transparency report.

---

## 4. Governance model after Fase 03 (Safe multisig + automated Magistrate)

| Role | Holder | Can do | Cannot do |
|---|---|---|---|
| `MagistrateRegister.owner` | Safe (2-of-3) | `setMagistrate`, `setPool`, `transferOwnership` | publish roots (only the Magistrate can) |
| `MagistrateRegister.magistrate` | **Publisher** hot key (services/magistrate) | `publishRoot`, `approveLabels` | change governance |
| `MarginaliaPool.guardian` | Safe (2-of-3) | pause deposits, set deposit cap, hand over guardianship | pause withdrawals or ragequit (impossible by design) |
| Deployer EOA | nobody | nothing (all 8 admin calls revert; proven by `scripts/test-governance.js`) | everything above |

Scripts (all executed BY the Safe; on testnet `SAFE_SIGNER_KEYS=k1,k2` executes directly, on mainnet the script prints the transaction for the Safe UI):
`scripts/governance/pause-deposits.js`, `rotate-magistrate.js`, `transfer-roles.js` (one-off migration, dry run by default).

### 4.1 Publisher key compromised (or planned rotation)
1. Generate a new key, fund it with ~0.001 ETH.
2. `SAFE=0x.. NEW_PUBLISHER=0x.. node scripts/governance/rotate-magistrate.js` (2 Safe signatures). From this block the old key reverts with `NotMagistrate`.
3. Stop the old worker, set `MAGISTRATE_PUBLISHER_KEY` to the new key, restart (state file is kept, nothing is lost).
4. Review `services/magistrate/state/*.decisions.jsonl` and recent `RootPublished` events for roots you did not expect. A bad root can only mislead which labels are "approved"; it can never move funds. If one was published, publish a corrected list (a new root supersedes it) and consider pausing deposits.
Drill result (testnet, real Safe): rotation executed in 1.6 s of signing + inclusion.

### 4.2 Emergency pause
`SAFE=0x.. PAUSED=true node scripts/governance/pause-deposits.js` then `PAUSED=false` to resume. Drill: 1.4 s. Withdrawals and ragequit keep working while paused (tested).

### 4.3 The Magistrate worker stops
Approvals queue up; nothing breaks. Users with already-approved deposits are unaffected, new deposits wait (or ragequit). Health: `GET :8081/` returns 503 when 3 consecutive ticks failed; alerts go to `ALERT_WEBHOOK_URL`. Restart the worker: it rebuilds all state from the chain.

### 4.4 Courier relayer out of gas
`/api/status` shows `relayer.balanceEth` and `healthy`. Below `RELAYER_MIN_BALANCE_ETH` the UI hides the Courier and `/api/relay/withdraw` answers 503 ("use your wallet"); one alert per 10 minutes is sent. Top up the relayer address from a treasury wallet (manual by design: no high-value key lives on the web server).
