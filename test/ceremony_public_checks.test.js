// Public checks around the ceremony (plan B1 section 7 / B2, runbook B5 section 3):
// the Phase-1 multi-origin cross-check and the on-chain verifier bytecode comparison.
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { expect } = require("chai");
const P1 = require("../scripts/ceremony/phase1-check");
const V = require("../scripts/ceremony/check-deployed-verifier");

const ROOT = path.join(__dirname, "..");
const run = (args) => spawnSync(process.execPath, [path.join(ROOT, "scripts/ceremony/phase1-check.js"), ...args], { encoding: "utf8" });

describe("Phase-1 cross-check (B2)", function () {
  let dir, good, bad, pinFile;
  before(function () {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "marginalia-p1-"));
    good = path.join(dir, "good.ptau"); bad = path.join(dir, "bad.ptau");
    const bytes = crypto.randomBytes(4096);
    fs.writeFileSync(good, bytes);
    const tampered = Buffer.from(bytes); tampered[100] ^= 1; fs.writeFileSync(bad, tampered);
    pinFile = path.join(dir, "phase1.json");
    fs.writeFileSync(pinFile, JSON.stringify({
      file: "x.ptau", sizeBytes: 4096, status: "PROVISIONAL: test",
      blake2b: crypto.createHash("blake2b512").update(bytes).digest("hex"),
      sources: [{ name: "pub", url: "https://github.com/iden3/snarkjs#7-prepare-phase-2", checkedOn: "2026-10-11" }],
    }, null, 2));
  });

  it("a matching origin is recorded with --write; a one-bit change is a MISMATCH, exits non-zero and is never written", function () {
    const ok = run(["--pin", pinFile, "--file", good, "--by", "Tester", "--write"]);
    expect(ok.status, ok.stdout + ok.stderr).to.equal(0);
    expect(ok.stdout).to.include("MATCH");
    const pin = JSON.parse(fs.readFileSync(pinFile, "utf8"));
    expect(pin.downloads).to.have.length(1);
    expect(pin.downloads[0]).to.include({ origin: good, by: "Tester" });
    expect(pin.status).to.match(/^PROVISIONAL/); // never auto-promoted

    const no = run(["--pin", pinFile, "--file", bad, "--write"]);
    expect(no.status).to.equal(1);
    expect(no.stdout).to.include("MISMATCH");
    expect(JSON.parse(fs.readFileSync(pinFile, "utf8")).downloads).to.have.length(1);
  });

  it("evidence counts publications, download hosts and people separately", function () {
    const ev = P1.evidence({
      sources: [{ url: "https://github.com/iden3/snarkjs#a" }, { url: "https://github.com/iden3/snarkjs#b" }],
      downloads: [
        { origin: "https://storage.googleapis.com/zkevm/ptau/f.ptau", by: "Ana" },
        { origin: "https://hermez.s3-eu-west-1.amazonaws.com/f.ptau", by: "ana " },
        { origin: "https://hermez.s3-eu-west-1.amazonaws.com/f.ptau", by: "Bimo" },
      ],
    });
    expect(ev).to.deep.equal({ publications: 1, downloadHosts: 2, people: 2 });
  });

  it("the repository pin is internally consistent", function () {
    const pin = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/ceremony/phase1.json"), "utf8"));
    expect(pin.blake2b).to.match(/^[0-9a-f]{128}$/);
    expect(pin.sizeBytes).to.equal(37831832);
    expect(P1.KNOWN_ORIGINS.every((u) => u.endsWith(pin.file))).to.equal(true);
  });
});

describe("Deployed verifier bytecode check (B5)", function () {
  // a compiled snarkjs verifier if the artifacts exist, else a synthetic runtime with real-shaped CBOR metadata
  const art = path.join(ROOT, "artifacts/contracts/Groth16Verifier.sol/Groth16Verifier.json");
  const meta = "a264697066735822" + "11".repeat(34) + "64736f6c6343" + "000818" + "0033";
  const compiled = fs.existsSync(art) ? JSON.parse(fs.readFileSync(art, "utf8")).deployedBytecode : "0x6080604052348015600f57600080fd5b50" + meta;

  it("splits the CBOR metadata off real Solidity output", function () {
    const s = V.splitMetadata(compiled);
    expect(s.metadata).to.match(/^a2/);
    expect(s.code.length).to.be.greaterThan(10);
    expect(s.code + s.metadata).to.equal(compiled.toLowerCase().replace(/^0x/, ""));
  });

  it("identical code passes; changed metadata is reported but the code still matches; a changed opcode fails", function () {
    expect(V.compareBytecode(compiled, compiled)).to.include({ identical: true, codeMatches: true });

    const { code, metadata } = V.splitMetadata(compiled);
    const otherMeta = metadata.slice(0, 20) + (metadata[20] === "0" ? "1" : "0") + metadata.slice(21);
    const r1 = V.compareBytecode("0x" + code + otherMeta, compiled);
    expect(r1).to.include({ identical: false, codeMatches: true, metadataMatches: false });

    const tampered = code.slice(0, 40) + (code[40] === "0" ? "1" : "0") + code.slice(41);
    const r2 = V.compareBytecode("0x" + tampered + metadata, compiled);
    expect(r2.codeMatches).to.equal(false);
    expect(r2.reason).to.include("DIFFERS");
  });

  it("an address with no code fails", function () {
    expect(V.compareBytecode("0x", compiled)).to.include({ identical: false, codeMatches: false });
  });
});

describe("Ceremony status page hardening", function () {
  const page = fs.readFileSync(path.join(ROOT, "frontend/src/app/ceremony/page.tsx"), "utf8");
  it("renders external links only through the https-only validator", function () {
    expect(page).to.include("const safeHttpUrl");
    expect(page).to.not.match(/href=\{r\.attestation\}|href=\{data\.beacon\.announcement\}|href=\{s\.url\}/);
    expect((page.match(/safeHttpUrl\(/g) || []).length).to.be.at.least(6);
  });
  it("the public status never exports free-text reasons", function () {
    const coord = fs.readFileSync(path.join(ROOT, "scripts/ceremony/coordinator.js"), "utf8");
    expect(coord).to.not.match(/reason: e\.event === "skipped"/);
  });
});
