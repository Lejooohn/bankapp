import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeSafetySnapshot } from './backup-restore-apply.js';

describe('writeSafetySnapshot on a fresh backup folder', () => {
  it('creates the last/ folder and writes the snapshot', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bk-safety-'));
    try {
      expect(existsSync(path.join(dir, 'last'))).toBe(false);
      const filename = await writeSafetySnapshot(dir, '11111111-2222-3333-4444-555555555555', { transactions: [] });
      expect(filename.startsWith('bankapp-safety-')).toBe(true);
      expect(readdirSync(path.join(dir, 'last'))).toContain(filename);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
