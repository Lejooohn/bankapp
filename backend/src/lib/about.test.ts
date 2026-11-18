import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readAppVersion, readPackageVersion } from './about.js';

function tree(version?: string) {
  const root = mkdtempSync(path.join(tmpdir(), 'bk-about-'));
  const backend = path.join(root, 'backend');
  mkdirSync(backend);
  if (version !== undefined) writeFileSync(path.join(root, 'VERSION'), version + '\n');
  return { root, backend };
}

describe('readAppVersion', () => {
  it('reads the SemVer from the VERSION file above the backend folder', () => {
    const t = tree('1.2.3');
    try { expect(readAppVersion(t.backend)).toBe('1.2.3'); } finally { rmSync(t.root, { recursive: true, force: true }); }
  });
  it('returns "unknown" when the file is missing or not a SemVer', () => {
    const missing = tree();
    const bad = tree('v1.2');
    try {
      expect(readAppVersion(missing.backend)).toBe('unknown');
      expect(readAppVersion(bad.backend)).toBe('unknown');
    } finally {
      rmSync(missing.root, { recursive: true, force: true });
      rmSync(bad.root, { recursive: true, force: true });
    }
  });
  it('prefers APP_VERSION when it is valid', () => {
    const t = tree('1.0.0');
    const old = process.env.APP_VERSION;
    process.env.APP_VERSION = '2.0.0';
    try { expect(readAppVersion(t.backend)).toBe('2.0.0'); } finally {
      if (old === undefined) delete process.env.APP_VERSION; else process.env.APP_VERSION = old;
      rmSync(t.root, { recursive: true, force: true });
    }
  });
});

describe('readPackageVersion', () => {
  it('reads an installed package version and returns "unknown" for a missing one', () => {
    expect(readPackageVersion('zod')).toMatch(/^\d+\.\d+\.\d+/);
    expect(readPackageVersion('definitely-not-installed-xyz')).toBe('unknown');
  });
});
