// The 0xbow-route preflight must not be satisfiable by paperwork alone: sign-offs close only the manual gates,
// while the deployment record and the served proving assets are checked from the repository itself.
const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SIGNOFF = path.join(ROOT, "docs", "bow", "signoff.json");
const run = () => spawnSync(process.execPath, [path.join(ROOT, "scripts", "bow", "preflight.js")], { cwd: ROOT, encoding: "utf8", env: { ...process.env, SKIP_NETWORK: "1" } });

describe("0xbow route preflight", function () {
  this.timeout(60000);
  let saved = null;
  before(() => { if (fs.existsSync(SIGNOFF)) saved = fs.readFileSync(SIGNOFF); });
  after(() => { if (saved) fs.writeFileSync(SIGNOFF, saved); else fs.rmSync(SIGNOFF, { force: true }); });

  it("is NOT READY without sign-offs and exits 1", () => {
    fs.rmSync(SIGNOFF, { force: true });
    const r = run();
    expect(r.status).to.equal(1);
    expect(r.stdout).to.contain("NOT READY");
    expect(r.stdout).to.match(/NO-GO\s+S1/);
    expect(r.stdout).to.match(/GO\s+V1/);
  });

  it("an entry without evidence does not close a gate", () => {
    fs.mkdirSync(path.dirname(SIGNOFF), { recursive: true });
    fs.writeFileSync(SIGNOFF, JSON.stringify({ glueReview: { by: "someone", date: "2026-01-01" } }));
    expect(run().stdout).to.match(/NO-GO\s+S1/);
  });

  it("complete sign-offs close S1-S6 but cannot close the mainnet record or the served assets", () => {
    const e = { by: "tester", date: "2026-01-01", evidence: "x" };
    fs.writeFileSync(SIGNOFF, JSON.stringify({ glueReview: e, ceremonyProvenance: e, ownerDecision: e, linuxGate: e, rolesHandedOver: e, incidentDrill: e }));
    const r = run();
    expect(r.status).to.equal(1);
    for (const id of ["S1", "S2", "S3", "S4", "S5", "S6"]) expect(r.stdout).to.contain("GO     " + id + " ");
    expect(r.stdout).to.match(/NO-GO\s+D1/);
    expect(r.stdout).to.match(/NO-GO\s+A1/);
  });
});
