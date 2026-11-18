import { describe, it, expect, vi } from 'vitest';
import { performRestore, restoreToCurrentAccount, restoreToNewAccount, restoreFromSafetySnapshot } from './backup-restore-apply.js';

// Minimal fake PoolClient: records every call, lets a test throw on a
// specific SQL substring to simulate a mid-transaction failure.
function makeFakeClient(opts: { failOn?: string } = {}) {
  const calls: Array<{ sql: string; params: any[] }> = [];
  const query = vi.fn(async (sql: string, params: any[] = []) => {
    calls.push({ sql, params });
    if (opts.failOn && sql.includes(opts.failOn)) {
      throw new Error(`simulated failure on: ${opts.failOn}`);
    }
    return { rows: [], rowCount: 0 };
  });
  return { query, calls };
}

describe('performRestore — transaction integrity', () => {
  it('commits once when every step succeeds', async () => {
    const client = makeFakeClient();
    const result = await performRestore(client as any, {
      accountId: 'acc-1',
      userId: 'user-1',
      tables: ['categories'],
      destination: 'current',
    });

    expect(result.destination).toBe('current');
    const sqlCalls = client.calls.map(c => c.sql);
    expect(sqlCalls[0]).toBe('BEGIN');
    expect(sqlCalls[sqlCalls.length - 1]).toBe('COMMIT');
    expect(sqlCalls).not.toContain('ROLLBACK');
  });

  it('rolls back and rejects when a step fails mid-transaction', async () => {
    const client = makeFakeClient({ failOn: 'DELETE FROM categories' });

    await expect(
      performRestore(client as any, {
        accountId: 'acc-1',
        userId: 'user-1',
        tables: ['categories'],
        destination: 'current',
      })
    ).rejects.toThrow('simulated failure');

    const sqlCalls = client.calls.map(c => c.sql);
    expect(sqlCalls).toContain('ROLLBACK');
    expect(sqlCalls).not.toContain('COMMIT');
  });
});

describe('restoreToCurrentAccount', () => {
  it('deletes then inserts each requested table, scoped to account_id and user_id', async () => {
    const client = makeFakeClient();
    await restoreToCurrentAccount(client as any, {
      accountId: 'acc-1',
      userId: 'user-1',
      tables: ['transactions', 'categories'],
    });

    // Order must follow FK-safe TABLE_ORDER regardless of input order.
    const tableOrder = client.calls
      .filter(c => c.sql.startsWith('DELETE FROM'))
      .map(c => c.sql.match(/DELETE FROM (\w+)/)![1]);
    expect(tableOrder).toEqual(['categories', 'transactions']);

    for (const call of client.calls) {
      if (call.sql.startsWith('DELETE FROM') || call.sql.startsWith('INSERT INTO')) {
        expect(call.params).toContain('acc-1');
        expect(call.params).toContain('user-1');
      }
    }
  });
});

describe('restoreToNewAccount', () => {
  it('nulls related_account_id and target_account_id, never reuses the source account id', async () => {
    const client = makeFakeClient();
    await restoreToNewAccount(client as any, {
      sourceAccountId: 'acc-source',
      newAccountId: 'acc-new',
      userId: 'user-1',
      tables: ['transactions'],
    });

    const insertCall = client.calls.find(c => c.sql.startsWith('INSERT INTO transactions'));
    expect(insertCall).toBeDefined();
    expect(insertCall!.sql).toContain('NULL');
    expect(insertCall!.params).toContain('acc-new');
    expect(insertCall!.params).toContain('acc-source');
  });
});

describe('restoreFromSafetySnapshot — identifier hardening', () => {
  it('rejects a snapshot row whose keys include an invalid identifier instead of building the query', async () => {
    const client = makeFakeClient();

    await expect(
      restoreFromSafetySnapshot(client as any, {
        accountId: 'acc-1',
        userId: 'user-1',
        snapshot: {
          categories: [
            { id: 'row-1', name: 'Groceries', 'id); DROP TABLE users; --': 'evil' },
          ],
        },
      })
    ).rejects.toThrow();

    // Must fail before any INSERT for the tainted table is issued.
    const insertCalls = client.calls.filter(c => c.sql.startsWith('INSERT INTO categories'));
    expect(insertCalls).toHaveLength(0);
  });
});
