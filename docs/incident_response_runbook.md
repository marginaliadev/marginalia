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
