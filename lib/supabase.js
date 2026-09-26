// MARGINALIA Supabase Integration Module
// Provides database persistence for Folio Merkle leaves, deposits, nullifiers, and relayer jobs.
// Gracefully falls back to local memory store if Supabase credentials are not yet configured.

const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

let client = null;
if (SUPABASE_URL && SUPABASE_KEY && !SUPABASE_URL.includes("xyzcompany")) {
  try {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false },
    });
  } catch (err) {
    console.warn("Could not initialize Supabase client, falling back to local memory store:", err.message);
  }
}

// Local fallback store for offline tests and development
const localStore = {
  leaves: [],
  deposits: new Map(),
  nullifiers: new Map(),
  aspRoots: [],
  relayerJobs: new Map(),
};

class SupabaseService {
  constructor(customClient = null) {
    this.client = customClient || client;
  }

  isConfigured() {
    return this.client !== null;
  }

  // ----------------------------------------------------------- Folio Leaves
  async saveLeaf({ index, leaf, poolAddress = "", blockNumber = 0, txHash = "" }) {
    const record = {
      leaf_index: Number(index),
      leaf_commitment: leaf.toString(),
      pool_address: poolAddress.toLowerCase(),
      block_number: Number(blockNumber),
      tx_hash: txHash,
    };

    if (this.client) {
      const { error } = await this.client.from("folio_leaves").upsert(record);
      if (error) throw new Error(`Supabase saveLeaf error: ${error.message}`);
    } else {
      localStore.leaves[Number(index)] = record;
    }
    return record;
  }

  async getAllLeaves() {
    if (this.client) {
      const { data, error } = await this.client
        .from("folio_leaves")
        .select("*")
        .order("leaf_index", { ascending: true });
      if (error) throw new Error(`Supabase getAllLeaves error: ${error.message}`);
      return data || [];
    }
    return localStore.leaves.filter(Boolean);
  }

  // ----------------------------------------------------------- Deposits
  async saveDeposit(deposit) {
    const record = {
      label: deposit.label.toString(),
      depositor: deposit.depositor.toLowerCase(),
      commitment: deposit.commitment.toString(),
      value: deposit.value.toString(),
      precommitment: deposit.precommitment.toString(),
      token_address: (deposit.token || ethers.ZeroAddress).toLowerCase(),
      leaf_index: Number(deposit.index || 0),
      status: deposit.status || "PENDING_SCREENING",
      block_number: Number(deposit.blockNumber || 0),
      tx_hash: deposit.txHash || "",
    };

    if (this.client) {
      const { error } = await this.client.from("deposits").upsert(record);
      if (error) throw new Error(`Supabase saveDeposit error: ${error.message}`);
    } else {
      localStore.deposits.set(record.label, record);
    }
    return record;
  }

  async getDeposits(statusFilter = null) {
    if (this.client) {
      let query = this.client.from("deposits").select("*").order("block_number", { ascending: true });
      if (statusFilter) query = query.eq("status", statusFilter);
      const { data, error } = await query;
      if (error) throw new Error(`Supabase getDeposits error: ${error.message}`);
      return data || [];
    }

    const all = Array.from(localStore.deposits.values());
    return statusFilter ? all.filter((d) => d.status === statusFilter) : all;
  }

  // ----------------------------------------------------------- Nullifiers (Wax Seals)
  async saveNullifier({ nullifierHash, spentType = "WITHDRAW", spentBlock = 0, txHash = "" }) {
    const record = {
      nullifier_hash: nullifierHash.toString(),
      spent_type: spentType,
      spent_block: Number(spentBlock),
      tx_hash: txHash,
    };

    if (this.client) {
      const { error } = await this.client.from("nullifiers").upsert(record);
      if (error) throw new Error(`Supabase saveNullifier error: ${error.message}`);
    } else {
      localStore.nullifiers.set(record.nullifier_hash, record);
    }
    return record;
  }

  async isNullifierSpent(nullifierHash) {
    const hashStr = nullifierHash.toString();
    if (this.client) {
      const { data, error } = await this.client
        .from("nullifiers")
        .select("nullifier_hash")
        .eq("nullifier_hash", hashStr)
        .maybeSingle();
      if (error) throw new Error(`Supabase isNullifierSpent error: ${error.message}`);
      return data !== null;
    }
    return localStore.nullifiers.has(hashStr);
  }

  // ----------------------------------------------------------- Relayer Jobs
  async createRelayerJob(jobData) {
    const isUuid = jobData.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobData.id);
    const id = isUuid ? jobData.id : crypto.randomUUID();
    const record = {
      id,
      recipient: jobData.recipient.toLowerCase(),
      relayer_address: jobData.relayerAddress.toLowerCase(),
      fee: jobData.fee.toString(),
      nullifier_hash: jobData.nullifierHash.toString(),
      status: "QUEUED",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (this.client) {
      const { data, error } = await this.client.from("relayer_jobs").insert(record).select().single();
      if (error) throw new Error(`Supabase createRelayerJob error: ${error.message}`);
      return data;
    } else {
      localStore.relayerJobs.set(id, record);
      return record;
    }
  }

  async updateRelayerJob(jobId, updates) {
    const updateRecord = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    if (this.client) {
      const { data, error } = await this.client
        .from("relayer_jobs")
        .update(updateRecord)
        .eq("id", jobId)
        .select()
        .single();
      if (error) throw new Error(`Supabase updateRelayerJob error: ${error.message}`);
      return data;
    } else {
      const current = localStore.relayerJobs.get(jobId);
      if (!current) throw new Error(`Relayer job ${jobId} not found`);
      const merged = { ...current, ...updateRecord };
      localStore.relayerJobs.set(jobId, merged);
      return merged;
    }
  }

  async getRelayerJob(jobId) {
    if (this.client) {
      const { data, error } = await this.client.from("relayer_jobs").select("*").eq("id", jobId).maybeSingle();
      if (error) throw new Error(`Supabase getRelayerJob error: ${error.message}`);
      return data;
    }
    return localStore.relayerJobs.get(jobId) || null;
  }
}

module.exports = {
  SupabaseService,
  supabaseService: new SupabaseService(),
};
