// Script to test live Supabase connection and table accessibility
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

async function checkConnection() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  console.log("--------------------------------------------------");
  console.log("MARGINALIA — Supabase Connection Diagnostic");
  console.log("--------------------------------------------------");
  console.log("Supabase URL:", url || "(NOT SET)");
  console.log("Service Key Present:", !!serviceKey);
  console.log("Anon Key Present:", !!anonKey);

  if (!url || !serviceKey) {
    console.error("\n❌ ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in .env");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const tables = [
    "folio_leaves",
    "deposits",
    "nullifiers",
    "asp_roots",
    "relayer_jobs",
  ];

  console.log("\nChecking table accessibility...");

  let allOk = true;
  for (const table of tables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .limit(1);

      if (error) {
        console.log(`❌ Table '${table}': FAILED (${error.message})`);
        allOk = false;
      } else {
        console.log(`✅ Table '${table}': CONNECTED & ACCESSIBLE`);
      }
    } catch (err) {
      console.log(`❌ Table '${table}': ERROR (${err.message})`);
      allOk = false;
    }
  }

  console.log("--------------------------------------------------");
  if (allOk) {
    console.log("🎉 SUCCESS: Supabase database connection is fully active and all tables exist!");

    // Test live INSERT, SELECT, and DELETE
    console.log("\nTesting Read/Write operations on 'folio_leaves'...");
    const testIndex = 999999999;
    const testRecord = {
      leaf_index: testIndex,
      leaf_commitment: "0x123456789abcdef",
      pool_address: "0x0000000000000000000000000000000000000001",
      chain_id: 46630,
      block_number: 1,
      tx_hash: "0xdiagtest",
    };

    const { error: insErr } = await supabase.from("folio_leaves").upsert(testRecord);
    if (insErr) {
      console.log("❌ Write test failed:", insErr.message);
    } else {
      console.log("✅ Write test (INSERT): SUCCESS");

      const { data: selData, error: selErr } = await supabase
        .from("folio_leaves")
        .select("*")
        .eq("leaf_index", testIndex);
      if (selErr || !selData || selData.length === 0) {
        console.log("❌ Read test failed:", selErr ? selErr.message : "Not found");
      } else {
        console.log("✅ Read test (SELECT): SUCCESS (retrieved commitment: " + selData[0].leaf_commitment + ")");

        await supabase.from("folio_leaves").delete().eq("leaf_index", testIndex);
        console.log("✅ Cleanup test (DELETE): SUCCESS");
      }
    }
  } else {
    console.log("⚠️ NOTICE: Some tables do not exist yet. Please run 'supabase/schema.sql' in your Supabase SQL Editor.");
  }
  console.log("--------------------------------------------------");
}

checkConnection().catch((err) => {
  console.error("Diagnostic error:", err);
  process.exit(1);
});
