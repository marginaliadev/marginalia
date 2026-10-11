#!/usr/bin/env node
// Is the verifier ON CHAIN the one exported from the ceremony? (runbook B5 section 3, public guide docs/ceremony/VERIFY.md)
// Compares the runtime bytecode at an address with the compiled `deployedBytecode` of contracts/<Contract>.sol.
// The trailing Solidity CBOR metadata (which only encodes source/compiler hashes) is compared separately and reported, not ignored.
//
//   npx hardhat compile        (or USE_SOLCJS=1 npx hardhat compile offline)
//   node scripts/ceremony/check-deployed-verifier.js --rpc https://rpc.example --address 0x... --contract Groth16Verifier
//
// Exit 0 = identical code. Snarkjs verifiers have no immutables or libraries, so nothing else may differ.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");

/** Split runtime bytecode into (code, metadata). Solidity appends CBOR metadata whose length is the final 2 bytes. */
function splitMetadata(hex) {
  const h = String(hex).toLowerCase().replace(/^0x/, "");
  if (h.length < 4) return { code: h, metadata: "" };
  const len = parseInt(h.slice(-4), 16);
  const metaHexLen = (len + 2) * 2;
  if (!Number.isFinite(len) || metaHexLen > h.length || len === 0) return { code: h, metadata: "" };
  const meta = h.slice(-metaHexLen);
  // CBOR map with 1-3 entries starting with "ipfs"/"bzzr"/"solc" keys: a2 64 / a3 64 / a1 64
  if (!/^a[1-3]6[45]/.test(meta)) return { code: h, metadata: "" };
  return { code: h.slice(0, -metaHexLen), metadata: meta };
}

function compareBytecode(onchain, compiled) {
  const a = splitMetadata(onchain), b = splitMetadata(compiled);
  if (!a.code) return { identical: false, codeMatches: false, metadataMatches: false, reason: "no code at this address" };
  const codeMatches = a.code === b.code;
  const metadataMatches = a.metadata === b.metadata;
  return { identical: codeMatches && metadataMatches, codeMatches, metadataMatches, reason: codeMatches ? (metadataMatches ? "identical" : "same executable code; metadata differs (different source path/compiler settings)") : "EXECUTABLE CODE DIFFERS" };
}

async function getCode(rpc, address) {
  const res = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [address, "latest"] }) });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
  return j.result;
}

async function main(argv) {
  const opt = (n) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : undefined; };
  const contract = opt("contract"), address = opt("address"), rpc = opt("rpc");
  if (!contract || !address || !rpc) {
    console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 9).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
    return 2;
  }
  const art = path.join(ROOT, "artifacts", "contracts", `${contract}.sol`, `${contract}.json`);
  if (!fs.existsSync(art)) throw new Error(`no artifact ${path.relative(ROOT, art)}: run \`npx hardhat compile\` first`);
  const compiled = JSON.parse(fs.readFileSync(art, "utf8")).deployedBytecode;
  const onchain = await getCode(rpc, address);
  const r = compareBytecode(onchain, compiled);
  console.log(`${contract} at ${address}: ${r.reason}`);
  console.log(`  executable code: ${r.codeMatches ? "MATCH" : "DIFFERENT"} · metadata: ${r.metadataMatches ? "MATCH" : "different"}`);
  return r.codeMatches ? 0 : 1;
}

if (require.main === module) main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(e.message); process.exit(1); });
module.exports = { splitMetadata, compareBytecode };
