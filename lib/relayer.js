// MARGINALIA Mersenne Courier — Relayer Daemon Subsystem (Mitigation for L7)
// Relays zero-knowledge shielded withdrawals to detach the gas payer from the withdrawal recipient.

const { ethers } = require("ethers");

class MersenneRelayer {
  /**
   * @param {object} relayerSigner - Ethers signer for the relayer's hot wallet.
   * @param {object} poolContract - Ethers contract instance for MarginaliaPool.
   * @param {object} options
   * @param {number} options.marginBps - Profit margin in basis points (default: 1000 = 10%).
   * @param {bigint} options.estimatedGasUnits - Typical gas consumed for withdraw (default: 1,150,000n).
   */
  constructor(relayerSigner, poolContract, options = {}) {
    this.signer = relayerSigner;
    this.pool = poolContract.connect(relayerSigner);
    this.marginBps = BigInt(options.marginBps || 1000);
    this.estimatedGasUnits = BigInt(options.estimatedGasUnits || 1150000);
  }

  async getAddress() {
    return await this.signer.getAddress();
  }

  /**
   * Quote the minimum relayer fee required to execute the withdrawal.
   */
  async quoteFee(overrideGasPrice = null) {
    const provider = this.signer.provider;
    const feeData = await provider.getFeeData();
    const gasPrice = overrideGasPrice || feeData.gasPrice || ethers.parseUnits("1", "gwei");

    const baseCost = this.estimatedGasUnits * gasPrice;
    const margin = (baseCost * this.marginBps) / 10000n;
    return baseCost + margin;
  }

  /**
   * Validate a withdrawal payload before submitting to the mempool.
   */
  async validate(withdrawal, proof) {
    const relayerAddr = await this.getAddress();
    if (withdrawal.relayer.toLowerCase() !== relayerAddr.toLowerCase()) {
      throw new Error(`Invalid relayer address: expected ${relayerAddr}, got ${withdrawal.relayer}`);
    }

    const minFee = await this.quoteFee();
    if (BigInt(withdrawal.fee) < minFee) {
      throw new Error(`Insufficient relayer fee: provided ${withdrawal.fee}, minimum required ${minFee}`);
    }

    // Static simulation to verify proof validity, nullifier, and contract state
    try {
      await this.pool.withdraw.staticCall(withdrawal, proof);
    } catch (simError) {
      throw new Error(`Simulation failed: ${simError.reason || simError.shortMessage || "execution reverted"}`);
    }

    return true;
  }

  /**
   * Relay the withdrawal transaction.
   */
  async relay(withdrawal, proof, txOverrides = {}) {
    await this.validate(withdrawal, proof);

    const tx = await this.pool.withdraw(withdrawal, proof, txOverrides);
    const receipt = await tx.wait();

    const actualGasCost = receipt.gasUsed * receipt.gasPrice;
    const feeReceived = BigInt(withdrawal.fee);
    const netProfit = feeReceived - actualGasCost;

    return {
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
      actualGasCost,
      feeReceived,
      netProfit,
    };
  }
}

module.exports = {
  MersenneRelayer,
};
