// Approved-label (ASP) list storage on IPFS (Fase 03 / H2).
//
// The Magistrate publishes   register.publishRoot(root, "ipfs://<cid>")   and the list itself lives on IPFS.
// Integrity does NOT depend on IPFS or on any gateway: whoever reads a document recomputes the Merkle root of its labels
// and requires it to equal the root the Magistrate published on-chain. A wrong, truncated or tampered document can never
// be used, no matter which gateway served it.
//
// Document format (version 1):
//   { version: 1, chainId, register, root, depth, labels: ["<decimal>", ...], generatedAt, prevCid }
const crypto = require("crypto");

const DOC_VERSION = 1;
const DEFAULT_GATEWAYS = ["https://ipfs.io/ipfs/", "https://dweb.link/ipfs/", "https://cloudflare-ipfs.com/ipfs/"];

// ---------------------------------------------------------------- document
function buildDocument({ chainId, register, root, depth, labels, prevCid = null, now = new Date() }) {
  return {
    version: DOC_VERSION,
    chainId: Number(chainId),
    register: String(register).toLowerCase(),
    root: root.toString(),
    depth: Number(depth),
    labels: labels.map((l) => l.toString()),
    generatedAt: now.toISOString(),
    prevCid,
  };
}

/** Throws unless `doc` is well formed. Does not check the root (see verifyDocument). */
function validateShape(doc) {
  if (!doc || typeof doc !== "object") throw new Error("ASP document is not an object");
  if (doc.version !== DOC_VERSION) throw new Error(`Unsupported ASP document version ${doc.version}`);
  if (!Array.isArray(doc.labels)) throw new Error("ASP document has no labels array");
  if (!/^\d{1,78}$/.test(String(doc.root))) throw new Error("ASP document root is not a decimal integer");
  const seen = new Set();
  for (const l of doc.labels) {
    if (typeof l !== "string" || !/^\d{1,78}$/.test(l)) throw new Error("ASP document contains a malformed label");
    if (seen.has(l)) throw new Error("ASP document contains a duplicate label");
    seen.add(l);
  }
}

/**
 * Full verification: shape, then recompute the Merkle root from the labels and compare with BOTH the document's own claim
 * and the root the chain published (`expectedRoot`). `M` is lib/marginalia.js.
 */
async function verifyDocument(doc, expectedRoot, M) {
  validateShape(doc);
  const tree = await M.buildAspTree(doc.labels.map(BigInt));
  const computed = tree.root();
  if (computed.toString() !== String(doc.root)) throw new Error("ASP document root does not match its own labels");
  if (expectedRoot !== undefined && expectedRoot !== null && computed !== BigInt(expectedRoot)) {
    throw new Error("ASP document root does not match the root published on-chain");
  }
  return { labels: doc.labels.map(BigInt), root: computed };
}

// ---------------------------------------------------------------- CIDs
const B32 = "abcdefghijklmnopqrstuvwxyz234567";
function base32(buf) {
  let bits = 0, value = 0, out = "";
  for (const b of buf) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
/** CIDv1 (raw codec, sha2-256) of some bytes. Providers may return a different (dag-pb) CID for the same bytes; both work. */
function rawCid(bytes) {
  const digest = crypto.createHash("sha256").update(bytes).digest();
  return "b" + base32(Buffer.concat([Buffer.from([0x01, 0x55, 0x12, 0x20]), digest]));
}
const canonical = (doc) => Buffer.from(JSON.stringify(doc), "utf8");

// ---------------------------------------------------------------- pinners
/** Pinata: POST /pinning/pinFileToIPFS with a JWT (PINATA_JWT). */
function pinataPinner({ jwt, endpoint = "https://api.pinata.cloud", timeoutMs = 20000 } = {}) {
  return {
    name: "pinata",
    async pin(bytes) {
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: "application/json" }), "asp.json");
      form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));
      const r = await fetch(`${endpoint}/pinning/pinFileToIPFS`, { method: "POST", headers: { Authorization: `Bearer ${jwt}` }, body: form, signal: AbortSignal.timeout(timeoutMs) });
      if (!r.ok) throw new Error(`pinata HTTP ${r.status}`);
      const j = await r.json();
      if (!j.IpfsHash) throw new Error("pinata returned no IpfsHash");
      return j.IpfsHash;
    },
  };
}

/** Any Kubo-compatible RPC (own node, Filebase, ...): POST /api/v0/add?pin=true&cid-version=1. */
function kuboPinner({ endpoint, authorization, timeoutMs = 20000 } = {}) {
  return {
    name: "kubo",
    async pin(bytes) {
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: "application/json" }), "asp.json");
      const headers = authorization ? { Authorization: authorization } : {};
      const r = await fetch(`${endpoint}/api/v0/add?pin=true&cid-version=1`, { method: "POST", headers, body: form, signal: AbortSignal.timeout(timeoutMs) });
      if (!r.ok) throw new Error(`kubo HTTP ${r.status}`);
      const j = await r.json();
      if (!j.Hash) throw new Error("kubo returned no Hash");
      return j.Hash;
    },
  };
}

/** Pinners configured from the environment (PINATA_JWT, IPFS_RPC_URL [+ IPFS_RPC_AUTH]). */
function pinnersFromEnv(env = process.env) {
  const out = [];
  if (env.PINATA_JWT) out.push(pinataPinner({ jwt: env.PINATA_JWT }));
  if (env.IPFS_RPC_URL) out.push(kuboPinner({ endpoint: env.IPFS_RPC_URL, authorization: env.IPFS_RPC_AUTH }));
  return out;
}

/**
 * Pin the document with EVERY pinner. Succeeds if at least one accepts it; `redundant` is false when only one did, so the
 * caller can alarm. All CIDs returned must agree, otherwise a provider is altering content and we refuse.
 */
async function pinDocument(doc, pinners) {
  if (!pinners.length) throw new Error("No IPFS pinner configured (set PINATA_JWT and/or IPFS_RPC_URL)");
  const bytes = canonical(doc);
  const settled = await Promise.allSettled(pinners.map((p) => p.pin(bytes)));
  const ok = [], failed = [];
  settled.forEach((s, i) => (s.status === "fulfilled" ? ok.push({ pinner: pinners[i].name, cid: s.value }) : failed.push({ pinner: pinners[i].name, error: String(s.reason?.message || s.reason) })));
  if (!ok.length) throw new Error("All IPFS pinners failed: " + failed.map((f) => `${f.pinner}: ${f.error}`).join("; "));
  const cids = new Set(ok.map((o) => o.cid));
  if (cids.size > 1) throw new Error("IPFS pinners returned different CIDs for the same bytes: " + [...cids].join(", "));
  return { cid: ok[0].cid, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), pinnedBy: ok.map((o) => o.pinner), failed, redundant: ok.length >= 2 };
}

// ---------------------------------------------------------------- fetch
const stripScheme = (cid) => String(cid).replace(/^ipfs:\/\//, "").replace(/^\/+/, "");

/** Fetch a document by CID, trying each gateway in order. Returns the parsed JSON (NOT yet verified). */
async function fetchDocument(cidOrUri, { gateways = DEFAULT_GATEWAYS, timeoutMs = 8000, maxBytes = 25 * 1024 * 1024 } = {}) {
  const cid = stripScheme(cidOrUri);
  if (!/^[a-zA-Z0-9]{20,120}$/.test(cid)) throw new Error("Invalid CID");
  const errors = [];
  for (const g of gateways) {
    try {
      const r = await fetch(g.replace(/\/?$/, "/") + cid, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const len = Number(r.headers.get("content-length") || 0);
      if (len > maxBytes) throw new Error("document too large");
      const text = await r.text();
      if (text.length > maxBytes) throw new Error("document too large");
      return JSON.parse(text);
    } catch (e) {
      errors.push(`${g}: ${e.message}`);
    }
  }
  throw new Error("All IPFS gateways failed: " + errors.join(" | "));
}

/** fetch + verify against the on-chain root. The only entry point consumers should use. */
async function loadVerified(cidOrUri, expectedRoot, M, opts) {
  const doc = await fetchDocument(cidOrUri, opts);
  return verifyDocument(doc, expectedRoot, M);
}

module.exports = {
  DOC_VERSION, DEFAULT_GATEWAYS,
  buildDocument, validateShape, verifyDocument,
  rawCid, canonical,
  pinataPinner, kuboPinner, pinnersFromEnv, pinDocument,
  fetchDocument, loadVerified, stripScheme,
};
