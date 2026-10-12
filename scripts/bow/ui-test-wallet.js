// TEST-ONLY wallet server for driving the /pool page in a browser without MetaMask. NOT part of the product and never deployed.
// Usage: MOCK_WALLET_KEY=<testnet key> MOCK_RPC=<testnet rpc> node scripts/bow/ui-test-wallet.js   (listens on 127.0.0.1:8790 only)
// The page under test must be BUILT with NEXT_PUBLIC_RH_TESTNET_RPC_URL=http://127.0.0.1:8790 so that its CSP allows this origin, and
// window.ethereum must be a thin EIP-1193 shim that POSTs JSON-RPC to it (docs/bow_migration.md, section 8).
// Signs and sends with the key in MOCK_WALLET_KEY (process environment only), forwards every other JSON-RPC call to MOCK_RPC.
const http = require("http");
const { ethers } = require("ethers");

const provider = new ethers.JsonRpcProvider(process.env.MOCK_RPC, 46630, { staticNetwork: true });
const wallet = new ethers.Wallet(process.env.MOCK_WALLET_KEY, provider);
let nextId = 1;

async function rpc(method, params) {
  const r = await fetch(process.env.MOCK_RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }) });
  const j = await r.json();
  if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code, data: j.error.data });
  return j.result;
}

async function handle({ method, params }) {
  switch (method) {
    case "eth_requestAccounts":
    case "eth_accounts": return [wallet.address];
    case "eth_chainId": return "0xb626";
    case "wallet_switchEthereumChain": return null;
    case "eth_signTypedData_v4": {
      const td = JSON.parse(params[1]);
      const types = { ...td.types }; delete types.EIP712Domain;
      return wallet.signTypedData(td.domain, types, td.message);
    }
    case "eth_sendTransaction": {
      const t = params[0];
      const tx = await wallet.sendTransaction({ to: t.to, data: t.data, value: t.value ? BigInt(t.value) : undefined });
      return tx.hash;
    }
    default: return rpc(method, params);
  }
}

http.createServer(async (req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const one = async (b) => { try { return { jsonrpc: "2.0", id: b.id ?? 1, result: await handle(b) }; } catch (e) { return { jsonrpc: "2.0", id: b.id ?? 1, error: { code: e.code || -32000, message: String(e.shortMessage || e.message).slice(0, 300), data: e.data } }; } };
    const out = Array.isArray(body) ? await Promise.all(body.map(one)) : await one(body);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(out));
  } catch (e) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: String(e.message).slice(0, 200) }));
  }
}).listen(8790, "127.0.0.1", () => console.log("mock wallet on 8790 for " + wallet.address));
