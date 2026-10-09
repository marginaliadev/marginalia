// Mocha loads test files alphabetically in ONE process, so this runs first.
// Tests must never read or write the real Supabase project (they used to pollute it with fake
// leaves, nullifiers and relayer jobs). Empty values make lib/supabase.js use its in-memory store.
// dotenv does not override variables that are already set, even to "".
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
process.env.SUPABASE_ANON_KEY = "";
// and never let tests broadcast through a real relayer hot wallet
process.env.RELAYER_PRIVATE_KEY = "";
