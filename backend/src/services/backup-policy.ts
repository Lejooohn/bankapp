// The backup policy really applied, for the Backups dialog. The sidecar's settings come from the environment:
// docker-compose.yml gives the same block (x-backup-policy) to the sidecar and to the API.
import { MANUAL_RETENTION_DAYS, type BackupEntry } from './backup-files.js';
import { SAFETY_SNAPSHOTS_KEPT } from './backup-restore-apply.js';

// A daily dump older than this means one night was missed (24 h, plus a margin for the dump and its encryption).
const LATE_AFTER_MS = 26 * 60 * 60 * 1000;

export interface BackupPolicy {
  schedule: { hour: number; minute: number } | null; // null: unknown, or not once a day
  keepDays: number | null;
  keepWeeks: number | null;
  keepMonths: number | null;
  manualDays: number;
  snapshotsPerAccount: number;
}

function positiveInt(value: string | undefined): number | null {
  return value && /^[1-9]\d*$/.test(value) ? Number(value) : null;
}

// Only "minute hour * * *" reads as a time of day.
function dailySchedule(cron: string | undefined): BackupPolicy['schedule'] {
  const m = cron?.trim().match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/);
  if (!m || Number(m[1]) > 59 || Number(m[2]) > 23) return null;
  return { hour: Number(m[2]), minute: Number(m[1]) };
}

export function getBackupPolicy(env: NodeJS.ProcessEnv = process.env): BackupPolicy {
  return {
    schedule: dailySchedule(env.SCHEDULE),
    keepDays: positiveInt(env.BACKUP_KEEP_DAYS),
    keepWeeks: positiveInt(env.BACKUP_KEEP_WEEKS),
    keepMonths: positiveInt(env.BACKUP_KEEP_MONTHS),
    manualDays: MANUAL_RETENTION_DAYS,
    snapshotsPerAccount: SAFETY_SNAPSHOTS_KEPT,
  };
}

// Next scheduled dump, in the server's time zone (TZ, the same as the sidecar's).
export function nextBackupRun(policy: BackupPolicy, now: Date = new Date()): string | null {
  if (!policy.schedule) return null;
  const next = new Date(now);
  next.setHours(policy.schedule.hour, policy.schedule.minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.toISOString();
}

export function automaticBackupHealth(backups: BackupEntry[], now: number = Date.now()): { lastRun: string | null; state: 'ok' | 'late' | 'none' } {
  const times = backups.filter(b => b.category === 'daily').map(b => Date.parse(b.timestamp));
  if (times.length === 0) return { lastRun: null, state: 'none' };
  const last = Math.max(...times);
  return { lastRun: new Date(last).toISOString(), state: now - last > LATE_AFTER_MS ? 'late' : 'ok' };
}
