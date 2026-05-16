import { describe, it, expect, beforeEach, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  process.env['MAIL_ENCRYPTION_KEY'] = 'a'.repeat(64);
});

describe('mail-crypto', () => {
  it('encrypt then decrypt returns original plaintext', async () => {
    const { encryptSecret, decryptSecret } = await import('../lib/mail-crypto');
    const original = 'super-secret-token-abc123';
    const encrypted = encryptSecret(original);
    expect(encrypted).not.toBe(original);
    expect(encrypted).toContain(':');
    expect(decryptSecret(encrypted)).toBe(original);
  });

  it('two encryptions of same value produce different ciphertexts', async () => {
    const { encryptSecret } = await import('../lib/mail-crypto');
    const a = encryptSecret('same-value');
    const b = encryptSecret('same-value');
    expect(a).not.toBe(b);
  });

  it('throws when MAIL_ENCRYPTION_KEY is missing', async () => {
    delete process.env['MAIL_ENCRYPTION_KEY'];
    const { encryptSecret } = await import('../lib/mail-crypto');
    expect(() => encryptSecret('test')).toThrow('MAIL_ENCRYPTION_KEY');
  });
});
