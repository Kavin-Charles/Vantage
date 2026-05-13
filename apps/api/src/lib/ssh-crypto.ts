// apps/api/src/lib/ssh-crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-cbc';

function getKey(): Buffer {
  const hex = process.env['SSH_ENCRYPTION_KEY'];
  if (!hex || hex.length !== 64) {
    throw new Error('SSH_ENCRYPTION_KEY must be a 64-char hex string');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptPrivateKey(plaintext: string): { encryptedPrivateKey: string; iv: string } {
  const key = getKey();
  const ivBuf = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, ivBuf);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    encryptedPrivateKey: encrypted.toString('base64'),
    iv: ivBuf.toString('hex'),
  };
}

export function decryptPrivateKey(encryptedPrivateKey: string, iv: string): string {
  const key = getKey();
  const ivBuf = Buffer.from(iv, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, ivBuf);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedPrivateKey, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
