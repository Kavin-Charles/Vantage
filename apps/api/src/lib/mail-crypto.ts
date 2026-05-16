import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-cbc';

function getKey(): Buffer {
  const hex = process.env['MAIL_ENCRYPTION_KEY'];
  if (!hex || hex.length !== 64) {
    throw new Error('MAIL_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypt plaintext. Returns `${ivHex}:${ciphertextBase64}` — store as a single DB column value.
 */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypt a value produced by encryptSecret.
 */
export function decryptSecret(stored: string): string {
  const sep = stored.indexOf(':');
  if (sep === -1) throw new Error('Invalid encrypted value — missing IV separator');
  const iv = Buffer.from(stored.slice(0, sep), 'hex');
  const ciphertext = Buffer.from(stored.slice(sep + 1), 'base64');
  const key = getKey();
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
