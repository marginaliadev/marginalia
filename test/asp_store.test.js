// Fase 03 / H2 tests: IPFS-backed approved-label lists (lib/aspStore.js). No network: pinners and gateways are local mock servers.
const http = require("http");
const { expect } = require("chai");
const M = require("../lib/marginalia");
const S = require("../lib/aspStore");

function listen(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}
const readBody = (req) => new Promise((res) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => res(Buffer.concat(c))); });
async function fileFromMultipart(req) {
  const body = await readBody(req);
  const fd = await new Response(body, { headers: { "content-type": req.headers["content-type"] } }).formData();
  return Buffer.from(await fd.get("file").arrayBuffer());
}

describe("H2: ASP label lists on IPFS", function () {
  this.timeout(120000);
  const store = new Map(); // cid -> bytes (what the "network" holds)
  const servers = [];
  let pinata, kubo, gwGood;
  const labels = Array.from({ length: 50 }, (_, i) => (BigInt(i + 1) * 1234567891011n).toString());
  let doc, root;

  before(async function () {
    const t = await M.buildAspTree(labels.map(BigInt));
    root = t.root();
    doc = S.buildDocument({ chainId: 46630, register: "0xABCDEF", root, depth: M.ASP_DEPTH, labels });

    pinata = await listen(async (req, res) => {
      if (req.url === "/pinning/pinFileToIPFS" && req.headers.authorization === "Bearer good") {
        const bytes = await fileFromMultipart(req);
        const cid = S.rawCid(bytes);
        store.set(cid, bytes);
        res.setHeader("content-type", "application/json");
        return res.end(JSON.stringify({ IpfsHash: cid }));
      }
      res.statusCode = 401;
      res.end("{}");
    });
    kubo = await listen(async (req, res) => {
      if (req.url.startsWith("/api/v0/add")) {
        const bytes = await fileFromMultipart(req);
        const cid = S.rawCid(bytes);
        store.set(cid, bytes);
        res.setHeader("content-type", "application/json");
        return res.end(JSON.stringify({ Hash: cid }));
      }
      res.statusCode = 404;
      res.end();
    });
    gwGood = await listen((req, res) => {
      const cid = req.url.replace("/ipfs/", "");
      if (store.has(cid)) {
        res.setHeader("content-type", "application/json");
        return res.end(store.get(cid));
      }
      res.statusCode = 404;
      res.end();
    });
    servers.push(pinata, kubo, gwGood);
  });
  after(() => servers.forEach((s) => s.server.close()));

  it("H2-TEST1 pin -> fetch -> verify round trip (two providers, same CID)", async function () {
    const pinners = [S.pinataPinner({ jwt: "good", endpoint: pinata.url }), S.kuboPinner({ endpoint: kubo.url })];
    const r = await S.pinDocument(doc, pinners);
    expect(r.redundant).to.equal(true);
    expect(r.pinnedBy).to.have.members(["pinata", "kubo"]);
    const got = await S.loadVerified("ipfs://" + r.cid, root, M, { gateways: [gwGood.url + "/ipfs/"] });
    expect(got.root).to.equal(root);
    expect(got.labels.map(String)).to.deep.equal(labels);
  });

  it("H2-TEST2a a gateway that alters the document (extra label) is rejected", async function () {
    const evil = { ...doc, labels: [...doc.labels, "999999999999999"] };
    let msg = "";
    try { await S.verifyDocument(evil, root, M); } catch (e) { msg = e.message; }
    expect(msg).to.match(/does not match its own labels/);
  });

  it("H2-TEST2b a self-consistent document for a DIFFERENT set is rejected against the on-chain root", async function () {
    const otherLabels = labels.slice(0, 10);
    const other = S.buildDocument({ chainId: 46630, register: "0xabcdef", root: (await M.buildAspTree(otherLabels.map(BigInt))).root(), depth: 20, labels: otherLabels });
    let msg = "";
    try { await S.verifyDocument(other, root, M); } catch (e) { msg = e.message; }
    expect(msg).to.match(/published on-chain/);
  });

  it("H2-TEST2c malformed documents are rejected (version, duplicates, non-numeric, huge ints)", async function () {
    const bad = [
      { ...doc, version: 2 },
      { ...doc, labels: [...doc.labels, doc.labels[0]] },
      { ...doc, labels: ["12abc"] },
      { ...doc, labels: ["1".repeat(90)] },
      { ...doc, labels: "not-an-array" },
      { ...doc, root: "0xdead" },
      null,
    ];
    for (const d of bad) {
      let threw = false;
      try { await S.verifyDocument(d, root, M); } catch (_) { threw = true; }
      expect(threw, JSON.stringify(d)?.slice(0, 60)).to.equal(true);
    }
  });

  it("H2-TEST3a gateway outage: falls through failing and hanging gateways to a healthy one", async function () {
    const cid = (await S.pinDocument(doc, [S.kuboPinner({ endpoint: kubo.url })])).cid;
    const broken = await listen((req, res) => { res.statusCode = 500; res.end("boom"); });
    const hanging = await listen(() => { /* never answers */ });
    servers.push(broken, hanging);
    const got = await S.fetchDocument(cid, { gateways: [broken.url + "/ipfs/", hanging.url + "/ipfs/", gwGood.url + "/ipfs/"], timeoutMs: 800 });
    expect(got.root).to.equal(String(root));
  });

  it("H2-TEST3b every gateway down -> a clear error (never a silent empty list)", async function () {
    const broken = await listen((req, res) => { res.statusCode = 503; res.end(); });
    servers.push(broken);
    let msg = "";
    try { await S.fetchDocument("bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", { gateways: [broken.url + "/ipfs/"], timeoutMs: 500 }); } catch (e) { msg = e.message; }
    expect(msg).to.match(/All IPFS gateways failed/);
  });

  it("H2-TEST3c pinner redundancy: one provider down still succeeds but is flagged non-redundant; all down fails", async function () {
    const down = S.pinataPinner({ jwt: "bad-token", endpoint: pinata.url }); // 401
    const up = S.kuboPinner({ endpoint: kubo.url });
    const one = await S.pinDocument(doc, [down, up]);
    expect(one.redundant).to.equal(false);
    expect(one.failed.map((f) => f.pinner)).to.deep.equal(["pinata"]);
    let msg = "";
    try { await S.pinDocument(doc, [down]); } catch (e) { msg = e.message; }
    expect(msg).to.match(/All IPFS pinners failed/);
  });

  it("H2-TEST3d providers disagreeing on the CID of identical bytes are refused", async function () {
    const liar = { name: "liar", pin: async () => "bafkreiliarliarliarliarliarliarliarliarliarliarliarliarliar" };
    const ok = S.kuboPinner({ endpoint: kubo.url });
    let msg = "";
    try { await S.pinDocument(doc, [ok, liar]); } catch (e) { msg = e.message; }
    expect(msg).to.match(/different CIDs/);
  });

  it("H2-TEST4 scale: 10,000 labels - size and verification time", async function () {
    const many = Array.from({ length: 10000 }, (_, i) => (BigInt(i + 1) * 98765432123456789n).toString());
    const t0 = Date.now();
    const r = (await M.buildAspTree(many.map(BigInt))).root();
    const big = S.buildDocument({ chainId: 46630, register: "0xabcdef", root: r, depth: 20, labels: many });
    const bytes = S.canonical(big).length;
    const v = await S.verifyDocument(big, r, M);
    const ms = Date.now() - t0;
    console.log(`      10,000 labels: ${(bytes / 1024).toFixed(0)} KiB document, build+verify in node: ${ms} ms`);
    expect(v.labels.length).to.equal(10000);
    expect(bytes).to.be.lessThan(1024 * 1024);
  });

  it("raw CIDs are deterministic and content-addressed", function () {
    const a = S.rawCid(Buffer.from("hello")), b = S.rawCid(Buffer.from("hello")), c = S.rawCid(Buffer.from("hellO"));
    expect(a).to.equal(b);
    expect(a).to.not.equal(c);
    expect(a).to.match(/^bafkrei[a-z2-7]+$/); // CIDv1 raw + sha2-256 always starts with this prefix
  });
});
