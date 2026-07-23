import { randomBytes } from 'node:crypto';

/**
 * Generates `n` unique 16-character lowercase-hex (64-bit) recovery codes
 * for 2FA. Codes are only ever returned to the caller once — callers must
 * store a hash, never the plaintext.
 */
export function generateRecoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () => randomBytes(8).toString('hex')); // 16-char codes
}
