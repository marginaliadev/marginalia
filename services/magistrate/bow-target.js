// Adapter that lets the existing MagistrateService (screening, audit log, IPFS pinning, rate limit, idempotence) publish to a 0xbow
// Entrypoint instead of our own MagistrateRegister. The service itself is unchanged: it talks to a "pool", a "register" and "M"
// (the SDK helpers), and this file provides those three with the 0xbow shapes behind them.
//
//   pool      Deposited / Ragequit events of a 0xbow pool (argument names carry a leading underscore there)
//   register  Entrypoint.latestRoot() (reverts before the first root: treated as 0) and Entrypoint.updateRoot(root, cid)
//   M         builds the ASP tree as the SAME lean tree the 0xbow SDK builds (lib/bow/lean-imt.js, known-answer tested)
//
// Two upstream rules shape this adapter (migration plan, section 5):
//   - only the LATEST root is accepted by the pool, so every publication invalidates proofs in flight: keep the service's rate limit;
//   - the CID string must be 32..64 bytes: the bare CID is stored, not "ipfs://<cid>" (a CIDv1 is 59 characters).
const { ethers } = require("ethers");
const { leanRoot } = require("../../lib/bow/lean-imt");

const ENTRY_ABI = [
  "function latestRoot() view returns (uint256)",
  "function updateRoot(uint256 root, string cid) returns (uint256)",
];
const POOL_ABI = [
  "event Deposited(address indexed _depositor, uint256 _commitment, uint256 _label, uint256 _value, uint256 _precommitmentHash)",
  "event Ragequit(address indexed _ragequitter, uint256 _commitment, uint256 _label, uint256 _value)",
];

function createBowTarget({ entrypoint, pool, logsProvider, wallet, M }) {
  const entry = new ethers.Contract(entrypoint, ENTRY_ABI, wallet);
  const poolC = new ethers.Contract(pool, POOL_ABI, logsProvider || wallet.provider);

  const poolView = {
    filters: { Deposited: () => ({ kind: "Deposited" }), Ragequit: () => ({ kind: "Ragequit" }) },
    async queryFilter(f, from, to) {
      const evs = await poolC.queryFilter(poolC.filters[f.kind](), from, to);
      return evs.map((ev) => ({
        blockNumber: ev.blockNumber,
        index: ev.index,
        args: f.kind === "Deposited"
          ? { label: ev.args._label, depositor: ev.args._depositor, value: ev.args._value }
          : { label: ev.args._label },
      }));
    },
  };

  const register = {
    async latestRoot() {
      try { return await entry.latestRoot(); }
      catch (e) { if (e.code === "CALL_EXCEPTION") return 0n; throw e; } // NoRootsAvailable before the first publication
    },
    "publishRoot(uint256,string)": (root, uri) => entry.updateRoot(root, String(uri).replace(/^ipfs:\/\//, "")),
    getAddress: () => entry.getAddress(),
    runner: wallet,
  };

  let hasher = null;
  const bowM = {
    // the document's "depth" is the maximum depth of the 0xbow tree; the real depth is ceil(log2(labels))
    ASP_DEPTH: 32,
    async buildAspTree(labels) {
      hasher = hasher || (await M.hasher());
      const { root } = leanRoot(labels, (a, b) => hasher([a, b]));
      return { root: () => root };
    },
  };

  return { pool: poolView, register, M: bowM };
}

module.exports = { createBowTarget, ENTRY_ABI, POOL_ABI };
