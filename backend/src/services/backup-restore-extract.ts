import { spawn } from 'child_process';
import crypto from 'crypto';

export const RESTORABLE_TABLES = ['categories', 'categorization_rules', 'schedules', 'transactions'] as const;
export type RestorableTable = typeof RESTORABLE_TABLES[number];

export interface CopyBlock {
  columns: string[];
  dataLines: string;
}

// Extracts the raw COPY block for one table from a plain-text pg_dump.
// Data lines are returned byte-for-byte, unparsed — the actual row parsing
// is delegated to psql via loadStagingSchema(), since pg_dump's COPY text
// escaping (tabs, newlines, backslashes) is error-prone to hand-roll.
export function extractCopyBlock(dumpText: string, tableName: string): CopyBlock | null {
  const lines = dumpText.split('\n');
  const headerPrefix = `COPY public.${tableName} (`;
  const headerSuffix = ') FROM stdin;';

  const headerIdx = lines.findIndex(l => l.startsWith(headerPrefix) && l.endsWith(headerSuffix));
  if (headerIdx === -1) return null;

  const headerLine = lines[headerIdx];
  const columnsPart = headerLine.slice(headerPrefix.length, headerLine.length - headerSuffix.length);
  const columns = columnsPart.split(',').map(c => c.trim());

  // Defense-in-depth: columns are later interpolated unquoted into a
  // generated COPY statement (see buildStagingScript). Reject anything that
  // isn't a plain PostgreSQL unquoted identifier, so a crafted/corrupted
  // dump can't break out of the column list and inject arbitrary SQL.
  const isValidIdentifier = (c: string) => /^[a-z_][a-z0-9_]*$/.test(c);
  if (!columns.every(isValidIdentifier)) return null;

  const dataStart = headerIdx + 1;
  const terminatorIdx = lines.indexOf('\\.', dataStart);
  if (terminatorIdx === -1) return null;

  const dataLines = terminatorIdx > dataStart
    ? lines.slice(dataStart, terminatorIdx).join('\n') + '\n'
    : '';

  return { columns, dataLines };
}

export const DEFAULT_STAGING_SCHEMA = 'restore_staging';

// Staging schema names are interpolated into SQL, so they must be plain identifiers.
export function assertStagingSchema(schema: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('Invalid staging schema name');
  return schema;
}

// Each restore request gets its own staging schema: a shared one would let two concurrent
// restores drop or overwrite each other's staged rows mid-transaction.
export function newStagingSchemaName(): string {
  return `restore_stg_${crypto.randomBytes(8).toString('hex')}`;
}

export function buildStagingScript(
  blocks: Partial<Record<RestorableTable, CopyBlock>>,
  schema: string = DEFAULT_STAGING_SCHEMA
): string {
  const s = assertStagingSchema(schema);
  const parts: string[] = [`CREATE SCHEMA IF NOT EXISTS ${s};`];

  for (const table of RESTORABLE_TABLES) {
    const block = blocks[table];
    if (!block) continue;
    parts.push(`DROP TABLE IF EXISTS ${s}.${table};`);
    parts.push(`CREATE TABLE ${s}.${table} (LIKE public.${table});`);
    parts.push(`COPY ${s}.${table} (${block.columns.join(', ')}) FROM stdin;`);
    parts.push(block.dataLines + '\\.');
  }

  // Trailing newline is required: psql's COPY-from-stdin parser only
  // recognizes "\." as the terminator when it's a complete, newline-ended
  // line, and it's always the last element joined here.
  return parts.join('\n') + '\n';
}

// Pipes the staging script into psql against the live database. Requires the
// `postgresql-client` package in the backend's Docker image (see Task 3).
export function loadStagingSchema(databaseUrl: string, script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const psql = spawn('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    psql.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    psql.on('error', reject);
    psql.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`psql exited with code ${code}: ${stderr.trim()}`));
    });
    psql.stdin.write(script);
    psql.stdin.end();
  });
}
