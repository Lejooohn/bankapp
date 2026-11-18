import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import zlib from 'zlib';
import { sweepAndEncryptAutoBackups } from './backup-auto-encrypt.js';
import { decryptBuffer } from './encryption.js';

describe('sweepAndEncryptAutoBackups', () => {
  let backupDir: string;

  beforeEach(() => {
    backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bankapp-auto-backup-test-'));
    for (const sub of ['daily', 'weekly', 'monthly']) {
      fs.mkdirSync(path.join(backupDir, sub));
    }
  });

  afterEach(() => {
    fs.rmSync(backupDir, { recursive: true, force: true });
  });

  it('encrypts plaintext gzip dumps in place, keeping the same filename', async () => {
    const gzipped = zlib.gzipSync(Buffer.from('dump-contents'));
    fs.writeFileSync(path.join(backupDir, 'daily', 'bankapp-20260721.sql.gz'), gzipped);

    const result = await sweepAndEncryptAutoBackups(backupDir);

    expect(result.encrypted).toEqual([path.join('daily', 'bankapp-20260721.sql.gz')]);
    const onDisk = fs.readFileSync(path.join(backupDir, 'daily', 'bankapp-20260721.sql.gz'));
    expect(onDisk.subarray(0, 2).equals(Buffer.from([0x1f, 0x8b]))).toBe(false);
    expect(zlib.gunzipSync(decryptBuffer(onDisk)).toString('utf-8')).toBe('dump-contents');
  });

  it('leaves an already-encrypted file untouched', async () => {
    const gzipped = zlib.gzipSync(Buffer.from('already-done'));
    const filePath = path.join(backupDir, 'weekly', 'bankapp-20260714.sql.gz');
    fs.writeFileSync(filePath, gzipped);
    await sweepAndEncryptAutoBackups(backupDir); // first pass encrypts it
    const afterFirstPass = fs.readFileSync(filePath);

    const result = await sweepAndEncryptAutoBackups(backupDir); // second pass should be a no-op

    expect(result.encrypted).toEqual([]);
    expect(fs.readFileSync(filePath).equals(afterFirstPass)).toBe(true);
  });

  it('encrypts every hard-linked copy, since the sidecar shares one dump across folders', async () => {
    const gzipped = zlib.gzipSync(Buffer.from('shared-dump'));
    const daily = path.join(backupDir, 'daily', 'bankapp-20260801.sql.gz');
    const last = path.join(backupDir, 'last', 'bankapp-20260801-230000.sql.gz');
    fs.mkdirSync(path.join(backupDir, 'last'));
    fs.writeFileSync(daily, gzipped);
    fs.linkSync(daily, last);

    const result = await sweepAndEncryptAutoBackups(backupDir);

    expect(result.encrypted.sort()).toEqual([
      path.join('daily', 'bankapp-20260801.sql.gz'),
      path.join('last', 'bankapp-20260801-230000.sql.gz'),
    ]);
    expect(fs.readFileSync(last).subarray(0, 2).equals(Buffer.from([0x1f, 0x8b]))).toBe(false);
  });

  it('skips the "latest" symlink instead of following and re-encrypting its target twice', async () => {
    const gzipped = zlib.gzipSync(Buffer.from('monthly-dump'));
    const realFile = path.join(backupDir, 'monthly', 'bankapp-20260701.sql.gz');
    fs.writeFileSync(realFile, gzipped);
    fs.symlinkSync(realFile, path.join(backupDir, 'monthly', 'bankapp-latest.sql.gz'));

    const result = await sweepAndEncryptAutoBackups(backupDir);

    expect(result.encrypted).toEqual([path.join('monthly', 'bankapp-20260701.sql.gz')]);
  });
});
