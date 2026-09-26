// MARGINALIA Viewing Keys & Letter of Disclosure Module (Mitigation for L10)
// Enables selective compliance disclosure (tax/audits) without relinquishing spending capability.

const crypto = require("crypto");

/**
 * Generate an asymmetric viewing keypair (X25519) for compliance disclosure.
 */
function generateViewingKeypair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("x25519");
  return {
    viewingPrivateKey: privateKey.export({ type: "pkcs8", format: "pem" }),
    viewingPublicKey: publicKey.export({ type: "spki", format: "pem" }),
  };
}

/**
 * Encrypt a note disclosure memo using the recipient's viewing public key.
 * @param {object} details - { value, label, depositor, commitment, timestamp, poolAddress }
 * @param {string} viewingPublicKeyPem - PEM encoded public key.
 */
function createEncryptedMemo(details, viewingPublicKeyPem) {
  // Generate ephemeral keypair for ECDH
  const { privateKey: ephemeralPrivate, publicKey: ephemeralPublic } = crypto.generateKeyPairSync("x25519");
  const viewingKey = crypto.createPublicKey(viewingPublicKeyPem);

  // Compute shared secret S = ECDH(ephemeralPrivate, viewingPublicKey)
  const sharedSecret = crypto.diffieHellman({
    privateKey: ephemeralPrivate,
    publicKey: viewingKey,
  });

  // Derive AES-256-GCM key from shared secret
  const aesKey = crypto.hkdfSync("sha256", sharedSecret, Buffer.from("marginalia-disclosure-salt"), Buffer.from("aes-gcm-key"), 32);

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(aesKey), iv);

  const plaintext = JSON.stringify(details, (_, v) => (typeof v === "bigint" ? v.toString() : v));
  let ciphertext = cipher.update(plaintext, "utf-8", "hex");
  ciphertext += cipher.final("hex");
  const tag = cipher.getAuthTag();

  return {
    v: 1,
    ephemeralPublicKey: ephemeralPublic.export({ type: "spki", format: "pem" }),
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    ciphertext,
  };
}

/**
 * Decrypt a note disclosure memo using the viewing private key.
 * @param {object} memo - Encrypted memo payload.
 * @param {string} viewingPrivateKeyPem - PEM encoded viewing private key.
 */
function decryptDisclosureMemo(memo, viewingPrivateKeyPem) {
  const viewingPrivate = crypto.createPrivateKey(viewingPrivateKeyPem);
  const ephemeralPublic = crypto.createPublicKey(memo.ephemeralPublicKey);

  // Compute shared secret S = ECDH(viewingPrivateKey, ephemeralPublic)
  const sharedSecret = crypto.diffieHellman({
    privateKey: viewingPrivate,
    publicKey: ephemeralPublic,
  });

  const aesKey = crypto.hkdfSync("sha256", sharedSecret, Buffer.from("marginalia-disclosure-salt"), Buffer.from("aes-gcm-key"), 32);

  const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(aesKey), Buffer.from(memo.iv, "hex"));
  decipher.setAuthTag(Buffer.from(memo.tag, "hex"));

  let decrypted = decipher.update(memo.ciphertext, "hex", "utf-8");
  decrypted += decipher.final("utf-8");

  return JSON.parse(decrypted);
}

/**
 * Generate a formal "Letter of Disclosure" certificate for regulators/auditors.
 */
function generateLetterOfDisclosure(details, auditorName = "Tax & Financial Intelligence Unit") {
  return {
    title: "MARGINALIA — Letter of Disclosure (Axiom III Compliance)",
    auditor: auditorName,
    attestationDate: new Date().toISOString(),
    disclosure: {
      poolAddress: details.poolAddress,
      depositor: details.depositor,
      label: details.label?.toString(),
      value: details.value?.toString(),
      commitment: details.commitment?.toString(),
    },
    statement:
      "This document certifies voluntary cryptographic disclosure of shielded transaction provenance without yielding spending authorization.",
  };
}

module.exports = {
  generateViewingKeypair,
  createEncryptedMemo,
  decryptDisclosureMemo,
  generateLetterOfDisclosure,
};
