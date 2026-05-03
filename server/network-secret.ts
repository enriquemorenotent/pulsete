import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const encryptionPrefix = 'enc-v1';
const keyBytes = 32;
const ivBytes = 12;
const authTagBytes = 16;

export type SecretBox = {
  decrypt: (value: string) => string;
  encrypt: (value: string) => string;
  isEncrypted: (value: string) => boolean;
};

export const isEncryptedSecret = (value: string) => parseEncryptedSecret(value) !== null;

export const resolveNetworkSecretPath = (databasePath = resolve('data', 'pulsete.sqlite')) =>
  resolve(dirname(databasePath), 'pulsete.secret');

export const isValidNetworkSecretContent = (value: string) => {
  const normalized = value.trim();
  if (!normalized) {
    return false;
  }
  try {
    return Buffer.from(normalized, 'base64').length === keyBytes;
  } catch {
    return false;
  }
};

export const createSecretBox = (
  databasePath = resolve('data', 'pulsete.sqlite'),
  options: { createIfMissing?: boolean } = {}
): SecretBox => {
  const keyPath = resolveNetworkSecretPath(databasePath);
  mkdirSync(dirname(keyPath), { recursive: true });
  const key = loadOrCreateKey(keyPath, options.createIfMissing ?? true);
  return {
    decrypt(value) {
      const parsed = parseEncryptedSecret(value);
      if (!parsed) {
        return value;
      }
      const decipher = createDecipheriv('aes-256-gcm', key, parsed.iv);
      decipher.setAuthTag(parsed.authTag);
      return Buffer.concat([
        decipher.update(parsed.cipherText),
        decipher.final(),
      ]).toString('utf8');
    },
    encrypt(value) {
      const iv = randomBytes(ivBytes);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      return [
        encryptionPrefix,
        iv.toString('base64'),
        authTag.toString('base64'),
        encrypted.toString('base64'),
      ].join(':');
    },
    isEncrypted(value) {
      return isEncryptedSecret(value);
    },
  };
};

const parseEncryptedSecret = (value: string) => {
  const [prefix, ivBase64, authTagBase64, cipherTextBase64, ...extra] = value.split(':');
  if (extra.length > 0 || prefix !== encryptionPrefix || !ivBase64 || !authTagBase64 || !cipherTextBase64) {
    return null;
  }
  try {
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');
    const cipherText = Buffer.from(cipherTextBase64, 'base64');
    const normalized = [encryptionPrefix, iv.toString('base64'), authTag.toString('base64'), cipherText.toString('base64')].join(':');
    if (normalized !== value || iv.length !== ivBytes || authTag.length !== authTagBytes || cipherText.length === 0) {
      return null;
    }
    return { iv, authTag, cipherText };
  } catch {
    return null;
  }
};

const loadOrCreateKey = (keyPath: string, createIfMissing: boolean) => {
  if (existsSync(keyPath)) {
    const content = readFileSync(keyPath, 'utf8');
    if (!isValidNetworkSecretContent(content)) {
      throw new Error('Invalid network secret key');
    }
    const key = Buffer.from(content.trim(), 'base64');
    return key;
  }
  if (!createIfMissing) {
    throw new Error(`Missing network secret key: ${keyPath}`);
  }
  const key = randomBytes(keyBytes);
  writeFileSync(keyPath, key.toString('base64'), { mode: 0o600 });
  try {
    chmodSync(keyPath, 0o600);
  } catch {
    // Best-effort permissions tightening on platforms that support it.
  }
  return key;
};
