// Durable state of the Magistrate service (cursor, deposits seen, decisions, last publication).
// The CHAIN stays the source of truth: if this file is lost the service rebuilds everything by rescanning from the
// deploy block; the state only makes restarts cheap and keeps an append-only audit log of every decision change.
const fs = require("fs");
const path = require("path");

class FileStore {
  constructor(file, { auditFile = null } = {}) {
    this.file = file;
    this.auditFile = auditFile || (file ? file.replace(/\.json$/, "") + ".decisions.jsonl" : null);
    this.state = { cursor: null, deposits: {}, ragequit: [], lastPublish: null };
    if (file && fs.existsSync(file)) {
      try { this.state = { ...this.state, ...JSON.parse(fs.readFileSync(file, "utf8")) }; } catch (_) { /* corrupt file: rebuild from chain */ }
    }
  }
  save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 1));
    fs.renameSync(tmp, this.file); // atomic: a crash never leaves half a file
  }
  audit(entry) {
    if (!this.auditFile) return;
    fs.mkdirSync(path.dirname(this.auditFile), { recursive: true });
    fs.appendFileSync(this.auditFile, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
  }
}

/** In-memory store for tests. */
class MemoryStore extends FileStore {
  constructor() { super(null); this.log = []; }
  save() {}
  audit(entry) { this.log.push(entry); }
}

/** MemoryStore also remembers published roots (tests). */
MemoryStore.prototype.recordRoot = async function (rec) { (this.roots = this.roots || []).push(rec); };

/**
 * Supabase-backed store (tables from supabase/migrations/20261009000000_phase3_magistrate.sql). Needs the SERVICE ROLE key.
 *   await store.load()   once at start-up (restores cursor, deposits, verdicts)
 *   await store.save()   persists only what changed since the last save
 *   await store.audit()  appends to the append-only asp_decisions log
 *   await store.recordRoot() indexes a published root in asp_roots
 * Persistence is an optimisation, never a dependency: a database error is counted in `errors` and the worker keeps going on its
 * in-memory state (it can always rebuild from the chain), so a Supabase outage never stops the Magistrate or corrupts a list.
 */
class SupabaseStore {
  constructor(client, { poolAddress, chunk = 500, log = () => {} } = {}) {
    if (!client) throw new Error("SupabaseStore needs a client");
    this.db = client;
    this.pool = String(poolAddress).toLowerCase();
    this.chunk = chunk;
    this.log = log;
    this.errors = 0;
    this.lastError = null;
    this.state = { cursor: null, deposits: {}, ragequit: [], lastPublish: null, pendingSince: null };
    this._persisted = new Map(); // label -> JSON of the row last written
    this._meta = "";
  }

  _fail(where, error) {
    this.errors++;
    this.lastError = `${where}: ${error && error.message ? error.message : error}`;
    this.log(`supabase store ${this.lastError}`);
  }

  async load() {
    try {
      const { data: st, error: e1 } = await this.db.from("magistrate_state").select("*").eq("pool_address", this.pool).maybeSingle();
      if (e1) throw new Error(e1.message);
      if (st) {
        this.state.cursor = st.cursor === null || st.cursor === undefined ? null : Number(st.cursor);
        this.state.ragequit = st.ragequit || [];
        this.state.lastPublish = st.last_publish || null;
        this.state.pendingSince = st.pending_since === null || st.pending_since === undefined ? null : Number(st.pending_since);
        this._meta = this._metaJson();
      }
      for (let from = 0; ; from += 1000) {
        const { data: rows, error: e2 } = await this.db.from("magistrate_deposits").select("*").eq("pool_address", this.pool).order("ord", { ascending: true }).range(from, from + 999);
        if (e2) throw new Error(e2.message);
        for (const r of rows || []) {
          const d = { depositor: r.depositor, value: r.value, block: Number(r.block_number), order: Number(r.ord), decision: r.decision, reason: r.reason };
          this.state.deposits[r.label] = d;
          this._persisted.set(r.label, JSON.stringify(this._row(r.label, d)));
        }
        if (!rows || rows.length < 1000) break;
      }
    } catch (e) { this._fail("load", e); }
    return this.state;
  }

  _metaJson() {
    const s = this.state;
    return JSON.stringify({ c: s.cursor, r: s.ragequit, l: s.lastPublish, p: s.pendingSince });
  }
  _row(label, d) {
    return { pool_address: this.pool, label, depositor: d.depositor, value: String(d.value), block_number: d.block, ord: d.order, decision: d.decision, reason: d.reason };
  }

  async save() {
    try {
      const dirty = [];
      for (const [label, d] of Object.entries(this.state.deposits)) {
        const row = this._row(label, d);
        const j = JSON.stringify(row);
        if (this._persisted.get(label) !== j) dirty.push([label, row, j]);
      }
      for (let i = 0; i < dirty.length; i += this.chunk) {
        const part = dirty.slice(i, i + this.chunk);
        const { error } = await this.db.from("magistrate_deposits").upsert(part.map(([, r]) => ({ ...r, updated_at: new Date().toISOString() })));
        if (error) throw new Error(error.message);
        for (const [label, , j] of part) this._persisted.set(label, j);
      }
      const meta = this._metaJson();
      if (meta !== this._meta) {
        const s = this.state;
        const { error } = await this.db.from("magistrate_state").upsert({ pool_address: this.pool, cursor: s.cursor, ragequit: s.ragequit, last_publish: s.lastPublish, pending_since: s.pendingSince, updated_at: new Date().toISOString() });
        if (error) throw new Error(error.message);
        this._meta = meta;
      }
    } catch (e) { this._fail("save", e); }
  }

  async audit(entry) {
    try {
      const { error } = await this.db.from("asp_decisions").insert({
        pool_address: this.pool, event: entry.event || "decision", label: entry.label || null, depositor: entry.depositor || null,
        from_decision: entry.from || null, to_decision: entry.to || null, reason: entry.reason || null,
        root: entry.root || null, ipfs_cid: entry.cid || null, tx_hash: entry.tx || null,
        detail: entry.event === "published" ? { labels: entry.labels } : null,
      });
      if (error) throw new Error(error.message);
    } catch (e) { this._fail("audit", e); }
  }

  async recordRoot(r) {
    try {
      const { error } = await this.db.from("asp_roots").upsert({
        root: r.root, ipfs_cid: r.cid, approved_labels_count: r.labels, published_by: r.publisher, tx_hash: r.tx,
        register_address: r.register ? String(r.register).toLowerCase() : null, chain_id: r.chainId || null,
        document_sha256: r.documentSha256 || null, previous_cid: r.previousCid || null,
      });
      if (error) throw new Error(error.message);
    } catch (e) { this._fail("recordRoot", e); }
  }
}

module.exports = { FileStore, MemoryStore, SupabaseStore };
