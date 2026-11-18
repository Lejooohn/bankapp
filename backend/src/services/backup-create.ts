import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { assertEncryptionConfigured, beginEncryptStream, finalizeEncryptStream } from './encryption.js';

export function generateBackupFilename(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const mo = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `bankapp-${y}${mo}${d}-${h}${mi}${s}.sql.gz`;
}

export interface CreateManualBackupResult {
  filename: string;
  sizeBytes: number;
}

export interface CreateManualBackupOptions {
  command?: string;
  args?: string[];
}

// Spawns pg_dump directly (same "no shell, explicit args" approach as
// loadStagingSchema's psql call in backup-restore-extract.ts) and streams its
// stdout through gzip straight to disk, so nothing has to fit in memory.
export function createManualBackup(
  databaseUrl: string,
  backupDir: string,
  userId: string,
  opts: CreateManualBackupOptions = {}
): Promise<CreateManualBackupResult> {
  // Fail before spawning pg_dump or creating the output file — a mid-stream failure
  // here would otherwise leave an orphaned process and a partial file behind.
  assertEncryptionConfigured();

  const filename = generateBackupFilename();
  const filePath = path.join(backupDir, 'manual', filename);
  const command = opts.command ?? 'pg_dump';
  const args = opts.args ?? [databaseUrl];

  // Ensure the backup directory exists
  const manualDir = path.join(backupDir, 'manual');
  if (!fs.existsSync(manualDir)) {
    fs.mkdirSync(manualDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      // Wait for the fd to actually close before unlinking — createWriteStream
      // opens the file as soon as it's constructed, so destroying it doesn't
      // guarantee the file (even if empty) exists on disk yet.
      out.once('close', () => fs.unlink(filePath, () => reject(err)));
      out.destroy();
    };

    const dump = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    dump.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    dump.on('error', fail);
    dump.on('close', (code) => {
      if (code !== 0) fail(new Error(`${command} exited with code ${code}: ${stderr.trim()}`));
    });

    const gzip = zlib.createGzip();
    const out = fs.createWriteStream(filePath);
    out.on('error', fail);
    out.on('finish', () => {
      if (settled) return;
      settled = true;

      resolve({ filename, sizeBytes: fs.statSync(filePath).size });
    });

    // Encrypted at rest: nonce is written to `out` up front, gzip'd dump bytes flow
    // through the cipher into `out` (kept open past the cipher's end), then the auth
    // tag is appended and `out` is closed once the cipher has consumed everything.
    const { cipher } = beginEncryptStream(out);
    cipher.on('error', fail);
    gzip.on('error', fail);
    cipher.on('end', () => finalizeEncryptStream(out, cipher));

    dump.stdout.pipe(gzip).pipe(cipher).pipe(out, { end: false });
  });
}
