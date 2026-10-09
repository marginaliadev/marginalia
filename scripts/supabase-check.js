// Verifies that the Supabase project has every table and column the code needs (read-only).
//   node scripts/supabase-check.js
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the service tables are not readable with the anon key by design).
require("dotenv").config({ quiet: true });
const { createClient } = require("@supabase/supabase-js");

const REQUIRED = {
  // table: columns that must exist (base schema + Fase 03 migration)
  folio_leaves: ["leaf_index", "leaf_commitment", "pool_address", "block_number", "tx_hash"],
  deposits: ["label", "depositor", "commitment", "status"],
  nullifiers: ["nullifier_hash"],
  relayer_jobs: ["id", "status", "gas_used", "gas_estimate", "gas_cost_wei", "fee_wei", "net_wei"],
  asp_roots: ["root", "ipfs_cid", "approved_labels_count", "published_by", "tx_hash", "register_address", "chain_id", "document_sha256", "previous_cid"],
  magistrate_state: ["pool_address", "cursor", "ragequit", "last_publish", "pending_since", "updated_at"],
  magistrate_deposits: ["pool_address", "label", "depositor", "value", "block_number", "ord", "decision", "reason"],
  asp_decisions: ["id", "pool_address", "event", "label", "from_decision", "to_decision", "reason", "root", "ipfs_cid", "tx_hash", "created_at"],
};

(async () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) { console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"); process.exit(2); }
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  let bad = 0;
  for (const [table, cols] of Object.entries(REQUIRED)) {
    // GET (not HEAD): a HEAD request carries no error body, so a missing table would look healthy
    const r = await db.from(table).select(cols.join(",")).limit(1);
    if (r.error || r.status >= 400) { bad++; console.log(`MISSING  ${table.padEnd(20)} ${(r.error && r.error.message) || "HTTP " + r.status}`); continue; }
    const count = (await db.from(table).select("*", { count: "exact", head: true })).count;
    console.log(`ok       ${table.padEnd(20)} ${count} row(s)`);
  }
  if (bad) console.log(`\n${bad} table(s) need attention. Run supabase/migrations/20261009000000_phase3_magistrate.sql in the Supabase SQL Editor, then re-run this check.`);
  else console.log("\nSchema is complete.");
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e.message); process.exit(2); });
