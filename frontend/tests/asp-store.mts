// Exercises the server-side reader (frontend/src/lib/aspStore.ts) against local mock gateways; prints JSON for the mocha wrapper.
import http from "node:http";
import { parseAspDocument, fetchAspDocument, cidFromUri } from "../src/lib/aspStore.ts";

const listen = (h: http.RequestListener) => new Promise<{ s: http.Server; url: string }>((r) => { const s = http.createServer(h); s.listen(0, "127.0.0.1", () => r({ s, url: `http://127.0.0.1:${(s.address() as any).port}/ipfs/` })); });
const CID = "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const doc = { version: 1, root: "123", labels: ["1", "2", "3"] };
const out: any = {};

const good = await listen((req, res) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(doc)); });
const broken = await listen((req, res) => { res.statusCode = 500; res.end(); });
const hanging = await listen(() => {});

out.fallback = (await fetchAspDocument("ipfs://" + CID, [broken.url, hanging.url, good.url], 600)).labels;
try { await fetchAspDocument(CID, [broken.url], 500); out.allDown = "no error"; } catch (e: any) { out.allDown = e.message; }

const bad = [{ ...doc, version: 2 }, { ...doc, labels: ["1", "1"] }, { ...doc, labels: ["x"] }, { ...doc, labels: ["1".repeat(90)] }, { ...doc, root: "0xdead" }, { ...doc, labels: "no" }, null];
out.badRejected = bad.map((d) => { try { parseAspDocument(d); return false; } catch { return true; } });
out.goodParsed = parseAspDocument(doc).map(String);
try { cidFromUri("ipfs://../../etc/passwd"); out.traversal = "accepted"; } catch (e: any) { out.traversal = "rejected"; }
[good, broken, hanging].forEach((x) => x.s.close());
console.log(JSON.stringify(out));
process.exit(0);
