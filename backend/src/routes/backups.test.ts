// Every dump shown in the Backups dialog can be downloaded, restored and deleted, run through the real Express app.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';

vi.mock('../db.js', async () => {
  const h = await import('../../test/harness.js');
  return { default: h.fakeDb.pool, initDB: async () => {} };
});
vi.mock('../services/backup-restore-extract.js', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, loadStagingSchema: vi.fn(async () => {}) };
});

import { app } from '../index.js';
import { fakeDb, withServer, jsonRequest, AUTH } from '../../test/harness.js';
import { encryptBuffer } from '../services/encryption.js';

const DAILY = 'bankapp-20261124.sql.gz';
const MANUAL = 'bankapp-20261124-172027.sql.gz';
const LAST = 'bankapp-20261124-230000.sql.gz';
const DUMP = ['COPY public.categories (id, name) FROM stdin;', 'c1\tFood', '\\.', ''].join('\n');
const FILES = { daily: DAILY, manual: MANUAL, last: LAST };

let backupDir: string;
const fileOf = (dir: string, name: string) => path.join(backupDir, dir, name);

beforeEach(() => {
  backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-files-'));
  for (const [dir, name] of Object.entries(FILES)) {
    fs.mkdirSync(path.join(backupDir, dir));
    fs.writeFileSync(fileOf(dir, name), encryptBuffer(zlib.gzipSync(Buffer.from(DUMP))));
  }
  process.env.BACKUP_DIR = backupDir;
  fakeDb.reset();
  fakeDb.setRole('admin');
  fakeDb.setHandler((sql) => (sql.includes('SELECT id FROM accounts WHERE id') ? { rows: [{ id: 'acc-1' }] } : undefined));
});

afterEach(() => {
  delete process.env.BACKUP_DIR;
  fs.rmSync(backupDir, { recursive: true, force: true });
});

describe.each(Object.entries(FILES))('dump in %s/', (dir, name) => {
  it('is deleted, and only that file', async () => {
    await withServer(app, async (base) => {
      const res = await jsonRequest(base, `/api/backup/${name}`, { method: 'DELETE', headers: AUTH });
      expect(res.status).toBe(200);
    });
    for (const [d, n] of Object.entries(FILES)) expect(fs.existsSync(fileOf(d, n))).toBe(d !== dir);
  });

  it('is downloaded decrypted', async () => {
    await withServer(app, async (base) => {
      const res = await jsonRequest(base, `/api/backup/download/${name}`, { headers: AUTH });
      expect(res.status).toBe(200);
      expect(zlib.gunzipSync(Buffer.from(await res.arrayBuffer())).toString()).toBe(DUMP);
    });
  });

  it('is restored', async () => {
    await withServer(app, async (base) => {
      const res = await jsonRequest(base, '/api/accounts/acc-1/backup/restore', {
        method: 'POST', headers: AUTH, body: { filename: name, tables: ['categories'], destination: 'current' },
      });
      expect(res.status).toBe(200);
    });
  });
});

describe('backup deletion guards', () => {
  it('answers 404 for a file no folder holds', async () => {
    await withServer(app, async (base) => {
      const res = await jsonRequest(base, '/api/backup/bankapp-20200101-000000.sql.gz', { method: 'DELETE', headers: AUTH });
      expect(res.status).toBe(404);
    });
  });

  it.each(['..%2Fmanual%2Fbankapp-20261124-172027.sql.gz', 'bankapp-latest.sql.gz'])('rejects the name %s', async (name) => {
    await withServer(app, async (base) => {
      const res = await jsonRequest(base, `/api/backup/${name}`, { method: 'DELETE', headers: AUTH });
      expect(res.status).toBe(400);
    });
    expect(fs.existsSync(fileOf('manual', MANUAL))).toBe(true);
  });

  it('refuses a non-admin user', async () => {
    fakeDb.setRole('user');
    await withServer(app, async (base) => {
      const res = await jsonRequest(base, `/api/backup/${MANUAL}`, { method: 'DELETE', headers: AUTH });
      expect(res.status).toBe(403);
    });
    expect(fs.existsSync(fileOf('manual', MANUAL))).toBe(true);
  });
});

describe('deleting all manual backups', () => {
  const OLDER = 'bankapp-20261116-113030.sql.gz';
  const bulk = (base: string, filenames: unknown) =>
    jsonRequest(base, '/api/backup/manual/delete-bulk', { method: 'POST', headers: AUTH, body: { filenames } });

  beforeEach(() => fs.writeFileSync(fileOf('manual', OLDER), 'x'));

  it('deletes the given files and their tracking rows, and leaves the other folders alone', async () => {
    fs.writeFileSync(fileOf('daily', MANUAL), 'x'); // same name in another folder
    await withServer(app, async (base) => {
      const res = await bulk(base, [MANUAL, OLDER]);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ deleted: [MANUAL, OLDER], failed: [] });
    });
    expect(fs.readdirSync(path.join(backupDir, 'manual'))).toEqual([]);
    expect(fs.readdirSync(path.join(backupDir, 'daily')).sort()).toEqual([MANUAL, DAILY].sort());
    expect(fs.existsSync(fileOf('last', LAST))).toBe(true);
    expect(fakeDb.calls.find(c => c.sql.includes('DELETE FROM backups'))!.params).toEqual([[MANUAL, OLDER]]);
  });

  it('keeps a manual backup that was not in the list', async () => {
    await withServer(app, async (base) => { expect((await bulk(base, [OLDER])).status).toBe(200); });
    expect(fs.existsSync(fileOf('manual', MANUAL))).toBe(true);
  });

  it('counts a file that is already gone as deleted', async () => {
    fs.rmSync(fileOf('manual', OLDER));
    await withServer(app, async (base) => {
      expect(await (await bulk(base, [OLDER])).json()).toEqual({ deleted: [OLDER], failed: [] });
    });
  });

  it('reports a file it could not delete and goes on with the others', async () => {
    fs.rmSync(fileOf('manual', OLDER));
    fs.mkdirSync(fileOf('manual', OLDER)); // a folder: fs.rm without recursive refuses it
    await withServer(app, async (base) => {
      expect(await (await bulk(base, [OLDER, MANUAL])).json()).toEqual({ deleted: [MANUAL], failed: [OLDER] });
    });
  });

  it.each([[[]], [['../daily/' + DAILY]], [['bankapp-latest.sql.gz']], [undefined]])('rejects %j without deleting anything', async (filenames) => {
    await withServer(app, async (base) => { expect((await bulk(base, filenames)).status).toBe(400); });
    expect(fs.readdirSync(path.join(backupDir, 'manual')).sort()).toEqual([OLDER, MANUAL].sort());
  });

  it('refuses a non-admin user', async () => {
    fakeDb.setRole('user');
    await withServer(app, async (base) => { expect((await bulk(base, [MANUAL])).status).toBe(403); });
    expect(fs.existsSync(fileOf('manual', MANUAL))).toBe(true);
  });
});

describe('levels', () => {
  const WEEK_11 = 'bankapp-202611.sql.gz'; // also the name of the November 2026 monthly dump
  const PRE = 'dump-before-20261120-101500.sql.gz';
  const put = (dir: string, name: string, text: string) => {
    fs.mkdirSync(path.join(backupDir, dir), { recursive: true });
    fs.writeFileSync(fileOf(dir, name), encryptBuffer(zlib.gzipSync(Buffer.from(text))));
  };
  const download = async (base: string, name: string, category: string) =>
    zlib.gunzipSync(Buffer.from(await (await jsonRequest(base, `/api/backup/download/${name}?category=${category}`, { headers: AUTH })).arrayBuffer())).toString();

  beforeEach(() => { put('weekly', WEEK_11, 'week'); put('monthly', WEEK_11, 'month'); put('pre-restore', PRE, 'pre'); });

  it('tells apart a weekly and a monthly dump of the same name', async () => {
    await withServer(app, async (base) => {
      expect(await download(base, WEEK_11, 'weekly')).toBe('week');
      expect(await download(base, WEEK_11, 'monthly')).toBe('month');
      expect(await download(base, PRE, 'pre-restore')).toBe('pre');
    });
  });

  it('refuses a weekly or monthly name without its level', async () => {
    await withServer(app, async (base) => {
      expect((await jsonRequest(base, `/api/backup/download/${WEEK_11}`, { headers: AUTH })).status).toBe(400);
    });
  });

  it.each(['weekly', 'monthly'])('never deletes a %s dump', async (category) => {
    await withServer(app, async (base) => {
      expect((await jsonRequest(base, `/api/backup/${WEEK_11}?category=${category}`, { method: 'DELETE', headers: AUTH })).status).toBe(400);
    });
    expect(fs.existsSync(fileOf(category, WEEK_11))).toBe(true);
  });

  it('restores the monthly dump, not the weekly one', async () => {
    put('monthly', WEEK_11, DUMP); // the weekly file holds no categories table
    const body = { filename: WEEK_11, tables: ['categories'], destination: 'current' };
    const restore = (base: string, category: string) =>
      jsonRequest(base, '/api/accounts/acc-1/backup/restore', { method: 'POST', headers: AUTH, body: { ...body, category } });
    await withServer(app, async (base) => {
      expect((await restore(base, 'monthly')).status).toBe(200);
      expect((await restore(base, 'weekly')).status).toBe(422);
    });
  });

  it.each(['last', '../manual', 'weekly/..'])('rejects the level %s', async (category) => {
    await withServer(app, async (base) => {
      for (const method of ['DELETE', 'GET']) {
        const url = method === 'GET' ? `/api/backup/download/${MANUAL}` : `/api/backup/${MANUAL}`;
        expect((await jsonRequest(base, `${url}?category=${encodeURIComponent(category)}`, { method, headers: AUTH })).status).toBe(400);
      }
    });
    expect(fs.existsSync(fileOf('manual', MANUAL))).toBe(true);
  });

  it('lists every level to an admin, with the policy, and removes expired manual dumps', async () => {
    const old = 'bankapp-20260101-000000.sql.gz';
    put('manual', old, 'old');
    fs.utimesSync(fileOf('manual', old), new Date('2026-01-01'), new Date('2026-01-01'));
    vi.stubEnv('SCHEDULE', '0 23 * * *');
    vi.stubEnv('BACKUP_KEEP_DAYS', '7');
    try {
      await withServer(app, async (base) => {
        const body: any = await (await jsonRequest(base, '/api/backup/status', { headers: AUTH })).json();
        expect(body.backups.map((b: any) => [b.category, b.filename])).toEqual([
          ['daily', DAILY], ['weekly', WEEK_11], ['monthly', WEEK_11], ['manual', MANUAL], ['pre-restore', PRE],
        ]);
        expect(body.policy).toMatchObject({ schedule: { hour: 23, minute: 0 }, keepDays: 7, manualDays: 30, snapshotsPerAccount: 3 });
        expect(body.automatic.state).toBe('ok');
      });
    } finally { vi.unstubAllEnvs(); }
    expect(fs.existsSync(fileOf('manual', old))).toBe(false);
  });

  it('shows no dump to a non-admin user, only the policy', async () => {
    fakeDb.setRole('user');
    await withServer(app, async (base) => {
      const body: any = await (await jsonRequest(base, '/api/backup/status', { headers: AUTH })).json();
      expect(body.backups).toEqual([]);
      expect(body.automatic).toBeNull();
      expect(body.policy.manualDays).toBe(30);
    });
  });
});
