// Local stand-in for IPFS during development and drills: a Kubo-compatible /api/v0/add endpoint plus a gateway.
//   node services/magistrate/dev-ipfs.js [port=5599]      then:  IPFS_RPC_URL=http://127.0.0.1:5599  ASP_IPFS_GATEWAYS=http://127.0.0.1:5599/ipfs/
// NOT for production: content lives in a local folder and is only as available as this process.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { rawCid } = require("../../lib/aspStore");

const port = Number(process.argv[2] || process.env.DEV_IPFS_PORT || 5599);
const dir = process.env.DEV_IPFS_DIR || path.join(__dirname, "state", "dev-ipfs");
fs.mkdirSync(dir, { recursive: true });

http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url.startsWith("/api/v0/add")) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const fd = await new Response(Buffer.concat(chunks), { headers: { "content-type": req.headers["content-type"] } }).formData();
      const bytes = Buffer.from(await fd.get("file").arrayBuffer());
      const cid = rawCid(bytes);
      fs.writeFileSync(path.join(dir, cid), bytes);
      res.setHeader("content-type", "application/json");
      return res.end(JSON.stringify({ Name: "asp.json", Hash: cid, Size: String(bytes.length) }));
    }
    const m = req.url.match(/^\/ipfs\/([a-z0-9]{20,120})$/);
    if (req.method === "GET" && m && fs.existsSync(path.join(dir, m[1]))) {
      res.setHeader("content-type", "application/json");
      res.setHeader("access-control-allow-origin", "*");
      return res.end(fs.readFileSync(path.join(dir, m[1])));
    }
    res.statusCode = 404;
    res.end();
  } catch (e) { res.statusCode = 500; res.end(String(e.message)); }
}).listen(port, "127.0.0.1", () => console.log(`dev IPFS on http://127.0.0.1:${port} (dir ${dir})`));
