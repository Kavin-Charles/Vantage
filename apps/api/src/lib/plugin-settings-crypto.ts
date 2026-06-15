import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-cbc';

function getKey(): Buffer {
  const hex = process.env['PLUGIN_SETTINGS_KEY'];
  if (!hex || hex.length !== 64) {
    throw new Error('PLUGIN_SETTINGS_KEY must be a 64-char hex string (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

export interface EncryptedSettingValue {
  __encrypted: true;
  ciphertext: string;
  iv: string;
}

export function isEncryptedValue(v: unknown): v is EncryptedSettingValue {
  return typeof v === 'object' && v !== null && (v as any).__encrypted === true;
}

export function encryptSettingValue(plaintext: string): EncryptedSettingValue {
  const key = getKey();
  const ivBuf = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, ivBuf);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    __encrypted: true,
    ciphertext: encrypted.toString('base64'),
    iv: ivBuf.toString('hex'),
  };
}

export function decryptSettingValue(enc: EncryptedSettingValue): string {
  const key = getKey();
  const ivBuf = Buffer.from(enc.iv, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, ivBuf);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(enc.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
