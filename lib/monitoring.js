// MARGINALIA Production Telemetry & Solvency Sentinel (TASK-4.2)
// Monitors real-time events, computes expected protocol liabilities, and fires alerts on anomalies.

const { ethers } = require("ethers");

class SolvencySentinel {
  /**
   * @param {object} poolContract - Ethers contract instance for MarginaliaPool.
   * @param {object} options
   * @param {bigint} options.largeTxThreshold - Amount in wei to trigger large tx warning (default: 10 ETH).
   */
  constructor(poolContract, options = {}) {
    this.pool = poolContract;
    this.largeTxThreshold = options.largeTxThreshold || ethers.parseEther("10");

    this.totalDeposited = 0n;
    this.totalWithdrawn = 0n;
    this.totalRagequitted = 0n;
    this.totalFeesPaid = 0n;
    this.anomalies = [];
  }

  /**
   * Process a Deposited event log.
   */
  recordDeposit(event) {
    const val = BigInt(event.args.value);
    this.totalDeposited += val;

    if (val >= this.largeTxThreshold) {
      this.anomalies.push({
        type: "LARGE_DEPOSIT",
        txHash: event.transactionHash,
        amount: val.toString(),
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Process a Withdrawn event log.
   */
  recordWithdrawal(event) {
    const val = BigInt(event.args.withdrawnValue);
    const fee = BigInt(event.args.fee);
    this.totalWithdrawn += val;
    this.totalFeesPaid += fee;

    if (val >= this.largeTxThreshold) {
      this.anomalies.push({
        type: "LARGE_WITHDRAWAL",
        txHash: event.transactionHash,
        amount: val.toString(),
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Process a Ragequit event log.
   */
  recordRagequit(event) {
    const val = BigInt(event.args.value);
    this.totalRagequitted += val;
  }

  /**
   * Calculate expected on-chain balance based on event telemetry.
   */
  getExpectedBalance() {
    return this.totalDeposited - this.totalWithdrawn - this.totalRagequitted;
  }

  /**
   * Audit on-chain balance against expected liabilities.
   * Throws critical alert if discrepancy is detected.
   */
  async verifyOnChainSolvency() {
    const provider = this.pool.runner ? this.pool.runner.provider : this.pool.provider;
    const actualBalance = await provider.getBalance(await this.pool.getAddress());
    const expected = this.getExpectedBalance();

    if (actualBalance !== expected) {
      const discrepancy = actualBalance - expected;
      const alert = {
        type: "CRITICAL_SOLVENCY_BREACH",
        actualBalance: actualBalance.toString(),
        expectedBalance: expected.toString(),
        discrepancy: discrepancy.toString(),
        timestamp: Date.now(),
      };
      this.anomalies.push(alert);
      throw new Error(`CRITICAL ALERT: On-chain solvency discrepancy! Expected ${expected}, Actual ${actualBalance}`);
    }

    return {
      solvent: true,
      poolBalance: actualBalance,
      totalDeposited: this.totalDeposited,
      totalWithdrawn: this.totalWithdrawn,
      totalRagequitted: this.totalRagequitted,
      anomaliesCount: this.anomalies.length,
    };
  }
}

module.exports = {
  SolvencySentinel,
};
