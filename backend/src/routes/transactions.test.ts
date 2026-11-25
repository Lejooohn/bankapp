// Operation list query, run through the real Express app.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db.js', async () => {
  const h = await import('../../test/harness.js');
  return { default: h.fakeDb.pool, initDB: async () => {} };
});

import { app } from '../index.js';
import { fakeDb, withServer, jsonRequest, AUTH, TEST_USER_ID } from '../../test/harness.js';

beforeEach(() => {
  fakeDb.reset();
  fakeDb.setHandler((sql) => (sql.includes('SELECT id FROM accounts WHERE id') ? { rows: [{ id: 'acc-1' }] } : undefined));
});

const listCall = () => fakeDb.calls.find(c => c.sql.includes('total_count'));

describe('GET /api/accounts/:id/transactions', () => {
  it('extends the page down to `since`, scoped to the account and user', async () => {
    await withServer(app, async (base) => {
      const res = await jsonRequest(base, '/api/accounts/acc-1/transactions?limit=100&since=2026-01-01', { headers: AUTH });
      expect(res.status).toBe(200);
    });
    expect(listCall()!.sql).toMatch(/GREATEST/);
    expect(listCall()!.params).toEqual(['acc-1', TEST_USER_ID, 100, 0, '2026-01-01']);
  });

  it('keeps plain pages capped at 500 without `since`', async () => {
    await withServer(app, async (base) => {
      await jsonRequest(base, '/api/accounts/acc-1/transactions?limit=9999&offset=200', { headers: AUTH });
    });
    expect(listCall()!.params).toEqual(['acc-1', TEST_USER_ID, 500, 200, null]);
  });

  it.each(['hier', '2026-02-31', "2026-01-01';--"])('rejects an invalid `since` (%s) before any query', async (since) => {
    await withServer(app, async (base) => {
      const res = await jsonRequest(base, `/api/accounts/acc-1/transactions?since=${encodeURIComponent(since)}`, { headers: AUTH });
      expect(res.status).toBe(400);
    });
    expect(listCall()).toBeUndefined();
  });
});
