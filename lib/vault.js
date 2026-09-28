// MARGINALIA Encrypted Vault Module (Mitigation for L6)
// Provides client-side authenticated encryption (AES-256-GCM) for secret notes
// Keys can be derived from a Web3 wallet signature (EIP-712/personal_sign) or user password.

const crypto = require("crypto");
const fs = require("fs");

const VAULT_PREFIX = "marginalia-vault-v1-";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for AES-GCM
const SALT_LENGTH = 16;
const PBKDF2_ITERATIONS = 100_000;

function toKeyBuffer(key) {
  if (!key) throw new Error("Key must be provided");
  if (Buffer.isBuffer(key)) return key;
  if (key instanceof ArrayBuffer) return Buffer.from(key);
  if (typeof key === "string") return Buffer.from(key.replace(/^0x/, ""), "hex");
  return Buffer.from(key);
}

/**
 * Standard message to be signed by a Web3 wallet to unlock the note vault.
 */
function getVaultSignMessage(chainId, poolAddress = "", origin = "") {
  let msg = `Marginalia Shielded Vault Authorization\nChain ID: ${chainId}\nPool: ${poolAddress.toLowerCase()}`;
  if (origin) {
    msg += `\nOrigin: ${origin}`;
  }
  msg += `\nSign to decrypt your shielded notes on this device.`;
  return msg;
}

/**
 * Derive a 256-bit encryption key deterministically from a wallet signature.
 * Uses HKDF with a domain separation salt.
 */
function deriveKeyFromSignature(signature, chainId = 46630) {
  const sigBuffer = Buffer.isBuffer(signature) ? signature : Buffer.from(signature.replace(/^0x/, ""), "hex");
  const salt = Buffer.from(`marginalia-vault-salt-v1-${chainId}`, "utf-8");
  const info = Buffer.from("aes-256-gcm-vault-key", "utf-8");
  return Buffer.from(crypto.hkdfSync("sha256", sigBuffer, salt, info, 32));
}

/**
 * Derive a 256-bit key from a password and salt using PBKDF2-SHA256.
 */
function deriveKeyFromPassword(password, salt) {
  const saltBuf = Buffer.isBuffer(salt) ? salt : Buffer.from(salt, "utf-8");
  return crypto.pbkdf2Sync(password, saltBuf, PBKDF2_ITERATIONS, 32, "sha256");
}

/**
 * Encrypt a secret note or arbitrary string using AES-256-GCM.
 * @param {string|object} note - Serialized note string or note object.
 * @param {Buffer|ArrayBuffer|string} rawKey - 32-byte AES key.
 * @returns {string} Authenticated vault string: "marginalia-vault-v1-<base64url>"
 */
function encryptNote(note, rawKey) {
  const key = toKeyBuffer(rawKey);
  if (key.length !== 32) throw new Error("Key must be 32 bytes (256-bit)");
  const plaintext = typeof note === "string" ? note : JSON.stringify(note, (_, v) => (typeof v === "bigint" ? v.toString() : v));

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let ciphertext = cipher.update(plaintext, "utf-8", "hex");
  ciphertext += cipher.final("hex");
  const tag = cipher.getAuthTag();

  const payload = {
    v: 1,
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    ct: ciphertext,
  };

  return VAULT_PREFIX + Buffer.from(JSON.stringify(payload)).toString("base64url");
}

/**
 * Decrypt an authenticated vault string using AES-256-GCM.
 * @param {string} vaultStr - "marginalia-vault-v1-<base64url>"
 * @param {Buffer} key - 32-byte AES key.
 * @returns {string} Original plaintext note.
 */
function decryptNote(vaultStr, rawKey) {
  const key = toKeyBuffer(rawKey);
  if (key.length !== 32) throw new Error("Key must be 32 bytes (256-bit)");
  if (!vaultStr || !vaultStr.startsWith(VAULT_PREFIX)) {
    throw new Error("Invalid vault string format");
  }

  const raw = Buffer.from(vaultStr.slice(VAULT_PREFIX.length), "base64url").toString("utf-8");
  const payload = JSON.parse(raw);

  const iv = Buffer.from(payload.iv, "hex");
  const tag = Buffer.from(payload.tag, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted;
  try {
    decrypted = decipher.update(payload.ct, "hex", "utf-8");
    decrypted += decipher.final("utf-8");
  } catch (err) {
    throw new Error("Decryption failed: invalid key or corrupted ciphertext");
  }

  return decrypted;
}

/**
 * Save notes encrypted to disk.
 */
function saveEncryptedVault(filePath, notes, key) {
  const encryptedNotes = notes.map((n) => encryptNote(n, key));
  fs.writeFileSync(filePath, JSON.stringify(encryptedNotes, null, 2), "utf-8");
}

/**
 * Load and decrypt notes from disk.
 */
function loadEncryptedVault(filePath, key) {
  if (!fs.existsSync(filePath)) return [];
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return raw.map((enc) => decryptNote(enc, key));
}

module.exports = {
  VAULT_PREFIX,
  getVaultSignMessage,
  deriveKeyFromSignature,
  deriveKeyFromPassword,
  encryptNote,
  decryptNote,
  saveEncryptedVault,
  loadEncryptedVault,
};
