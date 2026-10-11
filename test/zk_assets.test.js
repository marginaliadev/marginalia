// T18: the proving assets the browser downloads are pinned by hash, and the front end ships a CSP.
const fs = require("fs");
const path = require("path");
const { expect } = require("chai");
const { current, FILES } = require("../scripts/zk-hashes");

describe("Front end hardening (T18)", function () {
  it("committed hashes equal the proving assets in frontend/public/zk", function () {
    const src = fs.readFileSync(path.join(__dirname, "../frontend/src/lib/zk-hashes.ts"), "utf8");
    const saved = JSON.parse(src.replace(/^[\s\S]*?= /, "").replace(/;\s*$/, ""));
    const now = current();
    for (const f of FILES) expect(saved[f], f).to.equal(now[f]);
  });

  it("the browser prover refuses an asset whose hash differs (loader exists and is used for every circuit)", function () {
    const zk = fs.readFileSync(path.join(__dirname, "../frontend/src/lib/zk.ts"), "utf8");
    expect(zk).to.include("does not match its pinned hash");
    expect((zk.match(/memAsset\(/g) || []).length).to.be.at.least(4);
    expect(zk).to.not.match(/fullProve\([^)]*"\/zk\//);
  });

  it("next.config.ts sets a CSP without foreign script origins and without eval in production", function () {
    const cfg = fs.readFileSync(path.join(__dirname, "../frontend/next.config.ts"), "utf8");
    expect(cfg).to.include("Content-Security-Policy");
    expect(cfg).to.include("frame-ancestors 'none'");
    expect(cfg).to.include("object-src 'none'");
    expect(cfg).to.include("script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${dev ? \" 'unsafe-eval'\" : \"\"}");
  });
});
