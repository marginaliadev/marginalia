const { expect } = require("chai");
const D = require("../lib/disclosure");

describe("MARGINALIA Viewing Keys & Letter of Disclosure (Mitigation for L10)", function () {
  it("generates valid asymmetric viewing keypair", function () {
    const { viewingPrivateKey, viewingPublicKey } = D.generateViewingKeypair();
    expect(viewingPrivateKey).to.include("BEGIN PRIVATE KEY");
    expect(viewingPublicKey).to.include("BEGIN PUBLIC KEY");
  });

  it("encrypts and decrypts transaction memo with viewing keys", function () {
    const { viewingPrivateKey, viewingPublicKey } = D.generateViewingKeypair();
    const memoDetails = {
      poolAddress: "0x1111222233334444555566667777888899990000",
      depositor: "0xAlice1234567890123456789012345678901234",
      label: "987654321",
      value: "1000000000000000000",
      commitment: "0x9999888877776666",
      timestamp: Date.now(),
    };

    const memo = D.createEncryptedMemo(memoDetails, viewingPublicKey);
    expect(memo.ciphertext).to.be.a("string");
    expect(memo.ephemeralPublicKey).to.include("BEGIN PUBLIC KEY");

    const decrypted = D.decryptDisclosureMemo(memo, viewingPrivateKey);
    expect(decrypted.depositor).to.equal(memoDetails.depositor);
    expect(decrypted.value).to.equal(memoDetails.value);
    expect(decrypted.label).to.equal(memoDetails.label);
  });

  it("fails to decrypt memo using an unauthorized viewing key", function () {
    const keypair1 = D.generateViewingKeypair();
    const keypair2 = D.generateViewingKeypair();

    const memo = D.createEncryptedMemo({ value: "500000" }, keypair1.viewingPublicKey);

    expect(() => D.decryptDisclosureMemo(memo, keypair2.viewingPrivateKey)).to.throw();
  });

  it("generates formal Letter of Disclosure certificate for compliance/tax authorities", function () {
    const noteDetails = {
      poolAddress: "0xPoolAddress",
      depositor: "0xAliceAddress",
      label: 12345n,
      value: 1000000000000000000n,
      commitment: 67890n,
    };

    const letter = D.generateLetterOfDisclosure(noteDetails, "Financial Crimes Enforcement Network");
    expect(letter.title).to.include("Letter of Disclosure");
    expect(letter.auditor).to.equal("Financial Crimes Enforcement Network");
    expect(letter.disclosure.depositor).to.equal("0xAliceAddress");
    expect(letter.disclosure.value).to.equal("1000000000000000000");
  });
});
