import fs from 'fs/promises';
import path from 'path';
import zlib from 'zlib';
import type { PoolClient } from 'pg';
import { RESTORABLE_TABLES, DEFAULT_STAGING_SCHEMA, assertStagingSchema, type RestorableTable } from './backup-restore-extract.js';
import { encryptBuffer } from './encryption.js';

export interface RestoreResult {
  table: RestorableTable;
  deleted: number;
  inserted: number;
}

function orderTables(tables: RestorableTable[]): RestorableTable[] {
  return RESTORABLE_TABLES.filter(t => tables.includes(t));
}

// Return err.message in dev, opaque message in production — mirrors index.ts's errMsg().
export function errMsg(err: any): string {
  return process.env.NODE_ENV === 'production' ? 'Erreur interne' : err.message;
}

export async function checkAccountOwnership(client: PoolClient, accountId: string, userId: string): Promise<boolean> {
  const result = await client.query('SELECT id FROM accounts WHERE id = $1 AND user_id = $2', [accountId, userId]);
  return result.rows.length > 0;
}

export async function captureAccountSnapshot(
  client: PoolClient,
  accountId: string,
  userId: string,
  tables: RestorableTable[]
): Promise<Record<string, any[]>> {
  const snapshot: Record<string, any[]> = {};
  for (const table of orderTables(tables)) {
    const result = await client.query(
      `SELECT * FROM ${table} WHERE account_id = $1 AND user_id = $2`,
      [accountId, userId]
    );
    snapshot[table] = result.rows;
  }
  return snapshot;
}

// Snapshots kept per account (taken before each restore, or on demand).
export const SAFETY_SNAPSHOTS_KEPT = 3;

export async function pruneSafetySnapshots(backupDir: string, accountId: string, keep = SAFETY_SNAPSHOTS_KEPT): Promise<void> {
  const lastDir = path.join(backupDir, 'last');
  const files = await fs.readdir(lastDir).catch(() => [] as string[]);
  const matching = files
    .filter(f => f.startsWith('bankapp-safety-') && f.endsWith(`-${accountId}.json.gz`))
    .sort()
    .reverse();
  for (const f of matching.slice(keep)) {
    await fs.unlink(path.join(lastDir, f)).catch(() => {});
  }
}

export async function writeSafetySnapshot(
  backupDir: string,
  accountId: string,
  snapshot: Record<string, any[]>
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `bankapp-safety-${timestamp}-${accountId}.json.gz`;
  const filePath = path.join(backupDir, 'last', filename);
  const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(snapshot)));
  // A fresh install has no backup folder yet: create it instead of failing the snapshot.
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, encryptBuffer(compressed));
  await pruneSafetySnapshots(backupDir, accountId);
  return filename;
}

export async function listSafetySnapshots(backupDir: string, accountId: string) {
  const lastDir = path.join(backupDir, 'last');
  const files = await fs.readdir(lastDir).catch(() => [] as string[]);
  const matching = files
    .filter(f => f.startsWith('bankapp-safety-') && f.endsWith(`-${accountId}.json.gz`))
    .sort()
    .reverse();

  const snapshots = [];
  for (const file of matching) {
    const stat = await fs.stat(path.join(lastDir, file));
    snapshots.push({
      filename: file,
      date: stat.mtime.toISOString().slice(0, 10),
      time: stat.mtime.toISOString().slice(11, 19),
      sizeBytes: stat.size,
      sizeMB: parseFloat((stat.size / (1024 * 1024)).toFixed(2)),
      timestamp: stat.mtime.toISOString(),
    });
  }
  return snapshots;
}

export async function restoreToCurrentAccount(
  client: PoolClient,
  opts: { accountId: string; userId: string; tables: RestorableTable[]; stagingSchema?: string }
): Promise<RestoreResult[]> {
  const stg = assertStagingSchema(opts.stagingSchema ?? DEFAULT_STAGING_SCHEMA);
  const results: RestoreResult[] = [];
  for (const table of orderTables(opts.tables)) {
    const deleteResult = await client.query(
      `DELETE FROM ${table} WHERE account_id = $1 AND user_id = $2`,
      [opts.accountId, opts.userId]
    );
    const insertResult = await client.query(
      `INSERT INTO ${table} SELECT * FROM ${stg}.${table} WHERE account_id = $1 AND user_id = $2`,
      [opts.accountId, opts.userId]
    );
    results.push({ table, deleted: deleteResult.rowCount ?? 0, inserted: insertResult.rowCount ?? 0 });
  }
  return results;
}

// Column names come from Object.keys() of a row round-tripped through a JSON
// safety-snapshot file on disk. That file is only ever written by this app's
// own code, but — same reasoning as extractCopyBlock's column validation in
// backup-restore-extract.ts — a destructive, schema-writing operation should
// not trust file contents blindly. Fail closed on anything that isn't a
// plain identifier before it reaches generated SQL.
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function insertRowsFromObjects(client: PoolClient, table: string, rows: any[]) {
  if (rows.length === 0) return Promise.resolve({ rowCount: 0 });
  const columns = Object.keys(rows[0]);
  if (!columns.every(c => IDENTIFIER.test(c))) {
    throw new Error(`Invalid column name in safety snapshot for table ${table}`);
  }
  const values: any[] = [];
  const rowPlaceholders = rows.map((row, rowIdx) => {
    const cols = columns.map((col, colIdx) => {
      values.push(row[col]);
      return `$${rowIdx * columns.length + colIdx + 1}`;
    });
    return `(${cols.join(', ')})`;
  });
  return client.query(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${rowPlaceholders.join(', ')}`,
    values
  );
}

export async function restoreFromSafetySnapshot(
  client: PoolClient,
  opts: { accountId: string; userId: string; snapshot: Record<string, any[]> }
): Promise<RestoreResult[]> {
  const tables = orderTables(Object.keys(opts.snapshot) as RestorableTable[]);
  const results: RestoreResult[] = [];
  for (const table of tables) {
    const deleteResult = await client.query(
      `DELETE FROM ${table} WHERE account_id = $1 AND user_id = $2`,
      [opts.accountId, opts.userId]
    );
    // Snapshots older than the deleted_at column: an inactive rule was a deleted one.
    const rows = table === 'categorization_rules'
      ? opts.snapshot[table].map(r => 'deleted_at' in r ? r : { ...r, deleted_at: r.active === false ? new Date() : null })
      : opts.snapshot[table];
    const insertResult = await insertRowsFromObjects(client, table, rows);
    results.push({ table, deleted: deleteResult.rowCount ?? 0, inserted: insertResult.rowCount ?? 0 });
  }
  return results;
}

export async function createAccountLikeSource(
  client: PoolClient,
  opts: { sourceAccountId: string; userId: string; name: string }
): Promise<string> {
  const source = await client.query(
    'SELECT bank_name, account_type FROM accounts WHERE id = $1 AND user_id = $2',
    [opts.sourceAccountId, opts.userId]
  );
  if (source.rows.length === 0) throw new Error('Compte source introuvable');
  const { bank_name, account_type } = source.rows[0];

  const result = await client.query(
    `INSERT INTO accounts (name, bank_name, balance, account_type, user_id, sort_order)
     VALUES ($1, $2, 0, $3, $4, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM accounts WHERE user_id = $4))
     RETURNING id`,
    [opts.name, bank_name, account_type, opts.userId]
  );
  return result.rows[0].id;
}

export async function restoreToNewAccount(
  client: PoolClient,
  opts: { sourceAccountId: string; newAccountId: string; userId: string; tables: RestorableTable[]; stagingSchema?: string }
): Promise<RestoreResult[]> {
  const stg = assertStagingSchema(opts.stagingSchema ?? DEFAULT_STAGING_SCHEMA);
  const orderedTables = orderTables(opts.tables);
  const restoringSchedules = orderedTables.includes('schedules');
  const results: RestoreResult[] = [];

  for (const table of orderedTables) {
    let inserted = 0;

    if (table === 'categories') {
      const r = await client.query(
        `INSERT INTO categories (account_id, name, created_at, user_id)
         SELECT $1, name, created_at, $2
         FROM ${stg}.categories
         WHERE account_id = $3 AND user_id = $2`,
        [opts.newAccountId, opts.userId, opts.sourceAccountId]
      );
      inserted = r.rowCount ?? 0;
    }

    if (table === 'categorization_rules') {
      const r = await client.query(
        `INSERT INTO categorization_rules (account_id, category, active, created_at, user_id, tiers_pattern, details_pattern, deleted_at)
         SELECT $1, category, active, created_at, $2, tiers_pattern, details_pattern, deleted_at
         FROM ${stg}.categorization_rules
         WHERE account_id = $3 AND user_id = $2`,
        [opts.newAccountId, opts.userId, opts.sourceAccountId]
      );
      inserted = r.rowCount ?? 0;
    }

    if (table === 'schedules') {
      await client.query(`ALTER TABLE ${stg}.schedules ADD COLUMN IF NOT EXISTS new_id UUID`);
      await client.query(
        `UPDATE ${stg}.schedules SET new_id = gen_random_uuid() WHERE account_id = $1`,
        [opts.sourceAccountId]
      );
      const r = await client.query(
        `INSERT INTO schedules (id, account_id, description, amount, transaction_type, category, target_account_id, frequency, start_date, end_date, max_occurrences, occurrences_count, day_of_month, skip_weekends, created_at, updated_at, deleted_at, details, next_schedule_date, expected_payments, payments_completed, is_completed, is_active, user_id)
         SELECT new_id, $1, description, amount, transaction_type, category, NULL, frequency, start_date, end_date, max_occurrences, occurrences_count, day_of_month, skip_weekends, created_at, updated_at, deleted_at, details, next_schedule_date, expected_payments, payments_completed, is_completed, is_active, $2
         FROM ${stg}.schedules
         WHERE account_id = $3 AND user_id = $2`,
        [opts.newAccountId, opts.userId, opts.sourceAccountId]
      );
      inserted = r.rowCount ?? 0;
    }

    if (table === 'transactions') {
      const query = restoringSchedules
        ? `INSERT INTO transactions (id, account_id, date, description, amount, tiers, details, category, transaction_type, is_reconciled, related_account_id, created_at, updated_at, deleted_at, schedule_id, user_id)
           SELECT gen_random_uuid(), $1, t.date, t.description, t.amount, t.tiers, t.details, t.category, t.transaction_type, t.is_reconciled, NULL, t.created_at, t.updated_at, t.deleted_at, s.new_id, $2
           FROM ${stg}.transactions t
           LEFT JOIN ${stg}.schedules s ON s.id = t.schedule_id
           WHERE t.account_id = $3 AND t.user_id = $2`
        : `INSERT INTO transactions (id, account_id, date, description, amount, tiers, details, category, transaction_type, is_reconciled, related_account_id, created_at, updated_at, deleted_at, schedule_id, user_id)
           SELECT gen_random_uuid(), $1, date, description, amount, tiers, details, category, transaction_type, is_reconciled, NULL, created_at, updated_at, deleted_at, NULL, $2
           FROM ${stg}.transactions
           WHERE account_id = $3 AND user_id = $2`;
      const r = await client.query(query, [opts.newAccountId, opts.userId, opts.sourceAccountId]);
      inserted = r.rowCount ?? 0;
    }

    results.push({ table, deleted: 0, inserted });
  }

  return results;
}

export interface PerformRestoreOptions {
  accountId: string;
  userId: string;
  tables: RestorableTable[];
  destination: 'current' | 'new';
  newAccountName?: string;
  backupDir?: string;
  snapshot?: Record<string, any[]>;
  // Schema holding the staged dump rows (not used for safety snapshots). Defaults to the
  // shared name for direct callers; the route passes a per-request name.
  stagingSchema?: string;
}

// Owns the transaction lifecycle: BEGIN, then either the "current account"
// (destructive, safety-snapshotted) or "new account" (non-destructive) path,
// then COMMIT — or ROLLBACK and re-throw on any failure.
export async function performRestore(
  client: PoolClient,
  opts: PerformRestoreOptions
): Promise<{ destination: 'current' | 'new'; newAccountId: string | null; results: RestoreResult[] }> {
  await client.query('BEGIN');
  try {
    let results: RestoreResult[];
    let newAccountId: string | null = null;

    if (opts.destination === 'current') {
      if (!opts.snapshot) {
        const currentSnapshot = await captureAccountSnapshot(client, opts.accountId, opts.userId, opts.tables);
        if (opts.backupDir) {
          await writeSafetySnapshot(opts.backupDir, opts.accountId, currentSnapshot);
        }
      }
      results = opts.snapshot
        ? await restoreFromSafetySnapshot(client, { accountId: opts.accountId, userId: opts.userId, snapshot: opts.snapshot })
        : await restoreToCurrentAccount(client, { accountId: opts.accountId, userId: opts.userId, tables: opts.tables, stagingSchema: opts.stagingSchema });
    } else {
      newAccountId = await createAccountLikeSource(client, {
        sourceAccountId: opts.accountId,
        userId: opts.userId,
        name: opts.newAccountName!,
      });
      results = await restoreToNewAccount(client, {
        sourceAccountId: opts.accountId,
        newAccountId,
        userId: opts.userId,
        tables: opts.tables,
        stagingSchema: opts.stagingSchema,
      });
    }

    await client.query('COMMIT');
    return { destination: opts.destination, newAccountId, results };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}
