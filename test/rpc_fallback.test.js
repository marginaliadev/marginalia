// The server-side RPC provider falls back to the public RPC (frontend/src/lib/rpc.ts, run as TypeScript).
const path = require("path");
const { execFileSync } = require("child_process");
const { expect } = require("chai");

describe("RPC provider fallback", function () {
  this.timeout(60000);
  let r;
  before(function () {
    r = JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "tests/rpc-fallback.mts"], { cwd: path.join(__dirname, "..", "frontend"), encoding: "utf8" }));
  });

  it("appends the public RPC after the configured one(s), without duplicates", function () {
    expect(r.list).to.deep.equal(["https://a.example", "https://b.example", "https://rpc.testnet.chain.robinhood.com"]);
    expect(r.listEmpty).to.deep.equal(["https://rpc.testnet.chain.robinhood.com"]);
    expect(r.listDup).to.deep.equal(["https://rpc.testnet.chain.robinhood.com"]);
  });

  it("answers from the next provider when the first is unreachable", function () {
    expect(r.fallbackBlock).to.equal(123);
    expect(r.fallbackMs).to.be.lessThan(20000);
  });

  it("works with a single healthy provider and fails loudly when every provider is down", function () {
    expect(r.primaryOnly).to.equal(123);
    expect(r.deadOnly).to.equal("error");
  });
});
