// Fase 04 / D-TEST6 (guard side): a development setup can never be deployed to mainnet (chainId 4663).
const { expect } = require("chai");
const { ceremonyProblems, assertCeremonyBeforeMainnet, MIN_CONTRIBUTORS } = require("../scripts/ceremony/mainnet-guard");
const { hashText } = require("../scripts/ceremony/lib");

const PTAU = "ab".repeat(64);
const SRC = { withdraw: "// withdraw verifier", ragequit: "// ragequit verifier" };

function goodTranscript(circuit, n = MIN_CONTRIBUTORS) {
  return {
    version: 1, circuit,
    inputs: { r1csBlake2b: "r", ptauBlake2b: PTAU, ptauSource: "Hermez powersOfTau28_hez_final_15 (public, 54 contributors)", circuitHash: "c" },
    rounds: Array.from({ length: n }, (_, i) => ({ index: i + 1, contributor: `person-${i}`, contributionHash: "h" + i })),
    beacon: { hash: "ff".repeat(32), source: "drand round 1234567", iterationsExp: 10, contributionHash: "b" },
    final: { zkeyBlake2b: "z", vkeyHash: "v", verifierHash: hashText(SRC[circuit]), contractName: circuit },
  };
}
const ok = () => ({ withdraw: goodTranscript("withdraw"), ragequit: goodTranscript("ragequit") });
const opts = (over = {}) => ({ phase1: { blake2b: PTAU }, verifierSources: SRC, ...over });
const has = (problems, re) => problems.some((p) => re.test(p));

describe("Mainnet deploy guard: ceremony required", function () {
  it("a complete, consistent ceremony is accepted", function () {
    expect(ceremonyProblems(ok(), opts())).to.deep.equal([]);
  });

  it("the repository as it is today (dev setup, no transcripts) is REFUSED", function () {
    let msg = ""; try { assertCeremonyBeforeMainnet({}); } catch (e) { msg = e.message; }
    expect(msg).to.match(/MAINNET DEPLOY REFUSED/).and.match(/CEREMONY_WITHDRAW_TRANSCRIPT/);
  });

  it("a rehearsal / development transcript is refused even if everything else looks right", function () {
    const t = ok(); t.withdraw.inputs.ptauSource = "DEV ptau generated for the rehearsal (NOT for production)";
    expect(has(ceremonyProblems(t, opts()), /development\/rehearsal/)).to.equal(true);
  });

  it("fewer than the required contributors is refused", function () {
    const t = ok(); t.ragequit = goodTranscript("ragequit", MIN_CONTRIBUTORS - 1);
    expect(has(ceremonyProblems(t, opts()), /at least 15 required/)).to.equal(true);
  });

  it("duplicate contributor identities are refused", function () {
    const t = ok(); t.withdraw.rounds[3].contributor = "PERSON-0";
    expect(has(ceremonyProblems(t, opts()), /duplicate contributor/)).to.equal(true);
  });

  it("a missing or weak beacon is refused", function () {
    const a = ok(); a.withdraw.beacon = null;
    expect(has(ceremonyProblems(a, opts()), /no random beacon/)).to.equal(true);
    const b = ok(); b.ragequit.beacon.iterationsExp = 5;
    expect(has(ceremonyProblems(b, opts()), /no random beacon/)).to.equal(true);
  });

  it("a verifier contract that is not the ceremony's export is refused (e.g. someone swapped in the dev verifier)", function () {
    expect(has(ceremonyProblems(ok(), opts({ verifierSources: { ...SRC, withdraw: "// the old dev verifier" } })), /NOT the one exported/)).to.equal(true);
  });

  it("an unpinned Phase 1, or one that differs from the pin, is refused", function () {
    expect(has(ceremonyProblems(ok(), opts({ phase1: { blake2b: null } })), /no pinned blake2b/)).to.equal(true);
    expect(has(ceremonyProblems(ok(), opts({ phase1: { blake2b: "cd".repeat(64) } })), /differs from the pinned public file/)).to.equal(true);
  });

  it("a transcript for the wrong circuit, or a missing one, is refused", function () {
    const t = ok(); t.withdraw.circuit = "ragequit";
    expect(has(ceremonyProblems(t, opts()), /transcript is for circuit/)).to.equal(true);
    expect(has(ceremonyProblems({ withdraw: ok().withdraw }, opts()), /ragequit: no ceremony transcript/)).to.equal(true);
  });

  it("the committed phase1.json is unpinned until the owner fills it (so mainnet stays blocked by default)", function () {
    expect(require("../docs/ceremony/phase1.json").blake2b).to.equal(null);
  });
});
