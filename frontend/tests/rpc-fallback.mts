// Run with: node --experimental-strip-types tests/rpc-fallback.mts  (prints JSON)
import http from "node:http";
import { rpcUrlList, buildProvider, PUBLIC_RPC, scanInChunks } from "../src/lib/rpc.ts";

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
// eth_getLogs scanning: shrinks the range when an RPC refuses it, covers every block exactly once, honours the budget
const seen: number[] = [];
const capped = async (f: number, t: number) => { if (t - f + 1 > 25) throw new Error("range too large"); for (let b = f; b <= t; b++) seen.push(b); return [t]; };
await scanInChunks({ from: 1000, to: 1999, chunk: 100000, fetchRange: capped });
out.scan = { covered: seen.length, unique: new Set(seen).size, first: seen[0], last: seen[seen.length - 1] };
let calls = 0;
await scanInChunks({ from: 0, to: 99999, chunk: 100000, fetchRange: async () => { calls++; return []; } });
out.bigChunkCalls = calls;
let refused = "no error";
try { await scanInChunks({ from: 0, to: 100, chunk: 10, fetchRange: async () => { throw new Error("always refused"); } }); } catch (e: any) { refused = e.message; }
out.refused = refused;
let budget = "no error";
try { await scanInChunks({ from: 0, to: 1_000_000, chunk: 10, budgetMs: 50, budgetError: "over budget", fetchRange: async () => { await new Promise((r) => setTimeout(r, 20)); return []; } }); } catch (e: any) { budget = e.message; }
out.budget = budget;
console.log(JSON.stringify(out));
live.close();
process.exit(0);
