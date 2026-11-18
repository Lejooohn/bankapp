import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../db.js', () => ({ default: { query: (...args: unknown[]) => query(...args) } }));

const { updateBudget } = await import('./budgets.js');

// Every $n in the SQL must have a matching parameter, and the id/user id must be the last two.
function placeholders(sql: string): number[] {
  return [...sql.matchAll(/\$(\d+)/g)].map(m => Number(m[1]));
}

describe('updateBudget parameter binding', () => {
  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue({ rows: [{ id: 'b1' }] });
  });

  it('binds a single changed field with the id and user id after it', async () => {
    await updateBudget('b1', { amount: 90 }, 'u1');
    const [sql, params] = query.mock.calls[0];
    expect(params).toEqual([90, 'b1', 'u1']);
    expect(placeholders(sql).every(n => n >= 1 && n <= params.length)).toBe(true);
    expect(sql).toContain('WHERE b.id = $2 AND b.user_id = $3');
  });

  it('binds several changed fields in order', async () => {
    await updateBudget('b1', { name: 'Loisirs', is_active: false }, 'u1');
    const [sql, params] = query.mock.calls[0];
    expect(params).toEqual(['Loisirs', false, 'b1', 'u1']);
    expect(sql).toContain('WHERE b.id = $3 AND b.user_id = $4');
  });

  it('returns null without querying when nothing changes', async () => {
    expect(await updateBudget('b1', {}, 'u1')).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
});
