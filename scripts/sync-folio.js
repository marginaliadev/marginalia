// Backfill / refresh the Supabase Folio index from chain logs.
//   node scripts/sync-folio.js
// Env: RH_TESTNET_RPC_URL, RH_LOG_CHUNK (blocks per eth_getLogs; 10 on free-tier RPCs, raise it on RPCs that allow more),
//      RH_LOGS_RPC_URL (optional separate RPC used only for logs), SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (writes need the service key).
require("dotenv").config();
const { ethers } = require("ethers");
const { supabaseService } = require("../lib/supabase");
const { LEAF_ABI } = require("../lib/folio-index");
const d = require("../deployments/robinhoodTestnet.json");

async function main() {
  if (!supabaseService.isConfigured()) throw new Error("Supabase is not configured");
  const provider = new ethers.JsonRpcProvider(process.env.RH_LOGS_RPC_URL || process.env.RH_TESTNET_RPC_URL, 46630, { staticNetwork: true });
  const chain = new ethers.JsonRpcProvider(process.env.RH_TESTNET_RPC_URL, 46630, { staticNetwork: true });
  const pool = new ethers.Contract(d.pool, ["function nextIndex() view returns (uint32)"], chain);
  const iface = new ethers.Interface(LEAF_ABI);
  const topic = iface.getEvent("LeafInserted").topicHash;
  const chunk = Math.max(1, parseInt(process.env.RH_LOG_CHUNK || "10", 10));

  const have = await supabaseService.getAllLeaves();
  const want = Number(await pool.nextIndex());
  let known = 0;
  const idx = new Set(have.map((l) => Number(l.leaf_index)));
  while (known < want && idx.has(known)) known++;
  console.log(`index has ${known}/${want} contiguous leaves`);
  if (known === want) return console.log("already in sync");

  const from0 = known > 0 ? Number(have.find((l) => Number(l.leaf_index) === known - 1).block_number) : d.deployBlock;
  const head = await provider.getBlockNumber();
  let stored = 0;
  for (let f = from0; f <= head; f += chunk) {
    const t = Math.min(f + chunk - 1, head);
    const logs = await provider.getLogs({ address: d.pool, topics: [topic], fromBlock: f, toBlock: t });
    for (const log of logs) {
      const ev = iface.parseLog(log);
      if (idx.has(Number(ev.args.index))) continue;
      await supabaseService.saveLeaf({ index: ev.args.index, leaf: ev.args.leaf, poolAddress: d.pool, blockNumber: log.blockNumber, txHash: log.transactionHash });
      console.log(`stored leaf #${ev.args.index} (block ${log.blockNumber})`);
      stored++;
    }
  }
  console.log(`done: stored ${stored} leaf(s)`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
