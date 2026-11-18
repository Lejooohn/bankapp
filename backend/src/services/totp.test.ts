import { describe, it, expect } from 'vitest';
import { hotp, verifyTotp, base32Encode, base32Decode, otpauthUri, timeStep } from './totp.js';

// RFC 6238, appendix B, SHA-1, ASCII secret "12345678901234567890", 6-digit form.
const RFC_SECRET = Buffer.from('12345678901234567890', 'ascii');
const RFC_VECTORS: Array<[number, string]> = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
];

describe('HOTP / TOTP (RFC 6238 vectors)', () => {
  it.each(RFC_VECTORS)('matches the RFC code at T=%i', (t, code) => {
    expect(hotp(RFC_SECRET, Math.floor(t / 30))).toBe(code);
  });

  it('accepts the current step and one step either side', () => {
    const now = 1111111109 * 1000;
    expect(verifyTotp(RFC_SECRET, '081804', now, null)).toBe(timeStep(now));
    expect(verifyTotp(RFC_SECRET, '081804', now + 30_000, null)).toBe(timeStep(now));
    expect(verifyTotp(RFC_SECRET, '081804', now - 30_000, null)).toBe(timeStep(now));
  });

  it('rejects a code two steps away', () => {
    const now = 1111111109 * 1000;
    expect(verifyTotp(RFC_SECRET, '081804', now + 60_000, null)).toBeNull();
  });

  it('refuses a code whose step was already used (replay)', () => {
    const now = 1111111109 * 1000;
    const step = timeStep(now);
    expect(verifyTotp(RFC_SECRET, '081804', now, step)).toBeNull();
    // A later step is still accepted when the stored step is older.
    expect(verifyTotp(RFC_SECRET, '081804', now, step - 1)).toBe(step);
  });

  it('rejects malformed codes without comparing them', () => {
    const now = 59 * 1000;
    for (const bad of ['', '12345', '1234567', 'abcdef', '28708 ']) {
      expect(verifyTotp(RFC_SECRET, bad, now, null)).toBeNull();
    }
  });
});

describe('base32 and otpauth URI', () => {
  it('round-trips arbitrary secrets', () => {
    const secret = Buffer.from('12345678901234567890', 'ascii');
    expect(base32Decode(base32Encode(secret)).equals(secret)).toBe(true);
    expect(base32Encode(RFC_SECRET)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });

  it('builds an otpauth URI an authenticator app accepts', () => {
    const uri = otpauthUri(RFC_SECRET, 'alice');
    expect(uri.startsWith('otpauth://totp/BankApp%3Aalice?')).toBe(true);
    expect(uri).toContain('secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });
});
