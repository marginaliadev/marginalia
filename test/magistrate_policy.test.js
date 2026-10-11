// Fase 03 / H1-T1: screening policies (OFAC list, Chainalysis free API, composition). No network: fetch is injected.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const M = require("../lib/marginalia");
const S = require("../lib/aspStore");
const { MagistrateService } = require("../services/magistrate/service");
const { MemoryStore } = require("../services/magistrate/store");
const { ofacPolicy, chainalysisPolicy, composePolicies, denylistPolicy } = require("../services/magistrate/policy");

const A = "0x" + "a".repeat(40), B = "0x" + "b".repeat(40), C = "0x" + "c".repeat(40);
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) });

describe("Screening policies", function () {
  this.timeout(120000);

  describe("OFAC public list", function () {
    const list = `${A}\n${B.toUpperCase().replace("0X", "0x")}\n# comment\n`;
    it("denies listed depositors (case-insensitive), approves others", async function () {
      const p = ofacPolicy({ fetchImpl: async () => res(200, list) });
      const v = await p.screenAll([{ depositor: A }, { depositor: B }, { depositor: C }]);
      expect(v.map((x) => x.decision)).to.deep.equal(["DENY", "DENY", "APPROVE"]);
      expect(v[0].reason).to.match(/OFAC/);
    });
    it("uses the last good copy during an outage, but only within the stale window; then FAILS CLOSED", async function () {
      let t = 1_000_000, up = true;
      const p = ofacPolicy({ fetchImpl: async () => (up ? res(200, list) : res(503, "")), now: () => t, maxStaleMs: 60_000 });
      await p.screenAll([{ depositor: A }]);
      up = false; t += 30_000;
      expect((await p.screenAll([{ depositor: A }]))[0].decision).to.equal("DENY"); // cached list still protects
      t += 60_000;
      let msg = ""; try { await p.screenAll([{ depositor: C }]); } catch (e) { msg = e.message; }
      expect(msg).to.match(/unavailable and no fresh cache/);
    });
    it("no cache + outage -> throws (never approves unscreened deposits)", async function () {
      const p = ofacPolicy({ fetchImpl: async () => res(500, "") });
      let threw = false; try { await p.screenAll([{ depositor: C }]); } catch (_) { threw = true; }
      expect(threw).to.equal(true);
    });
    it("an empty or garbage list is rejected instead of being read as 'nobody is sanctioned'", async function () {
      for (const body of ["", "<html>captive portal</html>", "# only comments"]) {
        const p = ofacPolicy({ fetchImpl: async () => res(200, body) });
        let msg = ""; try { await p.screenAll([{ depositor: A }]); } catch (e) { msg = e.message; }
        expect(msg, JSON.stringify(body)).to.match(/zero addresses|unavailable/);
      }
    });
  });

  describe("Chainalysis sanctions API", function () {
    function api(map) {
      const calls = [];
      return { calls, fetchImpl: async (url, opts) => {
        calls.push({ url, key: opts.headers["X-API-Key"] });
        const addr = url.split("/").pop();
        const r = map[addr];
        if (typeof r === "number") return res(r, "{}");
        return res(200, JSON.stringify(r ?? { identifications: [] }));
      } };
    }
    it("sends the key, denies sanctioned addresses, approves clean ones", async function () {
      const a = api({ [A]: { identifications: [{ category: "sanctions", name: "SDN" }] } });
      const p = chainalysisPolicy({ apiKey: "k1", fetchImpl: a.fetchImpl });
      const v = await p.screenAll([{ depositor: A }, { depositor: C }]);
      expect(v.map((x) => x.decision)).to.deep.equal(["DENY", "APPROVE"]);
      expect(v[0].reason).to.match(/sanctions/);
      expect(a.calls.every((c) => c.key === "k1")).to.equal(true);
    });
    it("asks once per unique address and caches (sanctioned forever, clean for the TTL)", async function () {
      let t = 0;
      const a = api({ [A]: { identifications: [{ category: "sanctions" }] } });
      const p = chainalysisPolicy({ apiKey: "k", fetchImpl: a.fetchImpl, now: () => t, cleanTtlMs: 1000 });
      await p.screenAll([{ depositor: A }, { depositor: A }, { depositor: C }, { depositor: C }]);
      expect(a.calls).to.have.length(2);
      await p.screenAll([{ depositor: A }, { depositor: C }]);
      expect(a.calls).to.have.length(2); // all cached
      t += 5000;
      await p.screenAll([{ depositor: A }, { depositor: C }]);
      expect(a.calls).to.have.length(3); // only the clean one expired; the sanctioned one is never forgotten
    });
    it("rate limit, server errors and malformed answers all THROW (an unscreened address is never approved)", async function () {
      for (const [bad, re] of [[429, /rate limit/], [500, /HTTP 500/]]) {
        const p = chainalysisPolicy({ apiKey: "k", fetchImpl: api({ [A]: bad }).fetchImpl });
        let msg = ""; try { await p.screenAll([{ depositor: A }]); } catch (e) { msg = e.message; }
        expect(msg).to.match(re);
      }
      const p = chainalysisPolicy({ apiKey: "k", fetchImpl: async () => res(200, JSON.stringify({ unexpected: true })) });
      let msg = ""; try { await p.screenAll([{ depositor: A }]); } catch (e) { msg = e.message; }
      expect(msg).to.match(/no identifications/);
    });
  });

  describe("composition", function () {
    it("first DENY wins and every denying reason is kept; all-clean approves", async function () {
      const manual = { name: "manual", screenAll: async (ds) => ds.map((d) => (d.depositor === A ? { decision: "DENY", reason: "known exploiter" } : { decision: "APPROVE", reason: "ok" })) };
      const ofac = ofacPolicy({ fetchImpl: async () => res(200, `${A}\n${B}`) });
      const v = await composePolicies([manual, ofac]).screenAll([{ depositor: A }, { depositor: B }, { depositor: C }]);
      expect(v.map((x) => x.decision)).to.deep.equal(["DENY", "DENY", "APPROVE"]);
      expect(v[0].reason).to.include("manual: known exploiter").and.include("ofac:");
    });
    it("one failing policy fails the whole screening", async function () {
      const ok = { name: "ok", screenAll: async (ds) => ds.map(() => ({ decision: "APPROVE", reason: "" })) };
      const dead = { name: "dead", screenAll: async () => { throw new Error("API down"); } };
      let msg = ""; try { await composePolicies([ok, dead]).screenAll([{ depositor: A }]); } catch (e) { msg = e.message; }
      expect(msg).to.equal("API down");
    });
  });

  describe("inside the service: screening outage stops publication (fail closed)", function () {
    it("OFAC unreachable -> the tick fails, no root is published; once it recovers the deposit is approved", async function () {
      const [owner, publisher, alice] = await ethers.getSigners();
      const { h1, h2, h3 } = await M.deployHashers(owner, ethers);
      const verifier = await (await ethers.getContractFactory("Groth16Verifier")).deploy();
      const rq = await (await ethers.getContractFactory("RagequitVerifier")).deploy();
      const register = await (await ethers.getContractFactory("MagistrateRegister")).deploy(publisher.address);
      const pool = await (await ethers.getContractFactory("MarginaliaPool")).deploy(
        await verifier.getAddress(), await rq.getAddress(), await h1.getAddress(), await h2.getAddress(), await h3.getAddress(), await register.getAddress()
      );
      const s = await M.newSecret();
      await pool.connect(alice).deposit(s.precommitment, { value: ethers.parseEther("1") });

      let up = false;
      const policy = composePolicies([denylistPolicy({}), ofacPolicy({ fetchImpl: async () => (up ? res(200, B) : res(503, "")) })]);
      const blobs = new Map();
      const pinner = { name: "mem", pin: async (b) => { const c = S.rawCid(b); blobs.set(c, b); return c; } };
      const svc = new MagistrateService({
        provider: ethers.provider, pool, register: register.connect(publisher), M, store: new MemoryStore(), policy, pinners: [pinner],
        chainId: 31337, deployBlock: 0, logChunk: 1000, minIntervalMs: 0, gateways: ["http://127.0.0.1:9/"], alert: async () => {},
      });
      expect((await svc.safeTick()).action).to.equal("error");
      expect((await register.queryFilter(register.filters.RootPublished())).length).to.equal(0);
      up = true;
      expect((await svc.safeTick()).action).to.equal("published");
    });
  });
});
