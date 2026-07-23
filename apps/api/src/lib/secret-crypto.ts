import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recommended IV length for GCM

function getKey(): Buffer {
  const hex = process.env['SSH_ENCRYPTION_KEY'];
  if (!hex || hex.length !== 64) {
    throw new Error('SSH_ENCRYPTION_KEY must be a 64-char hex string');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypts a secret (e.g. a TOTP secret) for at-rest storage using AES-256-GCM.
 * Packs the IV, auth tag, and ciphertext into a single colon-delimited hex
 * string so the result fits a single text column.
 */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Decrypts a value produced by encryptSecret. Throws if the packed string is
 * malformed or fails GCM authentication (i.e. has been tampered with).
 */
export function decryptSecret(packed: string): string {
  const key = getKey();
  const parts = packed.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid packed secret format');
  }
  const [ivHex, authTagHex, ciphertextHex] = parts as [string, string, string];
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}
