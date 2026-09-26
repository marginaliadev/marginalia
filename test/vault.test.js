const { expect } = require("chai");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const V = require("../lib/vault");
const M = require("../lib/marginalia");

describe("MARGINALIA Note Vault (AES-256-GCM Encryption)", function () {
  let alice, bob;
  const chainId = 46630;
  const tempVaultPath = path.join(__dirname, "..", "notes", "test-vault.json");

  before(async function () {
    [alice, bob] = await ethers.getSigners();
  });

  after(function () {
    if (fs.existsSync(tempVaultPath)) fs.unlinkSync(tempVaultPath);
  });

  it("derives deterministic 32-byte encryption key from wallet signature", async function () {
    const msg = V.getVaultSignMessage(chainId, "0x1234567890123456789012345678901234567890");
    const sig1 = await alice.signMessage(msg);
    const key1 = V.deriveKeyFromSignature(sig1, chainId);

    const sig2 = await alice.signMessage(msg);
    const key2 = V.deriveKeyFromSignature(sig2, chainId);

    expect(key1.length).to.equal(32);
    expect(key1).to.deep.equal(key2);
  });

  it("encrypts and decrypts a serialized marginalia note round-trip", async function () {
    const secret = await M.newSecret();
    const note = {
      sk: secret.sk,
      rho: secret.rho,
      value: 1000000000000000000n,
      label: 9999999n,
      commitment: 123456789n,
    };
    const serialized = M.serializeNote(note);

    const msg = V.getVaultSignMessage(chainId);
    const sig = await alice.signMessage(msg);
    const key = V.deriveKeyFromSignature(sig, chainId);

    const encrypted = V.encryptNote(serialized, key);
    expect(encrypted.startsWith("marginalia-vault-v1-")).to.be.true;

    const decrypted = V.decryptNote(encrypted, key);
    expect(decrypted).to.equal(serialized);

    const parsed = M.parseNote(decrypted);
    expect(parsed.commitment).to.equal(note.commitment);
  });

  it("fails to decrypt with a key derived from a different wallet", async function () {
    const serialized = "marginalia-note-v1-test-secret-payload";
    const msg = V.getVaultSignMessage(chainId);

    const aliceSig = await alice.signMessage(msg);
    const aliceKey = V.deriveKeyFromSignature(aliceSig, chainId);

    const bobSig = await bob.signMessage(msg);
    const bobKey = V.deriveKeyFromSignature(bobSig, chainId);

    const encrypted = V.encryptNote(serialized, aliceKey);

    expect(() => V.decryptNote(encrypted, bobKey)).to.throw(
      "Decryption failed: invalid key or corrupted ciphertext"
    );
  });

  it("fails to decrypt if ciphertext or auth tag is tampered with", async function () {
    const serialized = "marginalia-note-v1-integrity-check";
    const msg = V.getVaultSignMessage(chainId);
    const sig = await alice.signMessage(msg);
    const key = V.deriveKeyFromSignature(sig, chainId);

    const encrypted = V.encryptNote(serialized, key);
    const raw = Buffer.from(encrypted.slice(V.VAULT_PREFIX.length), "base64url").toString("utf-8");
    const payload = JSON.parse(raw);

    // Tamper with ciphertext
    payload.ct = payload.ct.slice(0, -2) + (payload.ct.slice(-2) === "aa" ? "bb" : "aa");
    const tampered = V.VAULT_PREFIX + Buffer.from(JSON.stringify(payload)).toString("base64url");

    expect(() => V.decryptNote(tampered, key)).to.throw(
      "Decryption failed: invalid key or corrupted ciphertext"
    );
  });

  it("saves and loads multi-note encrypted vault to disk", async function () {
    const notes = [
      "marginalia-note-v1-sample-note-1",
      "marginalia-note-v1-sample-note-2",
    ];
    const msg = V.getVaultSignMessage(chainId);
    const sig = await alice.signMessage(msg);
    const key = V.deriveKeyFromSignature(sig, chainId);

    const notesDir = path.dirname(tempVaultPath);
    if (!fs.existsSync(notesDir)) fs.mkdirSync(notesDir, { recursive: true });

    V.saveEncryptedVault(tempVaultPath, notes, key);
    expect(fs.existsSync(tempVaultPath)).to.be.true;

    const loadedNotes = V.loadEncryptedVault(tempVaultPath, key);
    expect(loadedNotes).to.deep.equal(notes);
  });
});
