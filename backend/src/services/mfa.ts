// Second-factor helpers: secret encryption, recovery codes, challenge and device tokens,
// and the device cookie. Routes live in routes/auth.ts.
import crypto from 'crypto';
import { encryptBuffer, decryptBuffer } from './encryption.js';
import { base32Encode } from './totp.js';

export const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const MFA_MAX_ATTEMPTS = 5;
export const TRUSTED_DEVICE_TTL_MS = 20 * 24 * 60 * 60 * 1000;
export const DEVICE_COOKIE = 'bk_device';
export const RECOVERY_CODE_COUNT = 10;

export function encryptSecret(secret: Buffer): string {
  return encryptBuffer(secret).toString('base64');
}

export function decryptSecret(stored: string): Buffer {
  return decryptBuffer(Buffer.from(stored, 'base64'));
}

export function randomToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// Recovery codes are 10 characters from the base32 alphabet, shown as XXXXX-XXXXX.
// Input is normalised (case, dashes, spaces) before hashing; anything else is rejected.
export function normalizeRecoveryCode(input: string): string | null {
  const clean = input.toUpperCase().replace(/[\s-]/g, '');
  return /^[A-Z2-7]{10}$/.test(clean) ? clean : null;
}

export function generateRecoveryCodes(): { display: string[]; hashes: string[] } {
  const display: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const raw = base32Encode(crypto.randomBytes(7)).slice(0, 10);
    display.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
    hashes.push(sha256Hex(raw));
  }
  return { display, hashes };
}

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}

// HttpOnly so scripts cannot read it, Secure so it only travels over HTTPS (localhost counts
// as a secure origin in browsers), SameSite=Strict, and scoped to the auth API path.
export function deviceCookieHeader(token: string, maxAgeSec: number): string {
  return `${DEVICE_COOKIE}=${token}; Path=/api/auth; Max-Age=${maxAgeSec}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearDeviceCookieHeader(): string {
  return `${DEVICE_COOKIE}=; Path=/api/auth; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}
