// MARGINALIA Event Indexer Module (Mitigation for L11)
// Caches Folio Merkle Tree state and Deposit events incrementally in safe chunked RPC queries.
// Avoids "RPC log limits exceeded" and provides sub-millisecond witness generation.

const M = require("./marginalia");

class FolioIndexer {
  /**
   * @param {object} poolContract - Ethers contract instance for MarginaliaPool.
   * @param {object} options
   * @param {number} options.startBlock - Deployment block number.
   * @param {number} options.chunkSize - Max blocks per eth_getLogs query (default: 2000).
   */
  constructor(poolContract, options = {}) {
    this.pool = poolContract;
    this.startBlock = options.startBlock || 0;
    this.chunkSize = options.chunkSize || 2000;
    this.lastSyncedBlock = this.startBlock;

    this.leaves = [];
    this.deposits = [];
    this.tree = null;
    this.hasher = null;
  }

  async init() {
    this.hasher = await M.hasher();
    this.tree = new M.MerkleTree(M.DEPTH, this.hasher);
  }

  /**
   * Sync events up to targetBlock (or current chain head).
   * Queries in bounded chunks to avoid RPC response limit errors.
   */
  async sync(targetBlock = null) {
    if (!this.tree) await this.init();

    const provider = this.pool.runner ? this.pool.runner.provider : this.pool.provider;
    const latestBlock = targetBlock !== null ? targetBlock : await provider.getBlockNumber();

    let fromBlock = this.lastSyncedBlock === 0 ? this.startBlock : this.lastSyncedBlock + 1;
    if (fromBlock > latestBlock) return;

    while (fromBlock <= latestBlock) {
      const toBlock = Math.min(fromBlock + this.chunkSize - 1, latestBlock);

      // Query LeafInserted events
      const leafFilter = this.pool.filters.LeafInserted();
      const leafEvents = await this.pool.queryFilter(leafFilter, fromBlock, toBlock);

      leafEvents.sort((a, b) => Number(a.args.index - b.args.index));
      for (const ev of leafEvents) {
        const idx = Number(ev.args.index);
        const leaf = BigInt(ev.args.leaf);
        if (idx === this.leaves.length) {
          this.leaves.push(leaf);
          this.tree.insert(leaf);
        }
      }

      // Query Deposited events
      const depFilter = this.pool.filters.Deposited();
      const depEvents = await this.pool.queryFilter(depFilter, fromBlock, toBlock);
      for (const ev of depEvents) {
        this.deposits.push({
          depositor: ev.args.depositor,
          commitment: ev.args.commitment,
          label: ev.args.label,
          value: ev.args.value,
          precommitment: ev.args.precommitment,
          index: ev.args.index,
          blockNumber: ev.blockNumber,
        });
      }

      this.lastSyncedBlock = toBlock;
      fromBlock = toBlock + 1;
    }
  }

  /**
   * Instant witness generation for a given leaf index from the indexed Merkle tree.
   */
  getWitness(leafIndex) {
    if (!this.tree) throw new Error("Indexer not initialized. Call sync() first.");
    if (leafIndex < 0 || leafIndex >= this.leaves.length) {
      throw new Error(`Leaf index ${leafIndex} out of bounds (total leaves: ${this.leaves.length})`);
    }
    return this.tree.path(leafIndex);
  }

  getLatestRoot() {
    if (!this.tree) return 0n;
    return this.tree.root();
  }

  getLeavesCount() {
    return this.leaves.length;
  }
}

module.exports = {
  FolioIndexer,
};
