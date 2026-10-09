// Keeps the Supabase Folio index (folio_leaves) in step with the chain. The index is an optimisation:
// the chain stays the source of truth and clients verify every root against the contracts.
const { ethers } = require("ethers");
const { supabaseService } = require("./supabase");

const LEAF_ABI = ["event LeafInserted(uint256 indexed index, uint256 leaf, uint256 root)"];

/** Index every LeafInserted emitted by `poolAddress` in a mined tx. Returns the number of leaves stored. */
async function recordTxLeaves(provider, poolAddress, txHash) {
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt || receipt.status !== 1) throw new Error(`tx ${txHash} not found or failed`);
  const iface = new ethers.Interface(LEAF_ABI);
  let n = 0;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== poolAddress.toLowerCase()) continue;
    let ev;
    try { ev = iface.parseLog(log); } catch (_) { continue; }
    if (!ev) continue;
    await supabaseService.saveLeaf({
      index: ev.args.index,
      leaf: ev.args.leaf,
      poolAddress,
      blockNumber: receipt.blockNumber,
      txHash,
    });
    n++;
  }
  return n;
}

/** Best-effort wrapper for scripts: never fails the main operation. */
async function tryRecord(provider, poolAddress, txHash) {
  try {
    const n = await recordTxLeaves(provider, poolAddress, txHash);
    console.log(`indexed ${n} Folio leaf(s) in Supabase`);
  } catch (e) {
    console.warn(`(could not index leaves in Supabase: ${e.message}; run scripts/sync-folio.js later)`);
  }
}

/** Folio tree from the Supabase index, or null if the index is unavailable/incomplete/stale. */
async function treeFromIndex(M, pool) {
  try {
    const rows = await supabaseService.getAllLeaves();
    const next = Number(await pool.nextIndex());
    const byIdx = new Map(rows.map((r) => [Number(r.leaf_index), BigInt(r.leaf_commitment)]));
    const leaves = [];
    for (let i = 0; i < next; i++) {
      if (!byIdx.has(i)) return null;
      leaves.push(byIdx.get(i));
    }
    const tree = new M.MerkleTree(M.DEPTH, await M.hasher(), leaves);
    return tree.root() === (await pool.getLastRoot()) ? tree : null;
  } catch (_) {
    return null;
  }
}

module.exports = { recordTxLeaves, tryRecord, treeFromIndex, LEAF_ABI };
