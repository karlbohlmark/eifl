// Encryption utilities for secret management
// Uses AES-256-GCM with Web Crypto API

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits recommended for GCM

let cachedKey: CryptoKey | null = null;

export class EncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncryptionError";
  }
}

export function isEncryptionConfigured(): boolean {
  return !!process.env.EIFL_ENCRYPTION_KEY;
}

async function getEncryptionKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  const keyMaterial = process.env.EIFL_ENCRYPTION_KEY;
  if (!keyMaterial) {
    throw new EncryptionError(
      "EIFL_ENCRYPTION_KEY environment variable is not set. " +
      "Set a 32+ character secret key to enable secret management."
    );
  }

  if (keyMaterial.length < 32) {
    throw new EncryptionError(
      "EIFL_ENCRYPTION_KEY must be at least 32 characters long."
    );
  }

  // Derive a proper 256-bit key from the password using PBKDF2
  const encoder = new TextEncoder();
  const keyData = encoder.encode(keyMaterial);

  const baseKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  // Use a fixed salt for deterministic key derivation
  // In production, you might want to store this separately
  const salt = encoder.encode("eifl-secrets-v1");

  cachedKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    baseKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );

  return cachedKey;
}

export interface EncryptedData {
  encrypted: string; // base64 encoded ciphertext
  iv: string; // base64 encoded initialization vector
}

export async function encryptSecret(plaintext: string): Promise<EncryptedData> {
  const key = await getEncryptionKey();
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  // Generate random IV for each encryption
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    data
  );

  return {
    encrypted: Buffer.from(ciphertext).toString("base64"),
    iv: Buffer.from(iv).toString("base64"),
  };
}

export async function decryptSecret(
  encrypted: string,
  iv: string
): Promise<string> {
  const key = await getEncryptionKey();

  const ciphertext = Buffer.from(encrypted, "base64");
  const ivBytes = Buffer.from(iv, "base64");

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv: ivBytes },
      key,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch {
    throw new EncryptionError("Failed to decrypt secret. The encryption key may have changed.");
  }
}

// Clear cached key (useful for testing or key rotation)
export function clearKeyCache(): void {
  cachedKey = null;
}
