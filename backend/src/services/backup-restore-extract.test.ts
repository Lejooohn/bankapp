import { describe, it, expect } from 'vitest';
import { extractCopyBlock, buildStagingScript, type CopyBlock } from './backup-restore-extract.js';

const SAMPLE_DUMP = `--
-- Some header
--
CREATE TABLE public.categories (id uuid, name text);

COPY public.categories (id, account_id, name, created_at, user_id) FROM stdin;
11111111-1111-1111-1111-111111111111\t22222222-2222-2222-2222-222222222222\tAlimentation\t2026-01-01 00:00:00\t33333333-3333-3333-3333-333333333333
44444444-4444-4444-4444-444444444444\t22222222-2222-2222-2222-222222222222\tLoisirs\t2026-01-01 00:00:00\t33333333-3333-3333-3333-333333333333
\\.

COPY public.transactions (id, account_id, date, description, amount, tiers, details, category, transaction_type, is_reconciled, related_account_id, created_at, updated_at, deleted_at, schedule_id, user_id) FROM stdin;
\\.
`;

describe('extractCopyBlock', () => {
  it('extracts columns and raw data lines for an existing table', () => {
    const block = extractCopyBlock(SAMPLE_DUMP, 'categories');
    expect(block).not.toBeNull();
    expect(block!.columns).toEqual(['id', 'account_id', 'name', 'created_at', 'user_id']);
    expect(block!.dataLines).toContain('Alimentation');
    expect(block!.dataLines).toContain('Loisirs');
    expect(block!.dataLines.endsWith('\n')).toBe(true);
  });

  it('returns an empty dataLines string for a table with zero rows', () => {
    const block = extractCopyBlock(SAMPLE_DUMP, 'transactions');
    expect(block).not.toBeNull();
    expect(block!.dataLines).toBe('');
  });

  it('returns null when the table is not present in the dump', () => {
    const block = extractCopyBlock(SAMPLE_DUMP, 'schedules');
    expect(block).toBeNull();
  });

  it('returns null when the header contains a malicious/invalid column name (SQL injection guard)', () => {
    const dumpWithMaliciousHeader = `COPY public.categories (id, "name); DROP TABLE public.users; --") FROM stdin;
1\tfoo
\\.
`;
    const block = extractCopyBlock(dumpWithMaliciousHeader, 'categories');
    expect(block).toBeNull();
  });

  it('still extracts a real dump with normal snake_case column names', () => {
    const dumpWithSnakeCaseColumns = `COPY public.transactions (id, account_id, created_at, is_reconciled) FROM stdin;
11111111-1111-1111-1111-111111111111\t22222222-2222-2222-2222-222222222222\t2026-01-01 00:00:00\tt
\\.
`;
    const block = extractCopyBlock(dumpWithSnakeCaseColumns, 'transactions');
    expect(block).not.toBeNull();
    expect(block!.columns).toEqual(['id', 'account_id', 'created_at', 'is_reconciled']);
  });
});

describe('buildStagingScript', () => {
  it('builds a script with a staging schema, LIKE table and COPY block per requested table', () => {
    const blocks: Record<string, CopyBlock> = {
      categories: { columns: ['id', 'name'], dataLines: '1\tfoo\n' },
    };
    const script = buildStagingScript(blocks as any);
    expect(script).toContain('CREATE SCHEMA IF NOT EXISTS restore_staging;');
    expect(script).toContain('CREATE TABLE restore_staging.categories (LIKE public.categories);');
    expect(script).toContain('COPY restore_staging.categories (id, name) FROM stdin;');
    expect(script).toContain('1\tfoo');
    expect(script.trim().endsWith('\\.')).toBe(true);
  });

  // psql's COPY-from-stdin parser requires the "\." terminator to be a
  // complete, newline-terminated line. Without a trailing newline after it,
  // psql fails with "end-of-copy marker corrupt" when this script is piped
  // in as-is (reproduced against a real dump before this test was added).
  it('ends the script with a newline after the final COPY terminator', () => {
    const blocks: Record<string, CopyBlock> = {
      categories: { columns: ['id', 'name'], dataLines: '1\tfoo\n' },
    };
    const script = buildStagingScript(blocks as any);
    expect(script.endsWith('\\.\n')).toBe(true);
  });
});
