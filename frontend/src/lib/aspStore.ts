// Read side of the IPFS approved-label lists (mirrors lib/aspStore.js, which also pins). Fase 03 / H2.
// Integrity never depends on a gateway: the caller recomputes the Merkle root of the labels and compares it with the root
// the Magistrate published on-chain (see loadVerifiedAsp in folio.ts).

export const DEFAULT_GATEWAYS = ["https://gateway.pinata.cloud/ipfs/", "https://ipfs.io/ipfs/", "https://dweb.link/ipfs/"];
const MAX_BYTES = 25 * 1024 * 1024;

export function gatewaysFromEnv(): string[] {
  const env = process.env.ASP_IPFS_GATEWAYS;
  return env ? env.split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_GATEWAYS;
}

/** Validates the document shape and returns its labels. Throws on anything unexpected. */
export function parseAspDocument(doc: any): bigint[] {
  if (!doc || typeof doc !== "object") throw new Error("ASP document is not an object");
  if (doc.version !== 1) throw new Error(`Unsupported ASP document version ${doc.version}`);
  if (!Array.isArray(doc.labels)) throw new Error("ASP document has no labels array");
  if (!/^\d{1,78}$/.test(String(doc.root))) throw new Error("ASP document root is not a decimal integer");
  const seen = new Set<string>();
  for (const l of doc.labels) {
    if (typeof l !== "string" || !/^\d{1,78}$/.test(l)) throw new Error("ASP document contains a malformed label");
    if (seen.has(l)) throw new Error("ASP document contains a duplicate label");
    seen.add(l);
  }
  return doc.labels.map((l: string) => BigInt(l));
}

export function cidFromUri(uri: string): string {
  const cid = uri.replace(/^ipfs:\/\//, "").replace(/^\/+/, "");
  if (!/^[a-zA-Z0-9]{20,120}$/.test(cid)) throw new Error("Invalid CID");
  return cid;
}

/** Fetch a document by CID, trying each gateway in turn. The result is NOT yet verified against the chain. */
export async function fetchAspDocument(uri: string, gateways = gatewaysFromEnv(), timeoutMs = 12000): Promise<any> {
  const cid = cidFromUri(uri);
  const errors: string[] = [];
  for (const g of gateways) {
    try {
      const r = await fetch(g.replace(/\/?$/, "/") + cid, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      if (Number(r.headers.get("content-length") || 0) > MAX_BYTES) throw new Error("document too large");
      const text = await r.text();
      if (text.length > MAX_BYTES) throw new Error("document too large");
      return JSON.parse(text);
    } catch (e: any) {
      errors.push(`${g}: ${e.message}`);
    }
  }
  throw new Error("All IPFS gateways failed: " + errors.join(" | "));
}

export async function loadAspLabelsFromIpfs(uri: string): Promise<bigint[]> {
  return parseAspDocument(await fetchAspDocument(uri));
}
