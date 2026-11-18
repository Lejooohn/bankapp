import { describe, it, expect, vi, afterEach } from 'vitest';

// encryption.ts caches the key at first use, so every case loads a fresh module.
async function loadWithKey(key: string | undefined) {
  vi.resetModules();
  if (key === undefined) vi.stubEnv('ENCRYPTION_KEY', '');
  else vi.stubEnv('ENCRYPTION_KEY', key);
  return import('./encryption.js');
}

afterEach(() => { vi.unstubAllEnvs(); });

describe('ENCRYPTION_KEY validation', () => {
  it('rejects the all-zero placeholder from .env.example', async () => {
    const enc = await loadWithKey('0'.repeat(64));
    expect(() => enc.encryptBuffer(Buffer.from('x'))).toThrow(/placeholder/);
  });

  it('rejects a key that is 64 characters but not hexadecimal', async () => {
    const enc = await loadWithKey('z'.repeat(64));
    expect(() => enc.encryptBuffer(Buffer.from('x'))).toThrow(/64 hex characters/);
  });

  it('rejects a missing key', async () => {
    const enc = await loadWithKey(undefined);
    expect(() => enc.assertEncryptionConfigured()).toThrow(/64 hex characters/);
  });

  it('accepts a real key and round-trips data', async () => {
    const enc = await loadWithKey('ab'.repeat(32));
    const sealed = enc.encryptBuffer(Buffer.from('bank data'));
    expect(enc.decryptBuffer(sealed).toString()).toBe('bank data');
  });
});
