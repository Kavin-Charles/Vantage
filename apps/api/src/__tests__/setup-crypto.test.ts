import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('setup-crypto', () => {
  const VALID_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes

  beforeEach(() => {
    process.env['SSH_ENCRYPTION_KEY'] = VALID_KEY;
  });

  afterEach(() => {
    delete process.env['SSH_ENCRYPTION_KEY'];
  });

  it('encrypts and decrypts SMTP password round-trip', async () => {
    const { encryptSmtpPassword, decryptSmtpPassword } = await import('../lib/setup-crypto');
    const plaintext = 'super-secret-password-123!';
    const { encrypted, iv } = encryptSmtpPassword(plaintext);
    const decrypted = decryptSmtpPassword(encrypted, iv);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertext each call (random IV)', async () => {
    const { encryptSmtpPassword } = await import('../lib/setup-crypto');
    const r1 = encryptSmtpPassword('password');
    const r2 = encryptSmtpPassword('password');
    expect(r1.iv).not.toBe(r2.iv);
    expect(r1.encrypted).not.toBe(r2.encrypted);
  });

  it('throws if SSH_ENCRYPTION_KEY is missing', async () => {
    delete process.env['SSH_ENCRYPTION_KEY'];
    const { encryptSmtpPassword } = await import('../lib/setup-crypto');
    expect(() => encryptSmtpPassword('x')).toThrow('SSH_ENCRYPTION_KEY');
  });
});
