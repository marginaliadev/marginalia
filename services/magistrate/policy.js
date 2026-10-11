// Screening policy for the automated Magistrate (Fase 03 / H1-T1).
// A policy is any object with  screen(deposit) -> { decision: "APPROVE" | "DENY", reason }  (sync or async).
// Default policy: depositor address on a denylist -> DENY. External screening APIs plug in by implementing the same method.

/** Parse a denylist from env-style input: comma/newline separated addresses (0x...), '#' comments allowed. */
function parseDenylist(text) {
  return new Set(
    String(text || "")
      .split(/[\s,]+/)
      .map((s) => s.replace(/#.*$/, "").trim().toLowerCase())
      .filter((s) => /^0x[0-9a-f]{40}$/.test(s))
  );
}

/** Denylist loaded from env DENYLIST (inline), DENYLIST_FILE (path) and/or DENYLIST_URL (fetched every call, so edits apply live). */
function denylistPolicy({ inline = "", file = null, url = null, fs = require("fs"), fetchImpl = globalThis.fetch } = {}) {
  return {
    name: "denylist",
    async load() {
      let set = parseDenylist(inline);
      if (file && fs.existsSync(file)) for (const a of parseDenylist(fs.readFileSync(file, "utf8"))) set.add(a);
      if (url) {
        // Fail CLOSED on a configured but unreachable list: refusing to publish is safer than approving blindly.
        const r = await fetchImpl(url, { signal: AbortSignal.timeout(10000) });
        if (!r.ok) throw new Error(`denylist URL returned HTTP ${r.status}`);
        for (const a of parseDenylist(await r.text())) set.add(a);
      }
      return set;
    },
    async screenAll(deposits) {
      const deny = await this.load();
      return deposits.map((d) => (deny.has(String(d.depositor).toLowerCase())
        ? { decision: "DENY", reason: "depositor on denylist" }
        : { decision: "APPROVE", reason: "passed denylist" }));
    },
  };
}

// ---------------------------------------------------------------- OFAC SDN (digital currency addresses)
const DEFAULT_OFAC_URL = "https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/sanctioned_addresses_ETH.txt";

/**
 * Public OFAC sanctioned-address list (Ethereum addresses extracted from the Treasury SDN list).
 * Fails CLOSED: if the list cannot be fetched, the last good copy is used for up to `maxStaleMs`; beyond that the policy throws,
 * which stops publication instead of approving deposits that were never screened.
 */
function ofacPolicy({ url = DEFAULT_OFAC_URL, file = null, maxStaleMs = 24 * 3600_000, fetchImpl = globalThis.fetch, now = () => Date.now(), fs = require("fs"), log = () => {} } = {}) {
  let cache = null; // { set, at }
  if (file && fs.existsSync(file)) {
    try { const j = JSON.parse(fs.readFileSync(file, "utf8")); cache = { set: new Set(j.addresses), at: j.at }; } catch (_) {}
  }
  return {
    name: "ofac",
    async load() {
      try {
        const r = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const set = parseDenylist(await r.text());
        if (set.size === 0) throw new Error("list parsed to zero addresses (refusing to treat an empty list as clean)");
        cache = { set, at: now() };
        if (file) { try { fs.writeFileSync(file, JSON.stringify({ at: cache.at, addresses: [...set] })); } catch (_) {} }
      } catch (e) {
        if (cache && now() - cache.at <= maxStaleMs) log(`OFAC list fetch failed (${e.message}); using the cached copy from ${Math.round((now() - cache.at) / 60000)} min ago`);
        else throw new Error(`OFAC list unavailable and no fresh cache: ${e.message}`);
      }
      return cache.set;
    },
    async screenAll(deposits) {
      const set = await this.load();
      return deposits.map((d) => (set.has(String(d.depositor).toLowerCase())
        ? { decision: "DENY", reason: "address on the OFAC sanctions list" }
        : { decision: "APPROVE", reason: "not on the OFAC list" }));
    },
  };
}

// ---------------------------------------------------------------- Chainalysis free sanctions screening API
/**
 * Free Chainalysis "Sanctions Screening" API: GET {endpoint}{address} with X-API-Key; a non-empty `identifications` array = sanctioned.
 * Results are cached per address (a clean result for `cleanTtlMs`, a sanctioned result for good). Any API error is thrown:
 * an address that could not be screened is never approved.
 */
function chainalysisPolicy({ apiKey, endpoint = "https://public.chainalysis.com/api/v1/address/", fetchImpl = globalThis.fetch, now = () => Date.now(), cleanTtlMs = 6 * 3600_000, concurrency = 4 } = {}) {
  if (!apiKey) throw new Error("chainalysisPolicy needs an apiKey");
  const cache = new Map(); // address -> { verdict, at }
  async function screenOne(address) {
    const hit = cache.get(address);
    if (hit && (hit.verdict.decision === "DENY" || now() - hit.at < cleanTtlMs)) return hit.verdict;
    const r = await fetchImpl(endpoint + address, { headers: { "X-API-Key": apiKey, Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    if (r.status === 429) throw new Error("Chainalysis rate limit reached (will retry next tick)");
    if (!r.ok) throw new Error(`Chainalysis HTTP ${r.status}`);
    const j = await r.json();
    const ids = Array.isArray(j.identifications) ? j.identifications : null;
    if (ids === null) throw new Error("Chainalysis response has no identifications array");
    const verdict = ids.length > 0
      ? { decision: "DENY", reason: `Chainalysis sanctions: ${ids.map((i) => i.category || "sanctions").join(",")}` }
      : { decision: "APPROVE", reason: "not sanctioned (Chainalysis)" };
    cache.set(address, { verdict, at: now() });
    return verdict;
  }
  return {
    name: "chainalysis",
    async screenAll(deposits) {
      const unique = [...new Set(deposits.map((d) => String(d.depositor).toLowerCase()))];
      const out = new Map();
      for (let i = 0; i < unique.length; i += concurrency) {
        await Promise.all(unique.slice(i, i + concurrency).map(async (a) => out.set(a, await screenOne(a))));
      }
      return deposits.map((d) => out.get(String(d.depositor).toLowerCase()));
    },
  };
}

/** Run several policies; the first DENY wins (reasons are joined); if any policy throws, the whole screening throws (fail closed). */
function composePolicies(policies) {
  return {
    name: policies.map((p) => p.name || "policy").join("+"),
    async screenAll(deposits) {
      const results = [];
      for (const p of policies) results.push(await p.screenAll(deposits));
      return deposits.map((_, i) => {
        const denies = policies.map((p, k) => ({ p, v: results[k][i] })).filter((x) => x.v.decision === "DENY");
        return denies.length
          ? { decision: "DENY", reason: denies.map((x) => `${x.p.name || "policy"}: ${x.v.reason}`).join("; ") }
          : { decision: "APPROVE", reason: "passed " + policies.map((p) => p.name || "policy").join(", ") };
      });
    },
  };
}

module.exports = { parseDenylist, denylistPolicy, ofacPolicy, chainalysisPolicy, composePolicies, DEFAULT_OFAC_URL };
