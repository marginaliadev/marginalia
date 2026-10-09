// Fase 03 / H1 tests: the automated Magistrate service against a local chain, with in-memory pinners and a mock IPFS gateway.
const http = require("http");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const M = require("../lib/marginalia");
const S = require("../lib/aspStore");
const { MagistrateService } = require("../services/magistrate/service");
const { denylistPolicy, parseDenylist } = require("../services/magistrate/policy");
const { MemoryStore } = require("../services/magistrate/store");

const ONE = ethers.parseEther("1");
const MIN = 60_000;

describe("H1: automated Magistrate service", function () {
  this.timeout(300000);
  let owner, publisher, alice, bad, bob;
  let pool, register, gateway, ipfs;

  async function deployWorld() {
    [owner, publisher, alice, bad, bob] = await ethers.getSigners();
    const { h1, h2, h3 } = await M.deployHashers(owner, ethers);
    const verifier = await (await ethers.getContractFactory("Groth16Verifier")).deploy();
    const rq = await (await ethers.getContractFactory("RagequitVerifier")).deploy();
    register = await (await ethers.getContractFactory("MagistrateRegister")).deploy(publisher.address);
    pool = await (await ethers.getContractFactory("MarginaliaPool")).deploy(
      await verifier.getAddress(), await rq.getAddress(), await h1.getAddress(), await h2.getAddress(), await h3.getAddress(), await register.getAddress()
    );
    await register.setPool(await pool.getAddress(), true);
  }
  async function deposit(signer, value = ONE) {
    const s = await M.newSecret();
    const rc = await (await pool.connect(signer).deposit(s.precommitment, { value })).wait();
    return M.noteFromDepositReceipt(pool, rc, s);
  }
  function makeService(over = {}) {
    const clock = { t: 1_000_000_000_000, advance(ms) { this.t += ms; } };
    const pinners = over.pinners || [ipfs.pinner("a"), ipfs.pinner("b")];
    const alerts = [];
    const svc = new MagistrateService({
      provider: ethers.provider, pool, register: register.connect(over.signer || publisher), M,
      store: over.store || new MemoryStore(), policy: over.policy || denylistPolicy({ inline: "" }), pinners,
      chainId: 31337, deployBlock: 0, logChunk: 1000, minIntervalMs: over.minIntervalMs ?? 0, now: () => clock.t,
      gateways: [gateway.url + "/ipfs/"], alert: async (m) => alerts.push(m), lagAlertMs: over.lagAlertMs ?? 30 * MIN,
    });
    return { svc, clock, alerts };
  }
  const countPublications = async () => (await register.queryFilter(register.filters.RootPublished())).length;

  before(async function () {
    const blobs = new Map();
    ipfs = {
      blobs,
      pinner: (name) => ({ name, pin: async (bytes) => { const cid = S.rawCid(bytes); blobs.set(cid, bytes); return cid; } }),
    };
    gateway = await new Promise((resolve) => {
      const server = http.createServer((req, res) => {
        const cid = req.url.replace("/ipfs/", "");
        if (blobs.has(cid)) { res.setHeader("content-type", "application/json"); return res.end(blobs.get(cid)); }
        res.statusCode = 404; res.end();
      });
      server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
    });
  });
  after(() => gateway.server.close());
  beforeEach(deployWorld);

  it("H1-TEST1 policy: denylist parsing, inline + file + URL, URL failure fails CLOSED", async function () {
    const a = "0x" + "a".repeat(40), b = "0x" + "B".repeat(40);
    expect([...parseDenylist(`${a}, ${b} # comment\nnot-an-address`)]).to.have.members([a, b.toLowerCase()]);
    const fs = { existsSync: () => true, readFileSync: () => "0x" + "c".repeat(40) };
    const p = denylistPolicy({ inline: a, file: "x", fs, url: "http://u", fetchImpl: async () => ({ ok: true, text: async () => b }) });
    const v = await p.screenAll([{ depositor: a }, { depositor: b }, { depositor: "0x" + "c".repeat(40) }, { depositor: "0x" + "d".repeat(40) }]);
    expect(v.map((x) => x.decision)).to.deep.equal(["DENY", "DENY", "DENY", "APPROVE"]);
    const dead = denylistPolicy({ url: "http://u", fetchImpl: async () => ({ ok: false, status: 503 }) });
    let msg = ""; try { await dead.screenAll([{ depositor: a }]); } catch (e) { msg = e.message; }
    expect(msg).to.match(/HTTP 503/);
  });

  it("H1-TEST2/3 deposit -> tick -> root accepted by the contract -> user withdraws using the list fetched from IPFS", async function () {
    const note = await deposit(alice);
    await deposit(bob);
    const { svc } = makeService();
    const r = await svc.tick();
    expect(r.action).to.equal("published");
    expect(await register.isValidRoot(r.root)).to.equal(true);
    expect(await register.rootData(r.root)).to.equal(`ipfs://${r.cid}`);

    // the client path: CID from the chain -> gateway -> verified against the on-chain root
    const { labels } = await S.loadVerified(await register.rootData(await register.latestRoot()), await register.latestRoot(), M, { gateways: [gateway.url + "/ipfs/"] });
    const aspTree = await M.buildAspTree(labels);
    const w = { recipient: bob.address, relayer: ethers.ZeroAddress, fee: 0n };
    const { proof } = await M.proveWithdraw({ note, stateTree: await M.buildStateTree(pool), aspTree, withdrawnValue: ONE, context: await pool.computeContext(w) });
    await expect(pool.connect(alice).withdraw(w, proof)).to.emit(pool, "Withdrawn");
  });

  it("H1-TEST4 idempotent: ticking again with nothing new sends no transaction", async function () {
    await deposit(alice);
    const { svc } = makeService();
    expect((await svc.tick()).action).to.equal("published");
    const second = await svc.tick();
    expect(second.action).to.equal("noop");
    expect(await countPublications()).to.equal(1);
  });

  it("H1-TEST5 denylisted depositor: label never listed, withdrawal impossible, ragequit still works", async function () {
    const good = await deposit(alice);
    const evil = await deposit(bad);
    const { svc } = makeService({ policy: denylistPolicy({ inline: bad.address }) });
    const r = await svc.tick();
    const doc = await S.fetchDocument(r.cid, { gateways: [gateway.url + "/ipfs/"] });
    expect(doc.labels).to.include(good.label.toString());
    expect(doc.labels).to.not.include(evil.label.toString());
    let failed = false;
    try {
      await M.proveWithdraw({ note: evil, stateTree: await M.buildStateTree(pool), aspTree: await M.buildAspTree(doc.labels.map(BigInt)), withdrawnValue: ONE, context: 1n });
    } catch (e) { failed = /not approved/.test(e.message); }
    expect(failed, "proof for an unapproved label must be impossible").to.equal(true);
    // the safety net is never taken away
    const rq = await M.proveRagequit({ note: evil });
    await expect(pool.connect(bad).ragequit(evil.label, bad.address, rq.proof)).to.emit(pool, "Ragequit");
  });

  it("H1-TEST5b adding an address to the denylist later REVOKES its label from the next list", async function () {
    const a = await deposit(alice);
    const b = await deposit(bad);
    let deny = "";
    const policy = { async screenAll(ds) { return denylistPolicy({ inline: deny }).screenAll(ds); } };
    const { svc, store } = (() => { const s = new MemoryStore(); return { ...makeService({ policy, store: s }), store: s }; })();
    const first = await svc.tick();
    expect((await S.fetchDocument(first.cid, { gateways: [gateway.url + "/ipfs/"] })).labels).to.include(b.label.toString());
    deny = bad.address;
    const second = await svc.tick();
    expect(second.action).to.equal("published");
    expect((await S.fetchDocument(second.cid, { gateways: [gateway.url + "/ipfs/"] })).labels).to.deep.equal([a.label.toString()]);
    expect(store.log.some((e) => e.to === "DENY" && e.from === "APPROVE")).to.equal(true); // audit trail
  });

  it("H1-TEST6 a ragequit deposit is excluded from the next list", async function () {
    const a = await deposit(alice);
    const b = await deposit(bob);
    const { svc } = makeService();
    await svc.tick();
    const rq = await M.proveRagequit({ note: a });
    await pool.connect(alice).ragequit(a.label, alice.address, rq.proof);
    const r = await svc.tick();
    expect(r.action).to.equal("published");
    expect((await S.fetchDocument(r.cid, { gateways: [gateway.url + "/ipfs/"] })).labels).to.deep.equal([b.label.toString()]);
  });

  it("H1-TEST7a rate limit: 3 simulated hours of deposits every 2 minutes -> at most one root per 15 min; early roots stay valid", async function () {
    const { svc, clock } = makeService({ minIntervalMs: 15 * MIN });
    await deposit(alice);
    const first = await svc.tick();
    const firstRoot = first.root;
    let deferred = 0;
    for (let minute = 2; minute <= 180; minute += 2) {
      clock.advance(2 * MIN);
      await deposit(bob, ethers.parseEther("0.001"));
      if ((await svc.tick()).action === "deferred") deferred++;
    }
    const pubs = await countPublications();
    console.log(`      3h simulated: ${pubs} publications, ${deferred} deferred ticks`);
    expect(pubs).to.be.at.most(13); // 180/15 + the first one
    expect(await register.isValidRoot(firstRoot), "a root published 3h ago must still be accepted").to.equal(true);
  });

  it("H1-TEST7b negative control: publishing every tick exhausts the 16-root window (this is why the guard exists)", async function () {
    const { svc } = makeService({ minIntervalMs: 0 });
    let firstRoot;
    for (let i = 0; i < 18; i++) {
      await deposit(alice, ethers.parseEther("0.001"));
      const r = await svc.tick();
      if (i === 0) firstRoot = r.root;
    }
    expect(await register.isValidRoot(firstRoot)).to.equal(false);
  });

  it("H1-TEST8 crash between pin and publish: restart publishes exactly one root with the SAME cid; state loss changes nothing", async function () {
    await deposit(alice);
    const store = new MemoryStore();
    let boom = true;
    const flaky = new Proxy(register.connect(publisher), {
      get(t, p) {
        if (p === "publishRoot(uint256,string)") return async (...a) => { if (boom) { boom = false; throw new Error("process killed"); } return t[p](...a); };
        const v = t[p]; return typeof v === "function" ? v.bind(t) : v;
      },
    });
    const { svc } = makeService({ store });
    svc.register = flaky;
    const failed = await svc.safeTick();
    expect(failed.action).to.equal("error");
    expect(await countPublications()).to.equal(0);
    const pinnedBefore = new Set(ipfs.blobs.keys());
    const again = await svc.tick();
    expect(again.action).to.equal("published");
    expect(await countPublications()).to.equal(1);
    expect(pinnedBefore.has(again.cid), "same bytes -> same CID, no orphan pin").to.equal(true);

    // lose all state: a brand-new service rebuilds from the chain and finds nothing to do
    const { svc: fresh } = makeService({ store: new MemoryStore() });
    const r = await fresh.tick();
    expect(r.action).to.equal("noop");
    expect(await countPublications()).to.equal(1);
  });

  it("H1-TEST8b all pinners down: the tick fails, nothing is published, an alert fires after 3 failures", async function () {
    await deposit(alice);
    const down = { name: "down", pin: async () => { throw new Error("503"); } };
    const { svc, alerts } = makeService({ pinners: [down] });
    for (let i = 0; i < 3; i++) expect((await svc.safeTick()).action).to.equal("error");
    expect(await countPublications()).to.equal(0);
    expect(alerts.filter((a) => /3 ticks/.test(a))).to.have.length(1);
  });

  it("H1-TEST8c a single working pinner publishes but raises a redundancy alert", async function () {
    await deposit(alice);
    const down = { name: "down", pin: async () => { throw new Error("503"); } };
    const { svc, alerts } = makeService({ pinners: [down, ipfs.pinner("only")] });
    expect((await svc.tick()).action).to.equal("published");
    expect(alerts.some((a) => /only/.test(a))).to.equal(true);
  });

  it("H1-TEST9 only the Magistrate key can publish: a wrong key cannot, and the failure is reported", async function () {
    await deposit(alice);
    const { svc } = makeService({ signer: bob });
    const r = await svc.safeTick();
    expect(r.action).to.equal("error");
    expect(await countPublications()).to.equal(0);
  });

  it("no approved labels -> no publication (never an empty root)", async function () {
    const { svc } = makeService();
    expect((await svc.tick()).action).to.equal("noop");
    expect(await countPublications()).to.equal(0);
  });

  it("status() reports lag while approvals wait for the rate limit", async function () {
    const { svc, clock } = makeService({ minIntervalMs: 15 * MIN });
    await deposit(alice);
    await svc.tick();
    clock.advance(MIN);
    await deposit(bob);
    await svc.tick(); // deferred
    clock.advance(10 * MIN);
    const s = await svc.status();
    expect(s.lagMs).to.be.greaterThan(9 * MIN);
    expect(s.ok).to.equal(true);
  });
});
