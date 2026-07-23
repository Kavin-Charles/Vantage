import { randomBytes } from 'node:crypto';

/**
 * Generates `n` unique 10-character lowercase-hex recovery codes for 2FA.
 * Codes are only ever returned to the caller once — callers must store a
 * hash, never the plaintext.
 */
export function generateRecoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () => randomBytes(5).toString('hex')); // 10-char codes
}
