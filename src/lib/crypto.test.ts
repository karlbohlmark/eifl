import { test, expect, describe } from "bun:test";
import { encryptSecret, decryptSecret, isEncryptionConfigured } from "./crypto";

describe("crypto", () => {
  test("isEncryptionConfigured returns false when key not set", () => {
    const originalKey = process.env.EIFL_ENCRYPTION_KEY;
    delete process.env.EIFL_ENCRYPTION_KEY;

    expect(isEncryptionConfigured()).toBe(false);

    if (originalKey) {
      process.env.EIFL_ENCRYPTION_KEY = originalKey;
    }
  });

  test("encrypt and decrypt roundtrip", async () => {
    process.env.EIFL_ENCRYPTION_KEY = "test-encryption-key-for-testing-purposes";

    const plaintext = "my-secret-value";
    const { encrypted, iv } = await encryptSecret(plaintext);

    expect(encrypted).not.toBe(plaintext);
    expect(iv).toBeTruthy();

    const decrypted = await decryptSecret(encrypted, iv);
    expect(decrypted).toBe(plaintext);
  });

  test("different plaintexts produce different ciphertexts", async () => {
    process.env.EIFL_ENCRYPTION_KEY = "test-encryption-key-for-testing-purposes";

    const { encrypted: encrypted1 } = await encryptSecret("secret1");
    const { encrypted: encrypted2 } = await encryptSecret("secret2");

    expect(encrypted1).not.toBe(encrypted2);
  });
});
