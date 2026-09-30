export interface VaultNote {
  id: string;
  commitment: string;
  valueEth: string;
  timestamp: string;
  noteString: string;
}

export async function deriveVaultKey(signature: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const rawKey = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(signature),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("MARGINALIA_FOLIO_VAULT_SALT_V1"),
      iterations: 100000,
      hash: "SHA-256",
    },
    rawKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptVaultData(notes: VaultNote[], key: CryptoKey): Promise<string> {
  const enc = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const data = enc.encode(JSON.stringify(notes));

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

export async function decryptVaultData(encryptedB64: string, key: CryptoKey): Promise<VaultNote[]> {
  const binary = atob(encryptedB64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);

  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  const dec = new TextDecoder();
  return JSON.parse(dec.decode(decrypted));
}
