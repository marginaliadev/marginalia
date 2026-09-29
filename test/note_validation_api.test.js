const { expect } = require("chai");
const http = require("http");
const app = require("../server");
const M = require("../lib/marginalia");
const { supabaseService } = require("../lib/supabase");

describe("MARGINALIA Secret Note Validation & Anti-Tamper Verification", function () {
  let server;
  let baseUrl;

  before(function (done) {
    server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      done();
    });
  });

  after(function (done) {
    server.close(done);
  });

  it("POST /api/note/prepare-deposit generates valid cryptographic parameters", async function () {
    const res = await fetch(`${baseUrl}/api/note/prepare-deposit`, { method: "POST" });
    expect(res.status).to.equal(200);
    const data = await res.json();
    expect(data.sk).to.be.a("string");
    expect(data.rho).to.be.a("string");
    expect(data.precommitment).to.be.a("string");

    const H = await M.hasher();
    const P = H([BigInt(data.sk)]);
    const pre = H([P, BigInt(data.rho)]);
    expect(pre.toString()).to.equal(data.precommitment);
  });

  it("POST /api/note/validate rejects notes with invalid prefix", async function () {
    const res = await fetch(`${baseUrl}/api/note/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "invalid-prefix-12345" }),
    });
    expect(res.status).to.equal(400);
    const data = await res.json();
    expect(data.valid).to.be.false;
    expect(data.error).to.include("Invalid Note Format");
  });

  it("POST /api/note/validate rejects notes with corrupted base64url data", async function () {
    const res = await fetch(`${baseUrl}/api/note/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "marginalia-note-v1-!@#$%^&*()_+" }),
    });
    expect(res.status).to.equal(400);
    const data = await res.json();
    expect(data.valid).to.be.false;
    expect(data.error).to.include("Invalid Note Format");
  });

  it("POST /api/note/validate rejects tampered secret notes where values/secrets do not match commitment", async function () {
    const secret = await M.newSecret();
    const val = 1000000000000000000n; // 1 ETH
    const label = 42n;
    const realCommitment = await M.commitmentOf(val, label, secret.precommitment);

    // Tampered note payload with altered value but old commitment
    const tamperedPayload = {
      sk: secret.sk.toString(),
      rho: secret.rho.toString(),
      value: (val + 1000n).toString(), // Altered value!
      label: label.toString(),
      commitment: realCommitment.toString(),
    };

    const tamperedNote = "marginalia-note-v1-" + Buffer.from(JSON.stringify(tamperedPayload)).toString("base64url");

    const res = await fetch(`${baseUrl}/api/note/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: tamperedNote }),
    });

    expect(res.status).to.equal(400);
    const data = await res.json();
    expect(data.valid).to.be.false;
    expect(data.error).to.include("Cryptographic Tampering Detected");
  });

  it("POST /api/note/validate rejects notes whose Wax Seal (nullifier) is already spent", async function () {
    const secret = await M.newSecret();
    const val = 500000000000000000n;
    const label = 77n;
    const commitment = await M.commitmentOf(val, label, secret.precommitment);
    const nullifier = await M.nullifierOf(secret.sk, secret.rho);

    // Mark nullifier as spent in DB
    await supabaseService.saveNullifier({
      nullifierHash: nullifier.toString(),
      spentType: "WITHDRAW",
      txHash: "0xprev",
    });

    const notePayload = {
      sk: secret.sk.toString(),
      rho: secret.rho.toString(),
      value: val.toString(),
      label: label.toString(),
      commitment: commitment.toString(),
    };
    const note = "marginalia-note-v1-" + Buffer.from(JSON.stringify(notePayload)).toString("base64url");

    const res = await fetch(`${baseUrl}/api/note/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });

    expect(res.status).to.equal(409);
    const data = await res.json();
    expect(data.valid).to.be.false;
    expect(data.error).to.include("Wax Seal Broken (Already Spent)");
  });

  it("POST /api/nullifier/check accurately reflects spent and unspent nullifiers", async function () {
    const spentHash = "999888777666555444333";
    await supabaseService.saveNullifier({ nullifierHash: spentHash });

    const check1 = await fetch(`${baseUrl}/api/nullifier/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nullifier: spentHash }),
    });
    const d1 = await check1.json();
    expect(d1.spent).to.be.true;

    const check2 = await fetch(`${baseUrl}/api/nullifier/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nullifier: "111222333444555666777" }),
    });
    const d2 = await check2.json();
    expect(d2.spent).to.be.false;
  });
});
