import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import zlib from 'zlib';
import { generateBackupFilename, createManualBackup } from './backup-create.js';
import { decryptBuffer } from './encryption.js';

describe('generateBackupFilename', () => {
  it('formats a date as bankapp-YYYYMMDD-HHMMSS.sql.gz', () => {
    const date = new Date(2026, 6, 15, 9, 5, 3); // 2026-07-15 09:05:03 local
    expect(generateBackupFilename(date)).toBe('bankapp-20260715-090503.sql.gz');
  });

  it('zero-pads single-digit month, day, hour, minute and second', () => {
    const date = new Date(2026, 0, 2, 3, 4, 5); // 2026-01-02 03:04:05
    expect(generateBackupFilename(date)).toBe('bankapp-20260102-030405.sql.gz');
  });
});

describe('createManualBackup', () => {
  let backupDir: string;

  beforeEach(() => {
    backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bankapp-backup-test-'));
    fs.mkdirSync(path.join(backupDir, 'manual'));
  });

  afterEach(() => {
    fs.rmSync(backupDir, { recursive: true, force: true });
  });

  it('writes the gzip-compressed stdout of the dump command to backupDir/manual', async () => {
    const result = await createManualBackup('unused://database', backupDir, 'test-user-id', {
      command: 'sh',
      args: ['-c', 'echo -n hello-world'],
    });

    const filePath = path.join(backupDir, 'manual', result.filename);
    expect(fs.existsSync(filePath)).toBe(true);
    const decrypted = decryptBuffer(fs.readFileSync(filePath));
    const contents = zlib.gunzipSync(decrypted).toString('utf-8');
    expect(contents).toBe('hello-world');
    expect(result.sizeBytes).toBe(fs.statSync(filePath).size);
  });

  it('rejects and removes the partial file when the dump command exits non-zero', async () => {
    await expect(
      createManualBackup('unused://database', backupDir, 'test-user-id', {
        command: 'sh',
        args: ['-c', 'echo pg_dump: error: connection failed 1>&2; exit 1'],
      })
    ).rejects.toThrow(/connection failed/);

    const leftoverFiles = fs.readdirSync(path.join(backupDir, 'manual'));
    expect(leftoverFiles).toEqual([]);
  });

  it('rejects and removes the partial file when the command does not exist', async () => {
    await expect(
      createManualBackup('unused://database', backupDir, 'test-user-id', {
        command: 'this-command-does-not-exist',
        args: [],
      })
    ).rejects.toThrow();

    const leftoverFiles = fs.readdirSync(path.join(backupDir, 'manual'));
    expect(leftoverFiles).toEqual([]);
  });
});
