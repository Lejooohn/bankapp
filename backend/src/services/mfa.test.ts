import { describe, it, expect } from 'vitest';
import { randomBytes } from 'crypto';
import {
  encryptSecret, decryptSecret, normalizeRecoveryCode, generateRecoveryCodes,
  readCookie, deviceCookieHeader, clearDeviceCookieHeader, sha256Hex,
} from './mfa.js';

describe('TOTP secret storage', () => {
  it('round-trips the secret and never stores it in clear', () => {
    const secret = randomBytes(20);
    const stored = encryptSecret(secret);
    expect(stored).not.toContain(secret.toString('base64'));
    expect(decryptSecret(stored).equals(secret)).toBe(true);
  });
});

describe('recovery codes', () => {
  it('generates ten XXXXX-XXXXX codes whose hashes match their normalised form', () => {
    const { display, hashes } = generateRecoveryCodes();
    expect(display).toHaveLength(10);
    expect(new Set(display).size).toBe(10);
    display.forEach((code, i) => {
      expect(code).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
      expect(sha256Hex(normalizeRecoveryCode(code)!)).toBe(hashes[i]);
    });
  });

  it('normalises case, dashes and spaces, and rejects other shapes', () => {
    expect(normalizeRecoveryCode('abcde-fgh23')).toBe('ABCDEFGH23');
    expect(normalizeRecoveryCode(' ABCDE FGH23 ')).toBe('ABCDEFGH23');
    expect(normalizeRecoveryCode('ABCDEFGH2')).toBeNull();
    expect(normalizeRecoveryCode('ABCDEFGH29')).toBeNull(); // 9 is not in the base32 alphabet
    expect(normalizeRecoveryCode("ABCDE'FGH2")).toBeNull();
  });
});

describe('device cookie', () => {
  it('reads a named cookie from a header with several cookies', () => {
    expect(readCookie('a=1; bk_device=abc123; b=2', 'bk_device')).toBe('abc123');
    expect(readCookie('bk_device_other=x', 'bk_device')).toBeNull();
    expect(readCookie(undefined, 'bk_device')).toBeNull();
  });

  it('sets HttpOnly, Secure, SameSite=Strict and a path scoped to the auth API', () => {
    const header = deviceCookieHeader('tok', 1728000);
    expect(header).toContain('bk_device=tok');
    expect(header).toContain('Path=/api/auth');
    expect(header).toContain('Max-Age=1728000');
    for (const attr of ['HttpOnly', 'Secure', 'SameSite=Strict']) expect(header).toContain(attr);
  });

  it('clears the cookie with Max-Age=0 on the same path', () => {
    expect(clearDeviceCookieHeader()).toContain('Max-Age=0');
  });
});
