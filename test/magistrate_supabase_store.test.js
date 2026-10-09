// Fase 03: Supabase-backed Magistrate state, verdict log and asp_roots index (services/magistrate/store.js SupabaseStore).
// Uses an in-memory fake of the Supabase client that models primary keys, upserts and the append-only trigger of the migration.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const M = require("../lib/marginalia");
const S = require("../lib/aspStore");
const { MagistrateService } = require("../services/magistrate/service");
const { SupabaseStore } = require("../services/magistrate/store");
const { denylistPolicy } = require("../services/magistrate/policy");

const PK = { magistrate_state: ["pool_address"], magistrate_deposits: ["pool_address", "label"], asp_roots: ["root"], asp_decisions: null };

/** Minimal in-memory stand-in for @supabase/supabase-js (the subset the store uses). */
function fakeSupabase({ failOn = () => false } = {}) {
  const tables = { magistrate_state: [], magistrate_deposits: [], asp_roots: [], asp_decisions: [] };
  const calls = { upsert: [], insert: [] };
  const keyOf = (t, r) => PK[t].map((k) => r[k]).join("|");
  function from(t) {
    const q = { filters: [], order: null, range: null };
    const run = async (single) => {
      if (failOn(t, "select")) return { data: null, error: { message: "boom" } };
      let rows = tables[t].filter((r) => q.filters.every(([c, v]) => r[c] === v));
      if (q.order) rows = [...rows].sort((a, b) => (a[q.order.c] - b[q.order.c]) * (q.order.asc ? 1 : -1));
      if (q.range) rows = rows.slice(q.range[0], q.range[1] + 1);
      return { data: single ? rows[0] || null : rows.map((r) => ({ ...r })), error: null };
    };
    const api = {
      select: () => api,
      eq: (c, v) => { q.filters.push([c, v]); return api; },
      order: (c, o) => { q.order = { c, asc: o ? o.ascending !== false : true }; return api; },
      range: (a, b) => { q.range = [a, b]; return api; },
      maybeSingle: () => run(true),
      then: (res, rej) => run(false).then(res, rej),
      upsert: async (rows) => {
        calls.upsert.push({ t, n: [].concat(rows).length });
        if (failOn(t, "upsert")) return { error: { message: "boom" } };
        for (const r of [].concat(rows)) {
          const i = tables[t].findIndex((x) => keyOf(t, x) === keyOf(t, r));
          if (i >= 0) tables[t][i] = { ...tables[t][i], ...r }; else tables[t].push({ ...r });
        }
        return { error: null };
      },
      insert: async (row) => {
        calls.insert.push({ t });
        if (failOn(t, "insert")) return { error: { message: "boom" } };
        tables[t].push({ id: tables[t].length + 1, ...row });
        return { error: null };
      },
      update: () => ({ eq: async () => ({ error: { message: "asp_decisions is append-only (UPDATE blocked)" } }) }),
    };
    return api;
  }
  return { from, tables, calls };
}

describe("Magistrate Supabase store", function () {
  this.timeout(300000);
  const POOL = "0xAbC0000000000000000000000000000000000001";

  it("round trip: state, deposits, verdicts and last publication survive a restart", async function () {
    const db = fakeSupabase();
    const a = new SupabaseStore(db, { poolAddress: POOL });
    await a.load();
    a.state.cursor = 1234;
    a.state.ragequit = ["77"];
    a.state.lastPublish = { root: "9", cid: "bafy", at: 1, tx: "0xt", labels: 2 };
    a.state.pendingSince = 55;
    a.state.deposits["10"] = { depositor: "0xaaa", value: "5", block: 100, order: 100000001, decision: "APPROVE", reason: "ok" };
    a.state.deposits["11"] = { depositor: "0xbbb", value: "6", block: 101, order: 101000000, decision: "DENY", reason: "ofac" };
    await a.save();
    const b = new SupabaseStore(db, { poolAddress: POOL });
    await b.load();
    expect(b.state.cursor).to.equal(1234);
    expect(b.state.ragequit).to.deep.equal(["77"]);
    expect(b.state.lastPublish.cid).to.equal("bafy");
    expect(b.state.pendingSince).to.equal(55);
    expect(b.state.deposits["10"]).to.deep.equal(a.state.deposits["10"]);
    expect(b.state.deposits["11"].decision).to.equal("DENY");
  });

  it("save() writes only what changed", async function () {
    const db = fakeSupabase();
    const s = new SupabaseStore(db, { poolAddress: POOL });
    await s.load();
    for (let i = 0; i < 5; i++) s.state.deposits[String(i)] = { depositor: "0x1", value: "1", block: i, order: i, decision: "APPROVE", reason: "" };
    await s.save();
    const first = db.calls.upsert.filter((c) => c.t === "magistrate_deposits").reduce((n, c) => n + c.n, 0);
    expect(first).to.equal(5);
    await s.save(); // nothing changed
    s.state.deposits["3"].decision = "DENY";
    await s.save();
    const total = db.calls.upsert.filter((c) => c.t === "magistrate_deposits").reduce((n, c) => n + c.n, 0);
    expect(total).to.equal(6); // exactly one more row
  });

  it("two pools never see each other's state", async function () {
    const db = fakeSupabase();
    const a = new SupabaseStore(db, { poolAddress: "0xAAA" });
    const b = new SupabaseStore(db, { poolAddress: "0xBBB" });
    a.state.cursor = 1; a.state.deposits["1"] = { depositor: "0x1", value: "1", block: 1, order: 1, decision: "APPROVE", reason: "" };
    await a.save();
    await b.load();
    expect(b.state.cursor).to.equal(null);
    expect(Object.keys(b.state.deposits)).to.have.length(0);
  });

  it("audit() appends rows and the log is append-only (an UPDATE is refused)", async function () {
    const db = fakeSupabase();
    const s = new SupabaseStore(db, { poolAddress: POOL });
    await s.audit({ label: "10", depositor: "0xaaa", from: null, to: "APPROVE", reason: "ok" });
    await s.audit({ event: "published", root: "9", cid: "bafy", labels: 2, tx: "0xt" });
    expect(db.tables.asp_decisions).to.have.length(2);
    expect(db.tables.asp_decisions[1]).to.include({ event: "published", root: "9", ipfs_cid: "bafy", tx_hash: "0xt" });
    const { error } = await db.from("asp_decisions").update({ reason: "tampered" }).eq("id", 1);
    expect(error.message).to.match(/append-only/);
    expect(db.tables.asp_decisions[0].reason).to.equal("ok");
  });

  it("recordRoot() indexes the published root with its provenance", async function () {
    const db = fakeSupabase();
    const s = new SupabaseStore(db, { poolAddress: POOL });
    await s.recordRoot({ root: "123", cid: "bafyX", labels: 4, tx: "0xtx", publisher: "0xPub", register: "0xReG", chainId: 46630, documentSha256: "ab", previousCid: "bafyOld" });
    expect(db.tables.asp_roots[0]).to.deep.include({ root: "123", ipfs_cid: "bafyX", approved_labels_count: 4, published_by: "0xPub", tx_hash: "0xtx", register_address: "0xreg", chain_id: 46630, document_sha256: "ab", previous_cid: "bafyOld" });
    await s.recordRoot({ root: "123", cid: "bafyX", labels: 4, tx: "0xtx", publisher: "0xPub" }); // idempotent
    expect(db.tables.asp_roots).to.have.length(1);
  });

  it("a database outage never throws: errors are counted and the worker keeps its in-memory state", async function () {
    const db = fakeSupabase({ failOn: () => true });
    const s = new SupabaseStore(db, { poolAddress: POOL });
    await s.load();
    s.state.deposits["1"] = { depositor: "0x1", value: "1", block: 1, order: 1, decision: "APPROVE", reason: "" };
    await s.save();
    await s.audit({ label: "1", to: "APPROVE" });
    await s.recordRoot({ root: "1", cid: "c", labels: 1, tx: "t", publisher: "p" });
    expect(s.errors).to.equal(4);
    expect(s.lastError).to.match(/boom/);
    expect(s.state.deposits["1"].decision).to.equal("APPROVE");
  });

  describe("inside the service (local chain)", function () {
    let owner, publisher, alice, bad, pool, register;
    const blobs = new Map();
    const pinner = { name: "mem", pin: async (b) => { const c = S.rawCid(b); blobs.set(c, b); return c; } };
    beforeEach(async function () {
      [owner, publisher, alice, bad] = await ethers.getSigners();
      const { h1, h2, h3 } = await M.deployHashers(owner, ethers);
      const v = await (await ethers.getContractFactory("Groth16Verifier")).deploy();
      const rq = await (await ethers.getContractFactory("RagequitVerifier")).deploy();
      register = await (await ethers.getContractFactory("MagistrateRegister")).deploy(publisher.address);
      pool = await (await ethers.getContractFactory("MarginaliaPool")).deploy(await v.getAddress(), await rq.getAddress(), await h1.getAddress(), await h2.getAddress(), await h3.getAddress(), await register.getAddress());
    });
    const dep = async (s) => { const x = await M.newSecret(); await pool.connect(s).deposit(x.precommitment, { value: ethers.parseEther("1") }); };
    const svcFor = (store, policy) => new MagistrateService({
      provider: ethers.provider, pool, register: register.connect(publisher), M, store, policy: policy || denylistPolicy({}), pinners: [pinner],
      chainId: 31337, deployBlock: 0, logChunk: 1000, minIntervalMs: 0, gateways: ["http://127.0.0.1:9/"], alert: async () => {},
    });

    it("publishes, records everything in Supabase, and a restarted worker resumes from the stored state without republishing", async function () {
      const db = fakeSupabase();
      const store1 = new SupabaseStore(db, { poolAddress: await pool.getAddress() });
      await store1.load();
      await dep(alice); await dep(bad);
      const svc1 = svcFor(store1, denylistPolicy({ inline: bad.address }));
      const r = await svc1.tick();
      expect(r.action).to.equal("published");
      expect(db.tables.asp_roots).to.have.length(1);
      expect(db.tables.asp_roots[0]).to.include({ root: r.root.toString(), ipfs_cid: r.cid, approved_labels_count: 1 }); // the denied deposit is not counted
      const events = db.tables.asp_decisions;
      expect(events.some((e) => e.event === "published" && e.ipfs_cid === r.cid)).to.equal(true);
      expect(events.filter((e) => e.event === "decision" && e.to_decision === "DENY")).to.have.length(1);
      expect(db.tables.magistrate_deposits).to.have.length(2);

      // restart: brand-new store + service restored from the same database
      const store2 = new SupabaseStore(db, { poolAddress: await pool.getAddress() });
      await store2.load();
      expect(store2.state.cursor).to.equal(store1.state.cursor);
      expect(Object.keys(store2.state.deposits)).to.have.length(2);
      const svc2 = svcFor(store2, denylistPolicy({ inline: bad.address }));
      const r2 = await svc2.tick();
      expect(r2.action).to.equal("noop");
      expect((await register.queryFilter(register.filters.RootPublished())).length).to.equal(1);
    });

    it("a Supabase outage does not stop publication", async function () {
      const db = fakeSupabase({ failOn: () => true });
      const store = new SupabaseStore(db, { poolAddress: await pool.getAddress() });
      await dep(alice);
      const r = await svcFor(store).tick();
      expect(r.action).to.equal("published");
      expect(store.errors).to.be.greaterThan(0);
    });
  });
});
