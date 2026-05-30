import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-cbc';

function getKey(): Buffer {
  const hex = process.env['SSH_ENCRYPTION_KEY'];
  if (!hex || hex.length !== 64) {
    throw new Error('SSH_ENCRYPTION_KEY must be a 64-char hex string');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptSmtpPassword(plaintext: string): { encrypted: string; iv: string } {
  const key = getKey();
  const ivBuf = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, ivBuf);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { encrypted: enc.toString('base64'), iv: ivBuf.toString('hex') };
}

export function decryptSmtpPassword(encrypted: string, iv: string): string {
  const key = getKey();
  const ivBuf = Buffer.from(iv, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, ivBuf);
  const dec = Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}
