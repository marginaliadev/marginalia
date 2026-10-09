import crypto from "crypto";
import { ethers } from "ethers";
import { POOL_ABI, POSEIDON_ABI } from "@/lib/constants";

// The frontend has no Poseidon library, but the pool exposes its Poseidon hashers as pure
// view contracts, so the exact hash the circuit uses can be evaluated via RPC.
export async function onChainPoseidon(provider: ethers.Provider, poolAddress: string) {
  const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);
  const [a1, a2, a3] = await Promise.all([pool.hasher1(), pool.hasher2(), pool.hasher3()]);
  const h1 = new ethers.Contract(a1, POSEIDON_ABI[1], provider);
  const h2 = new ethers.Contract(a2, POSEIDON_ABI[2], provider);
  const h3 = new ethers.Contract(a3, POSEIDON_ABI[3], provider);
  return {
    pool,
    p1: (x: bigint[]) => h1.poseidon(x) as Promise<bigint>,
    p2: (x: bigint[]) => h2.poseidon(x) as Promise<bigint>,
    p3: (x: bigint[]) => h3.poseidon(x) as Promise<bigint>,
  };
}

export function generateViewingKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("x25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return {
    viewingPublicKey: publicKey,
    viewingPrivateKey: privateKey,
  };
}

export function createEncryptedMemo(memoData: any, auditorPubKeyPem: string) {
  const ephemeralKeypair = crypto.generateKeyPairSync("x25519");
  const sharedSecret = crypto.diffieHellman({
    privateKey: ephemeralKeypair.privateKey,
    publicKey: crypto.createPublicKey(auditorPubKeyPem),
  });

  const aesKey = Buffer.from(crypto.hkdfSync("sha256", sharedSecret, Buffer.alloc(0), Buffer.from("MARGINALIA_VIEWING_KEY_V1"), 32));
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);

  const plaintext = Buffer.from(JSON.stringify(memoData), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const ephemeralPubPem = ephemeralKeypair.publicKey.export({ type: "spki", format: "pem" });

  return {
    cipherAlgorithm: "X25519-HKDF-AES-256-GCM",
    ephemeralPublicKey: ephemeralPubPem.toString(),
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
    ciphertext: encrypted.toString("hex"),
  };
}

export function parseNoteString(noteStr: string) {
  if (!noteStr.startsWith("marginalia-note-v1-")) {
    throw new Error("Invalid Note Prefix: Expected 'marginalia-note-v1-' prefix.");
  }
  const payloadBase64 = noteStr.slice("marginalia-note-v1-".length);
  let jsonString: string;
  try {
    jsonString = Buffer.from(payloadBase64, "base64url").toString("utf8");
  } catch (err) {
    throw new Error("Corrupted Base64: Note payload cannot be decoded.");
  }
  let parsed: any;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    throw new Error("Malformed Note JSON: The note payload is not valid JSON.");
  }

  if (!parsed.sk || !parsed.rho || !parsed.value) {
    throw new Error("Missing Note Fields: Secret note must contain sk, rho, and value.");
  }

  return parsed;
}
