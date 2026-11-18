import type { Pool } from 'pg';

export type WalGapLevel = 'ok' | 'warning' | 'critical';

export interface WalGapStatus {
  gapBytes: number;
  gapMB: number;
  level: WalGapLevel;
  checkedAt: string;
}

// Thresholds from lessons_learned_bankapp_2026
const THRESHOLDS = {
  ok: 1024 * 1024,           // < 1 MB
  warning: 10 * 1024 * 1024, // < 10 MB
  critical: 50 * 1024 * 1024 // >= 50 MB
};

export function classifyWalGap(gapBytes: number): WalGapLevel {
  if (gapBytes < THRESHOLDS.ok) return 'ok';
  if (gapBytes < THRESHOLDS.warning) return 'warning';
  if (gapBytes < THRESHOLDS.critical) return 'warning';
  return 'critical';
}

export async function getWalGap(pool: Pool): Promise<WalGapStatus> {
  const result = await pool.query(
    `SELECT CAST(
       pg_wal_lsn_diff(pg_current_wal_lsn(),
                       (SELECT redo_lsn FROM pg_control_checkpoint()))
       AS NUMERIC) AS gap_bytes`
  );

  const gapBytes = result.rows[0]?.gap_bytes ? Number(result.rows[0].gap_bytes) : 0;
  const gapMB = gapBytes / (1024 * 1024);
  const level = classifyWalGap(gapBytes);

  return {
    gapBytes,
    gapMB: parseFloat(gapMB.toFixed(2)),
    level,
    checkedAt: new Date().toISOString()
  };
}
