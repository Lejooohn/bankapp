// Non-regression tests for the security audit fixes, run through the real Express app.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import bcrypt from 'bcryptjs';

vi.mock('../db.js', async () => {
  const h = await import('../../test/harness.js');
  return { default: h.fakeDb.pool, initDB: async () => {} };
});
// The restore route shells out to psql; capture the staging script instead.
vi.mock('../services/backup-restore-extract.js', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, loadStagingSchema: vi.fn(async () => {}) };
});

import { app } from '../index.js';
import { fakeDb, withServer, jsonRequest, AUTH, TEST_USER_ID } from '../../test/harness.js';
import { loadStagingSchema } from '../services/backup-restore-extract.js';
import { encryptBuffer } from '../services/encryption.js';

beforeEach(() => { fakeDb.reset(); });

describe('API response headers', () => {
  it('sends nosniff, frame denial, referrer policy and CORP, and hides X-Powered-By', async () => {
    await withServer(app, async (base) => {
      const res = await jsonRequest(base, '/api/health');
      expect(res.status).toBe(200);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
      expect(res.headers.get('cross-origin-resource-policy')).toBe('same-origin');
      expect(res.headers.get('x-powered-by')).toBeNull();
    });
  });
});

describe('removed endpoints', () => {
  it('no longer exposes the legacy settings change-password route', async () => {
    await withServer(app, async (base) => {
      const res = await jsonRequest(base, '/api/settings/change-password', {
        method: 'POST', headers: AUTH, body: { current_password: 'a', new_password: 'b', confirm_password: 'b' },
      });
      expect(res.status).toBe(404);
    });
  });

  it('no longer exposes the global dev clear-categories route to users', async () => {
    await withServer(app, async (base) => {
      const res = await jsonRequest(base, '/api/dev/clear-categories', { method: 'POST', headers: AUTH });
      expect(res.status).toBe(404);
      expect(fakeDb.calls.some(c => c.sql.includes('UPDATE transactions SET category = NULL'))).toBe(false);
    });
  });
});

describe('full-dump restore authorization and staging isolation', () => {
  let backupDir: string;
  const FULL_DUMP = 'bankapp-20260101-010101.sql.gz';
  const DUMP_TEXT = [
    'COPY public.categories (id, name) FROM stdin;',
    'c1\tFood',
    '\\.',
    '',
  ].join('\n');

  beforeEach(() => {
    backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-restore-'));
    fs.mkdirSync(path.join(backupDir, 'last'), { recursive: true });
    fs.writeFileSync(
      path.join(backupDir, 'last', FULL_DUMP),
      encryptBuffer(zlib.gzipSync(Buffer.from(DUMP_TEXT)))
    );
    process.env.BACKUP_DIR = backupDir;
    vi.mocked(loadStagingSchema).mockClear();
    fakeDb.setHandler((sql) => {
      if (sql.includes('SELECT id FROM accounts WHERE id')) return { rows: [{ id: 'acc-1' }] };
      return undefined;
    });
  });

  afterEach(() => {
    delete process.env.BACKUP_DIR;
    fs.rmSync(backupDir, { recursive: true, force: true });
  });

  const restoreBody = { filename: FULL_DUMP, tables: ['categories'], destination: 'current' };

  it('refuses a full dump to a non-admin user before touching the database', async () => {
    fakeDb.setRole('user');
    await withServer(app, async (base) => {
      const res = await jsonRequest(base, '/api/accounts/acc-1/backup/restore', { method: 'POST', headers: AUTH, body: restoreBody });
      expect(res.status).toBe(403);
    });
    expect(loadStagingSchema).not.toHaveBeenCalled();
    expect(fakeDb.calls.some(c => c.sql === 'BEGIN')).toBe(false);
  });

  it('still lets an admin restore from a full dump', async () => {
    fakeDb.setRole('admin');
    await withServer(app, async (base) => {
      const res = await jsonRequest(base, '/api/accounts/acc-1/backup/restore', { method: 'POST', headers: AUTH, body: restoreBody });
      expect(res.status).toBe(200);
    });
    expect(loadStagingSchema).toHaveBeenCalledTimes(1);
  });

  it('stages each request in its own schema and drops only that schema afterwards', async () => {
    fakeDb.setRole('admin');
    const schemas: string[] = [];
    await withServer(app, async (base) => {
      for (let i = 0; i < 2; i++) {
        const res = await jsonRequest(base, '/api/accounts/acc-1/backup/restore', { method: 'POST', headers: AUTH, body: restoreBody });
        expect(res.status).toBe(200);
      }
    });

    const scripts = vi.mocked(loadStagingSchema).mock.calls.map(c => c[1] as string);
    for (const script of scripts) {
      const m = script.match(/CREATE SCHEMA IF NOT EXISTS (restore_stg_[a-f0-9]{16});/);
      expect(m, 'staging schema must be per-request').not.toBeNull();
      schemas.push(m![1]);
      expect(script).not.toContain('restore_staging');
    }
    expect(new Set(schemas).size).toBe(2);

    const drops = fakeDb.calls.filter(c => c.sql.startsWith('DROP SCHEMA')).map(c => c.sql);
    expect(drops).toHaveLength(2);
    for (const schema of schemas) {
      expect(drops).toContain(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    }
    expect(drops.some(d => d.includes('restore_staging'))).toBe(false);
  });
});

describe('login rate limiting and timing', () => {
  const hashedPassword = bcrypt.hashSync('Correct-Password-123', 4);
  function loginHandler(username: string) {
    fakeDb.setHandler((sql, params) => {
      if (sql.includes('FROM users WHERE username')) {
        if (params[0] !== username) return { rows: [] };
        return { rows: [{ id: `id-${username}`, username, email: null, password_hash: hashedPassword, theme: 'light', theme_schedule: null, role: 'user' }] };
      }
      return undefined;
    });
  }

  it('caps wrong guesses from one client against one username', async () => {
    const username = `pair-${Math.random().toString(36).slice(2)}`;
    loginHandler(username);
    const statuses: number[] = [];
    await withServer(app, async (base) => {
      for (let i = 0; i < 6; i++) {
        const res = await jsonRequest(base, '/api/auth/login', {
          method: 'POST', headers: { 'X-Forwarded-For': '10.40.0.1' },
          body: { username, password: 'wrong-password-123' },
        });
        statuses.push(res.status);
      }
    });
    // Five wrong guesses are answered 401; the sixth from the same client is refused.
    expect(statuses.slice(0, 5).every(s => s === 401)).toBe(true);
    expect(statuses[5]).toBe(429);
  });

  it('runs a bcrypt comparison even when the username does not exist', async () => {
    const spy = vi.spyOn(bcrypt, 'compare');
    try {
      await withServer(app, async (base) => {
        const res = await jsonRequest(base, '/api/auth/login', {
          method: 'POST',
          headers: { 'X-Forwarded-For': '10.99.0.1' },
          body: { username: `ghost-${Math.random().toString(36).slice(2)}`, password: 'whatever-password' },
        });
        expect(res.status).toBe(401);
      });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(String(spy.mock.calls[0][1])).toMatch(/^\$2[aby]\$10\$/);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('error responses', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('does not echo internal database error text to clients in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    fakeDb.setHandler((sql) => {
      if (sql.includes('FROM accounts WHERE id')) throw new Error('SECRET relation "accounts_internal" detail');
      return undefined;
    });
    await withServer(app, async (base) => {
      const res = await jsonRequest(base, '/api/accounts/acc-1/rules/rule-1', {
        method: 'PATCH', headers: AUTH, body: { tiers_pattern: 'carrefour', category: 'Food' },
      });
      expect(res.status).toBe(500);
      const text = await res.text();
      expect(text).not.toContain('SECRET');
      expect(text).not.toContain('accounts_internal');
    });
  });
});

describe('transaction lock lookup is scoped to the requesting user', () => {
  it('answers 404, not 403, for a locked transaction owned by another user', async () => {
    // The transaction belongs to 'u-2' and is locked. The scoped lookup only finds it
    // for its owner, so a non-owner must not learn that it exists or is locked.
    fakeDb.setHandler((sql, params) => {
      if (sql.includes('is_locked FROM transactions')) {
        if (sql.includes('a.user_id') && params[1] === TEST_USER_ID) return { rows: [] };
        if (sql.includes('a.user_id')) return { rows: [{ is_locked: true }] };
        return { rows: [{ is_locked: true }] }; // unscoped query: leaks lock state
      }
      return undefined;
    });
    await withServer(app, async (base) => {
      const res = await jsonRequest(base, '/api/transactions/t-owned-by-other', { method: 'DELETE', headers: AUTH });
      expect(res.status).toBe(404);
    });
    const lookup = fakeDb.calls.find(c => c.sql.includes('is_locked FROM transactions'));
    expect(lookup).toBeDefined();
    expect(lookup!.sql).toContain('a.user_id');
    expect(lookup!.params).toContain(TEST_USER_ID);
  });
});

describe('request body limits', () => {
  // Regression: the global 1 MB parser ran before the import route's 50 MB parser, so every
  // import above 1 MB was refused with 413.
  it('lets a 3 MB CSV import reach the import route', async () => {
    await withServer(app, async (base) => {
      const res = await jsonRequest(base, '/api/accounts/acc-1/import', {
        method: 'POST', headers: AUTH, body: { csv: 'a'.repeat(3_000_000) },
      });
      // The route checks ownership next: the fake database has no such account, so 403, not 413.
      expect(res.status).toBe(403);
    });
  });

  // Regression: the 50 MB parser must not run before authentication.
  it('answers an unauthenticated import request with 401 without reading a large body', async () => {
    await withServer(app, async (base) => {
      const res = await jsonRequest(base, '/api/accounts/acc-1/import', {
        method: 'POST', body: { csv: 'a'.repeat(3_000_000) },
      });
      expect(res.status).toBe(401);
    });
  });

  it('keeps the 1 MB limit on every other route', async () => {
    await withServer(app, async (base) => {
      const res = await jsonRequest(base, '/api/accounts', {
        method: 'POST', headers: AUTH, body: { name: 'x'.repeat(2_000_000) },
      });
      expect(res.status).toBe(413);
    });
  });
});
