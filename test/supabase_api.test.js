const { expect } = require("chai");
const http = require("http");
const app = require("../server");
const { supabaseService } = require("../lib/supabase");

describe("MARGINALIA Supabase Persistence & REST API Layer", function () {
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

  describe("Supabase Repository Layer", function () {
    it("saves and retrieves Merkle leaves sequentially", async function () {
      await supabaseService.saveLeaf({
        index: 0,
        leaf: "1234567890",
        poolAddress: "0x1111111111111111111111111111111111111111",
        blockNumber: 100,
        txHash: "0xabc1",
      });

      await supabaseService.saveLeaf({
        index: 1,
        leaf: "9876543210",
        poolAddress: "0x1111111111111111111111111111111111111111",
        blockNumber: 101,
        txHash: "0xabc2",
      });

      const leaves = await supabaseService.getAllLeaves();
      expect(leaves.length).to.be.at.least(2);
      expect(leaves[0].leaf_commitment).to.equal("1234567890");
    });

    it("saves and queries deposit records with status filtering", async function () {
      await supabaseService.saveDeposit({
        label: "label-001",
        depositor: "0xAlice",
        commitment: "12345",
        value: "1000000000000000000",
        precommitment: "999",
        status: "APPROVED",
      });

      await supabaseService.saveDeposit({
        label: "label-002",
        depositor: "0xBob",
        commitment: "67890",
        value: "500000000000000000",
        precommitment: "888",
        status: "PENDING_SCREENING",
      });

      const approved = await supabaseService.getDeposits("APPROVED");
      expect(approved.some((d) => d.label === "label-001")).to.be.true;
    });

    it("saves and checks spent nullifiers to prevent double-spends", async function () {
      const nullifier = "0xNullifierTest_" + Date.now();
      expect(await supabaseService.isNullifierSpent(nullifier)).to.be.false;

      await supabaseService.saveNullifier({
        nullifierHash: nullifier,
        spentType: "WITHDRAW",
        spentBlock: 105,
      });

      expect(await supabaseService.isNullifierSpent(nullifier)).to.be.true;
    });

    it("manages relayer queue jobs lifecycle", async function () {
      const job = await supabaseService.createRelayerJob({
        recipient: "0xRecipient",
        relayerAddress: "0xRelayer",
        fee: "10000000000000000",
        nullifierHash: "0xNulTestJob",
      });

      expect(job.status).to.equal("QUEUED");

      const updated = await supabaseService.updateRelayerJob(job.id, {
        status: "CONFIRMED",
        tx_hash: "0xFinalTxHash",
      });

      expect(updated.status).to.equal("CONFIRMED");
      expect(updated.tx_hash).to.equal("0xFinalTxHash");
    });
  });

  describe("HTTP REST API Endpoints", function () {
    it("GET /api/health returns service health status", async function () {
      const res = await fetch(`${baseUrl}/api/health`);
      expect(res.status).to.equal(200);
      const json = await res.json();
      expect(json.status).to.equal("ok");
      expect(json.service).to.equal("marginalia-api");
    });

    it("GET /api/status returns network and pool metrics", async function () {
      const res = await fetch(`${baseUrl}/api/status`);
      expect(res.status).to.equal(200);
      const json = await res.json();
      expect(json.chainId).to.equal(46630);
      expect(json.totalLeaves).to.be.a("number");
    });

    it("POST /api/relay/quote provides dynamic gas and fee quote", async function () {
      const res = await fetch(`${baseUrl}/api/relay/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gasPriceGwei: "3" }),
      });

      expect(res.status).to.equal(200);
      const json = await res.json();
      expect(json.estimatedGas).to.equal("1150000");
      expect(json.minFeeEth).to.be.a("string");
    });

    it("POST /api/relay/withdraw relays withdrawal and rejects double-spend", async function () {
      const nullifier = "0xUniqueNullifier" + Date.now();
      const payload = {
        withdrawal: {
          recipient: "0xBobAddress",
          relayer: "0xRelayerAddress",
          fee: "10000000000000000",
        },
        proof: {
          pubSignals: ["1000000", "0xState", "0xAsp", "0xContext", nullifier, "0xNewCm"],
        },
      };

      // 1. First submission succeeds
      const res1 = await fetch(`${baseUrl}/api/relay/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      expect(res1.status).to.equal(200);
      const json1 = await res1.json();
      expect(json1.success).to.be.true;
      expect(json1.jobId).to.be.a("string");

      // 2. Second submission with identical nullifier is rejected with 409 Conflict
      const res2 = await fetch(`${baseUrl}/api/relay/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      expect(res2.status).to.equal(409);
      const json2 = await res2.json();
      expect(json2.error).to.include("already spent");
    });
  });
});
