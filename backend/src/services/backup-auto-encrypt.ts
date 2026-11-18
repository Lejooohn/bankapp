import fs from 'fs/promises';
import path from 'path';
import { encryptBuffer } from './encryption.js';

// The prodrigestivill/postgres-backup-local sidecar writes its own scheduled dumps
// straight to backupDir/{daily,last,weekly,monthly} — outside our Node code entirely,
// so they never go through createManualBackup's encryption. restore.sh also leaves
// plaintext safety dumps in pre-restore/. This sweep periodically finds any plaintext
// gzip file left there (identified by the gzip magic bytes, since our encrypted output
// never carries them) and replaces it in place with its encrypted form, keeping the
// same filename so the sidecar's own name-based retention/rotation keeps working
// unmodified. Each folder is swept on its own: the sidecar hard-links the same dump
// into several folders, and renaming in one folder leaves the others plaintext.
const AUTO_BACKUP_SUBDIRS = ['daily', 'last', 'weekly', 'monthly', 'pre-restore'] as const;
const GZIP_MAGIC = Buffer.from([0x1f, 0x8b]);

export async function sweepAndEncryptAutoBackups(backupDir: string): Promise<{ encrypted: string[] }> {
  const encrypted: string[] = [];

  for (const sub of AUTO_BACKUP_SUBDIRS) {
    const dir = path.join(backupDir, sub);
    const entries = await fs.readdir(dir).catch(() => [] as string[]);

    for (const name of entries) {
      const filePath = path.join(dir, name);
      try {
        const stat = await fs.lstat(filePath);
        if (!stat.isFile()) continue; // skip the "latest" symlink and any subdirectories

        const buf = await fs.readFile(filePath);
        if (buf.length < 2 || !buf.subarray(0, 2).equals(GZIP_MAGIC)) continue; // already encrypted (or not ours)

        const tmpPath = `${filePath}.enctmp`;
        await fs.writeFile(tmpPath, encryptBuffer(buf));
        await fs.rename(tmpPath, filePath); // atomic swap — never leaves a half-written file at the real path
        encrypted.push(path.join(sub, name));
      } catch (err) {
        console.error(`[backup-auto-encrypt] failed for ${sub}/${name}:`, err);
      }
    }
  }

  return { encrypted };
}
