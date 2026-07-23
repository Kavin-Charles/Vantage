import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const VALID_KEY = 'a'.repeat(64); // 64-char hex = 32 bytes

describe('secret-crypto', () => {
  const originalKey = process.env['SSH_ENCRYPTION_KEY'];

  beforeEach(() => {
    process.env['SSH_ENCRYPTION_KEY'] = VALID_KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env['SSH_ENCRYPTION_KEY'];
    } else {
      process.env['SSH_ENCRYPTION_KEY'] = originalKey;
    }
  });

  it('round-trips plaintext through encrypt then decrypt', async () => {
    const { encryptSecret, decryptSecret } = await import('./secret-crypto');
    const plaintext = 'JBSWY3DPEHPK3PXP';
    const packed = encryptSecret(plaintext);
    expect(decryptSecret(packed)).toBe(plaintext);
  });

  it('produces packed output that differs from the plaintext input', async () => {
    const { encryptSecret } = await import('./secret-crypto');
    const plaintext = 'JBSWY3DPEHPK3PXP';
    const packed = encryptSecret(plaintext);
    expect(packed).not.toBe(plaintext);
    expect(packed).not.toContain(plaintext);
  });

  it('packs as iv:authTag:ciphertext hex triplet', async () => {
    const { encryptSecret } = await import('./secret-crypto');
    const packed = encryptSecret('some-secret');
    const parts = packed.split(':');
    expect(parts).toHaveLength(3);
    parts.forEach(p => expect(p).toMatch(/^[0-9a-f]+$/));
  });

  it('throws when the packed string has been tampered with (GCM auth failure)', async () => {
    const { encryptSecret, decryptSecret } = await import('./secret-crypto');
    const packed = encryptSecret('another-secret');
    const [iv, authTag, ciphertext] = packed.split(':');
    // Flip a hex character in the ciphertext to simulate tampering.
    const tamperedChar = ciphertext![0] === '0' ? '1' : '0';
    const tamperedCiphertext = tamperedChar + ciphertext!.slice(1);
    const tampered = `${iv}:${authTag}:${tamperedCiphertext}`;
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('throws when SSH_ENCRYPTION_KEY is missing', async () => {
    delete process.env['SSH_ENCRYPTION_KEY'];
    const { encryptSecret } = await import('./secret-crypto');
    expect(() => encryptSecret('x')).toThrow();
  });

  it('throws when SSH_ENCRYPTION_KEY has the wrong length', async () => {
    process.env['SSH_ENCRYPTION_KEY'] = 'tooshort';
    const { encryptSecret } = await import('./secret-crypto');
    expect(() => encryptSecret('x')).toThrow();
  });
});
