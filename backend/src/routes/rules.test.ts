// Categorization rules: switching a rule off and deleting it are different things.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db.js', async () => {
  const h = await import('../../test/harness.js');
  return { default: h.fakeDb.pool, initDB: async () => {} };
});

import { app } from '../index.js';
import { fakeDb, withServer, jsonRequest, AUTH } from '../../test/harness.js';

const RULE = { id: 'r-1', account_id: 'acc-1', tiers_pattern: 'Netflix', details_pattern: 'Streaming', category: 'Abonnement', active: true };

function serve(rows: any[] = [RULE], onRule?: (sql: string) => void) {
  fakeDb.setHandler((sql) => {
    if (sql.includes('FROM accounts WHERE id')) return { rows: [{ id: 'acc-1' }] };
    if (sql.includes('categorization_rules')) { onRule?.(sql); return { rows }; }
    return undefined;
  });
}
const ruleCalls = () => fakeDb.calls.filter(c => c.sql.includes('categorization_rules'));
const call = (base: string, path: string, method = 'GET', body?: unknown) =>
  jsonRequest(base, `/api/accounts/acc-1/rules${path}`, { method, headers: AUTH, body });

beforeEach(() => fakeDb.reset());

describe('rules: disabled is not deleted', () => {
  it('lists disabled rules and leaves deleted ones out', async () => {
    serve([RULE, { ...RULE, id: 'r-2', active: false }]);
    await withServer(app, async (base) => {
      const res = await call(base, '');
      expect(res.status).toBe(200);
      expect(await res.json()).toHaveLength(2);
    });
    expect(ruleCalls()[0].sql).toContain('deleted_at IS NULL');
    expect(ruleCalls()[0].sql).not.toContain('active = true');
  });

  it('deletes with deleted_at and keeps the row', async () => {
    serve();
    await withServer(app, async (base) => { expect((await call(base, '/r-1', 'DELETE')).status).toBe(200); });
    expect(ruleCalls()[0].sql).toMatch(/^UPDATE categorization_rules SET active = false, deleted_at = NOW\(\)/);
  });

  it('switches a rule without touching deleted_at, and never a deleted one', async () => {
    serve([{ ...RULE, active: false }]);
    await withServer(app, async (base) => { expect((await call(base, '/r-1/toggle', 'PUT', {})).status).toBe(200); });
    const { sql } = ruleCalls()[0];
    expect(sql).toContain('active = NOT active');
    expect(sql).toContain('deleted_at IS NULL');
    expect(sql).not.toContain('deleted_at = ');
  });

  it('answers 404 on a deleted rule for every action on it', async () => {
    serve([]);
    await withServer(app, async (base) => {
      expect((await call(base, '/r-1/toggle', 'PUT', {})).status).toBe(404);
      expect((await call(base, '/r-1/preview')).status).toBe(404);
      expect((await call(base, '/r-1/matches')).status).toBe(404);
      expect((await call(base, '/r-1', 'PATCH', { tiers_pattern: 'X', details_pattern: null, category: 'Y' })).status).toBe(404);
      expect((await call(base, '/r-1/add-patterns', 'PATCH', { tiers: 'X' })).status).toBe(404);
    });
    for (const c of ruleCalls()) expect(c.sql).toContain('deleted_at IS NULL');
  });
});

describe('rules: duplicates', () => {
  const body = { tiers_pattern: 'Netflix', details_pattern: 'Streaming', category: 'Abonnement' };

  it('revives a deleted rule that is created again', async () => {
    serve();
    await withServer(app, async (base) => { expect((await call(base, '', 'POST', body)).status).toBe(200); });
    expect(ruleCalls()[0].sql).toMatch(/DO UPDATE SET[\s\S]*active = true, deleted_at = NULL[\s\S]*WHERE categorization_rules\.deleted_at IS NOT NULL/);
  });

  it('refuses a duplicate of a rule that still exists', async () => {
    serve([]);
    await withServer(app, async (base) => { expect((await call(base, '', 'POST', body)).status).toBe(409); });
  });

  it('answers 409, not 500, when an edit collides with another rule', async () => {
    serve([], () => { throw Object.assign(new Error('duplicate key'), { code: '23505' }); });
    await withServer(app, async (base) => { expect((await call(base, '/r-1', 'PATCH', body)).status).toBe(409); });
  });
});
