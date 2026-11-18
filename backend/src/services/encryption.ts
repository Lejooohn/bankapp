import crypto from 'crypto';

// Encrypts backups at rest (full database dumps and per-account safety snapshots)
// with AES-256-GCM. Files stay decrypted in memory only for the duration of a
// download/restore request; on disk they're always ciphertext.

const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;

function loadKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || !/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error('ENCRYPTION_KEY env var must be 64 hex characters (32 bytes)');
  }
  // The all-zero value is the placeholder from .env.example: backups encrypted with it
  // are protected by a key anyone can read from the repository.
  if (/^0+$/.test(key)) {
    throw new Error('ENCRYPTION_KEY is still the all-zero placeholder; generate a real key');
  }
  return Buffer.from(key, 'hex');
}

// Lazy: only throw if something actually tries to encrypt/decrypt, not at import time
// (keeps modules that merely import this file, e.g. for types, working without the key).
let keyBuffer: Buffer | null = null;
function getKey(): Buffer {
  if (!keyBuffer) keyBuffer = loadKey();
  return keyBuffer;
}

// Throws immediately if ENCRYPTION_KEY is missing/malformed — call this before starting
// any work (spawning a process, creating a file) that would need cleanup on failure.
export function assertEncryptionConfigured(): void {
  getKey();
}

// Encrypts a full buffer in one shot — used for small payloads (safety snapshots).
// Output layout: nonce(12) || ciphertext || tag(16)
export function encryptBuffer(plaintext: Buffer): Buffer {
  const nonce = crypto.randomBytes(NONCE_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, ciphertext, tag]);
}

export function decryptBuffer(encrypted: Buffer): Buffer {
  if (encrypted.length < NONCE_LENGTH + TAG_LENGTH) {
    throw new Error('Invalid encrypted data: too short');
  }
  const nonce = encrypted.subarray(0, NONCE_LENGTH);
  const tag = encrypted.subarray(encrypted.length - TAG_LENGTH);
  const ciphertext = encrypted.subarray(NONCE_LENGTH, encrypted.length - TAG_LENGTH);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// Streaming variant for large payloads (full database dumps). The nonce is written
// to `out` immediately; the caller must pipe `cipher` into `out` with {end: false} and,
// once the source has finished feeding the cipher, call finalizeEncryptStream to append
// the auth tag and close `out`.
export function beginEncryptStream(out: NodeJS.WritableStream): { cipher: crypto.CipherGCM } {
  const nonce = crypto.randomBytes(NONCE_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), nonce);
  out.write(nonce);
  return { cipher };
}

export function finalizeEncryptStream(out: NodeJS.WritableStream & { end: (chunk: Buffer) => void }, cipher: crypto.CipherGCM): void {
  out.end(cipher.getAuthTag());
}

// Decrypts an entire encrypted file's contents (nonce || ciphertext || tag), read fully
// into memory. Our backups are small enough (single-digit MB) that streaming decrypt
// isn't worth the complexity.
export function decryptFile(encrypted: Buffer): Buffer {
  return decryptBuffer(encrypted);
}
