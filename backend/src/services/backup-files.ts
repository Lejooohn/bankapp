// Full database dumps on disk: the levels, the file names each one accepts, and how to find a dump.
import fs from 'fs/promises';
import path from 'path';

// daily/, weekly/ and monthly/ are written by the backup sidecar, manual/ by the app and scripts/backup.sh,
// pre-restore/ by scripts/restore.sh. A weekly and a monthly dump can have the same name (bankapp-YYYYWW and
// bankapp-YYYYMM), so a dump is always designated by its level and its name.
export const BACKUP_CATEGORIES = ['daily', 'weekly', 'monthly', 'manual', 'pre-restore'] as const;
export type BackupCategory = (typeof BACKUP_CATEGORIES)[number];

const FILENAME_RE: Record<BackupCategory, RegExp> = {
  daily: /^bankapp-\d{8}\.sql\.gz$/,
  weekly: /^bankapp-\d{6}\.sql\.gz$/,
  monthly: /^bankapp-\d{6}\.sql\.gz$/,
  manual: /^bankapp-\d{8}-\d{6}\.sql\.gz$/,
  'pre-restore': /^dump-before-\d{8}-\d{6}\.sql\.gz$/,
};
export const MANUAL_FILENAME_RE = FILENAME_RE.manual;

// The current weekly and monthly dumps are rewritten every night: only their retention removes them.
export const DELETABLE_CATEGORIES: readonly BackupCategory[] = ['daily', 'manual', 'pre-restore'];

// Manual dumps are removed after this many days.
export const MANUAL_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// Names accepted without a level (bankapp-YYYYMMDD and bankapp-YYYYMMDD-HHMMSS), and the folders searched for
// them. last/ holds the sidecar's newest dumps, which are the same as the daily ones.
export const BACKUP_FILENAME_RE = /^bankapp-\d{8}(-\d{6})?\.sql\.gz$/;
const SEARCHED_DIRS = ['daily', 'manual', 'last'] as const;

export interface BackupEntry {
  filename: string;
  category: BackupCategory;
  date: string | null;      // YYYY-MM-DD, when the name holds it
  time: string | null;      // HH:MM:SS, when the name holds it
  timestamp: string;        // last write
  sizeBytes: number;
  sizeMB: number;
  expiresAt: string | null; // manual dumps only
}

export function isBackupCategory(value: unknown): value is BackupCategory {
  return BACKUP_CATEGORIES.includes(value as BackupCategory);
}

export function isValidBackupName(filename: string, category?: BackupCategory): boolean {
  return (category ? FILENAME_RE[category] : BACKUP_FILENAME_RE).test(filename);
}

// Path of a dump, or an ENOENT error when it does not exist. The name must be valid for its level, which also
// rules out any path traversal.
export async function findBackupFile(backupDir: string, filename: string, category?: BackupCategory): Promise<string> {
  if (!isValidBackupName(filename, category)) throw new Error('Nom de fichier de sauvegarde invalide');
  for (const dir of category ? [category] : SEARCHED_DIRS) {
    const filePath = path.join(backupDir, dir, filename);
    try {
      await fs.access(filePath);
      return filePath;
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  throw Object.assign(new Error('Fichier de sauvegarde introuvable'), { code: 'ENOENT' });
}

// Every dump of every level, newest first within a level. Removes manual dumps past their retention.
export async function listBackups(backupDir: string, now: number = Date.now()): Promise<BackupEntry[]> {
  const backups: BackupEntry[] = [];
  for (const category of BACKUP_CATEGORIES) {
    const dir = path.join(backupDir, category);
    const files = await fs.readdir(dir).catch(() => [] as string[]); // a level may not exist yet
    const entries: BackupEntry[] = [];
    for (const filename of files) {
      if (!FILENAME_RE[category].test(filename)) continue;
      try {
        const filePath = path.join(dir, filename);
        const stat = await fs.stat(filePath);
        const expires = category === 'manual' ? stat.mtimeMs + MANUAL_RETENTION_DAYS * DAY_MS : null;
        if (expires !== null && now > expires) {
          await fs.unlink(filePath);
          continue;
        }
        const name = filename.match(/(\d{4})(\d{2})(\d{2})(?:-(\d{2})(\d{2})(\d{2}))?\.sql\.gz$/);
        entries.push({
          filename,
          category,
          date: name ? `${name[1]}-${name[2]}-${name[3]}` : null,
          time: name?.[4] ? `${name[4]}:${name[5]}:${name[6]}` : null,
          timestamp: stat.mtime.toISOString(),
          sizeBytes: stat.size,
          sizeMB: parseFloat((stat.size / (1024 * 1024)).toFixed(2)),
          expiresAt: expires === null ? null : new Date(expires).toISOString(),
        });
      } catch (err) {
        console.error(`[backup-status] Error with backup file ${category}/${filename}:`, err);
      }
    }
    entries.sort((a, b) => b.filename.localeCompare(a.filename));
    backups.push(...entries);
  }
  return backups;
}

// Deletes dumps from manual/ only: scheduled dumps are never touched. A file already gone counts as deleted.
export async function deleteManualBackups(backupDir: string, filenames: string[]): Promise<{ deleted: string[]; failed: string[] }> {
  const deleted: string[] = [];
  const failed: string[] = [];
  for (const filename of new Set(filenames)) {
    if (!isValidBackupName(filename, 'manual')) throw new Error('Nom de fichier de sauvegarde invalide');
    try {
      await fs.rm(path.join(backupDir, 'manual', filename), { force: true });
      deleted.push(filename);
    } catch (err) {
      console.error(`[backup] failed to delete manual/${filename}:`, err);
      failed.push(filename);
    }
  }
  return { deleted, failed };
}
