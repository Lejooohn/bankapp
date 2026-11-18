import { describe, it, expect } from 'vitest';
import {
  buildStagingScript,
  newStagingSchemaName,
  assertStagingSchema,
  type CopyBlock,
} from './backup-restore-extract.js';
import { restoreToCurrentAccount } from './backup-restore-apply.js';

const block: CopyBlock = { columns: ['id', 'name'], dataLines: 'c1\tFood\n' };

describe('staging schema naming', () => {
  it('generates distinct, identifier-safe names per call', () => {
    const names = new Set(Array.from({ length: 50 }, () => newStagingSchemaName()));
    expect(names.size).toBe(50);
    for (const n of names) expect(n).toMatch(/^restore_stg_[a-f0-9]{16}$/);
  });

  it('rejects anything that is not a plain identifier, since the name goes into SQL', () => {
    expect(() => assertStagingSchema('restore_x; DROP TABLE accounts')).toThrow('Invalid staging schema name');
    expect(() => assertStagingSchema('Restore')).toThrow();
    expect(() => assertStagingSchema('a-b')).toThrow();
    expect(() => buildStagingScript({ categories: block }, 'x"; DROP')).toThrow();
  });

  it('keeps the shared default name for existing callers', () => {
    const script = buildStagingScript({ categories: block });
    expect(script).toContain('CREATE SCHEMA IF NOT EXISTS restore_staging;');
  });

  it('writes the staging script only into the schema it is given', () => {
    const schema = 'restore_stg_0123456789abcdef';
    const script = buildStagingScript({ categories: block, transactions: { columns: ['id'], dataLines: '' } }, schema);
    expect(script).not.toContain('restore_staging');
    expect(script).toContain(`CREATE TABLE ${schema}.categories (LIKE public.categories);`);
    expect(script).toContain(`COPY ${schema}.transactions (id) FROM stdin;`);
  });
});

describe('restoreToCurrentAccount reads from the request-scoped staging schema', () => {
  it('selects staged rows from the given schema only', async () => {
    const calls: string[] = [];
    const client = {
      query: async (sql: string) => { calls.push(sql); return { rows: [], rowCount: 0 }; },
    };
    const schema = 'restore_stg_0123456789abcdef';
    await restoreToCurrentAccount(client as any, { accountId: 'a', userId: 'u', tables: ['categories'], stagingSchema: schema });
    const insert = calls.find(s => s.startsWith('INSERT INTO categories'));
    expect(insert).toBe(`INSERT INTO categories SELECT * FROM ${schema}.categories WHERE account_id = $1 AND user_id = $2`);
    expect(calls.some(s => s.includes('restore_staging'))).toBe(false);
  });
});
