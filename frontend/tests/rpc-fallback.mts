// Run with: node --experimental-strip-types tests/rpc-fallback.mts  (prints JSON)
import http from "node:http";
import { rpcUrlList, buildProvider, PUBLIC_RPC } from "../src/lib/rpc.ts";

const live = http.createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    const q = JSON.parse(b);
    const one = (r: any) => ({ jsonrpc: "2.0", id: r.id, result: r.method === "eth_blockNumber" ? "0x7b" : r.method === "eth_chainId" ? "0xb626" : null });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(Array.isArray(q) ? q.map(one) : one(q)));
  });
});
await new Promise<void>((r) => live.listen(0, "127.0.0.1", () => r()));
const liveUrl = `http://127.0.0.1:${(live.address() as any).port}`;
const dead = "http://127.0.0.1:9"; // nothing listens here

const out: any = {
  list: rpcUrlList("https://a.example, https://b.example"),
  listEmpty: rpcUrlList(undefined),
  listDup: rpcUrlList(PUBLIC_RPC),
};
const t0 = Date.now();
const p = buildProvider([dead, liveUrl], 46630, 1500);
out.fallbackBlock = await p.getBlockNumber();
out.fallbackMs = Date.now() - t0;
out.primaryOnly = await buildProvider([liveUrl], 46630).getBlockNumber();
let deadOnly = "no error";
try { await buildProvider([dead], 46630).getBlockNumber(); } catch { deadOnly = "error"; }
out.deadOnly = deadOnly;
console.log(JSON.stringify(out));
live.close();
process.exit(0);
