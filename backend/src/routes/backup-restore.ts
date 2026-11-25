import express from 'express';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import zlib from 'zlib';
import pool from '../db.js';
import { RESTORABLE_TABLES, extractCopyBlock, buildStagingScript, loadStagingSchema, newStagingSchemaName, assertStagingSchema } from '../services/backup-restore-extract.js';
import { checkAccountOwnership, performRestore, errMsg, captureAccountSnapshot, writeSafetySnapshot } from '../services/backup-restore-apply.js';
import { BACKUP_FILENAME_RE, findBackupFile, isValidBackupName } from '../services/backup-files.js';
import { backupCategorySchema } from '../lib/schemas.js';
import { decryptBuffer } from '../services/encryption.js';

const router = express.Router();

const SAFETY_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/;

// Regex pour les safety snapshots : bankapp-safety-{timestamp}-{accountId}.json.gz
const SAFETY_FILENAME_RE = /^bankapp-safety-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9-]+\.json\.gz$/;

const restoreSchema = z.object({
  filename: z.string().min(1),
  category: backupCategorySchema,
  tables: z.array(z.enum(RESTORABLE_TABLES)).min(1, 'Sélectionnez au moins un type de données'),
  destination: z.enum(['current', 'new']),
  newAccountName: z.string().min(1).optional(),
}).refine(
  (data) => data.destination !== 'new' || !!data.newAccountName,
  { message: 'Le nom du nouveau compte est requis', path: ['newAccountName'] }
);

router.post('/accounts/:id/backup/restore', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  const parsed = restoreSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });

  const { filename, category, tables, destination, newAccountName } = parsed.data;
  const accountId = req.params.id;
  const backupDir = process.env.BACKUP_DIR || '/backups';

  const client = await pool.connect();
  let stagingSchema: string | undefined;
  try {
    if (!(await checkAccountOwnership(client, accountId, req.user.id))) {
      return res.status(404).json({ error: 'Compte introuvable' });
    }

    const isSafetySnapshot = filename.startsWith('bankapp-safety-');
    if (isSafetySnapshot) {
      if (destination !== 'current') {
        return res.status(400).json({ error: "Un instantané de sécurité ne peut être restauré que sur le compte actuel" });
      }
      // Anchor the whole filename against the ownership-verified accountId so a
      // crafted name (path traversal, or another account's snapshot) can't slip through.
      const expectedSuffix = `-${accountId}.json.gz`;
      const timestampPart = filename.startsWith('bankapp-safety-') && filename.endsWith(expectedSuffix)
        ? filename.slice('bankapp-safety-'.length, filename.length - expectedSuffix.length)
        : null;
      if (!timestampPart || !SAFETY_TIMESTAMP_RE.test(timestampPart)) {
        return res.status(400).json({ error: 'Nom de fichier invalide' });
      }
    } else if (!isValidBackupName(filename, category)) {
      return res.status(400).json({ error: 'Nom de fichier de sauvegarde invalide' });
    } else if (req.user.role !== 'admin') {
      // Full dumps hold every user's data; downloading and listing them is admin-only,
      // so restoring from one is too.
      return res.status(403).json({ error: 'Réservé aux administrateurs' });
    }

    const filePath = isSafetySnapshot ? path.join(backupDir, 'last', filename) : await findBackupFile(backupDir, filename, category);
    let snapshot: Record<string, any[]> | undefined;
    stagingSchema = isSafetySnapshot ? undefined : newStagingSchemaName();

    if (isSafetySnapshot) {
      const compressed = decryptBuffer(await fs.readFile(filePath));
      snapshot = JSON.parse(zlib.gunzipSync(compressed).toString('utf-8'));
    } else {
      const compressed = decryptBuffer(await fs.readFile(filePath));
      const dumpText = zlib.gunzipSync(compressed).toString('utf-8');
      const blocks: Record<string, any> = {};
      for (const table of tables) {
        const block = extractCopyBlock(dumpText, table);
        if (!block) return res.status(422).json({ error: `Table "${table}" absente de cette sauvegarde` });
        blocks[table] = block;
      }
      await loadStagingSchema(process.env.DATABASE_URL!, buildStagingScript(blocks, stagingSchema));
    }

    const result = await performRestore(client, {
      accountId,
      userId: req.user.id,
      tables,
      destination,
      newAccountName,
      backupDir,
      snapshot,
      stagingSchema,
    });

    res.json(result);
  } catch (err: any) {
    res.status(err.code === 'ENOENT' ? 404 : 500).json({
      error: err.code === 'ENOENT' ? 'Fichier de sauvegarde introuvable' : errMsg(err),
    });
  } finally {
    // Drop only this request's staging schema, never another request's.
    if (stagingSchema) {
      await pool.query(`DROP SCHEMA IF EXISTS ${assertStagingSchema(stagingSchema)} CASCADE`).catch(() => {});
    }
    client.release();
  }
});

// POST /api/accounts/:id/backup/snapshot - Manually snapshot the caller's own account data
// (categories, rules, schedules, transactions). Unlike /api/backup/create, this is scoped
// to the requesting account/user, so it's available to every authenticated user, not just admins.
router.post('/accounts/:id/backup/snapshot', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  const accountId = req.params.id;
  const backupDir = process.env.BACKUP_DIR || '/backups';

  const client = await pool.connect();
  try {
    if (!(await checkAccountOwnership(client, accountId, req.user.id))) {
      return res.status(404).json({ error: 'Compte introuvable' });
    }

    const snapshot = await captureAccountSnapshot(client, accountId, req.user.id, [...RESTORABLE_TABLES]);
    const filename = await writeSafetySnapshot(backupDir, accountId, snapshot);
    const stat = await fs.stat(path.join(backupDir, 'last', filename));
    res.json({ filename, sizeMB: parseFloat((stat.size / (1024 * 1024)).toFixed(2)) });
  } catch (err: any) {
    res.status(500).json({ error: errMsg(err) });
  } finally {
    client.release();
  }
});

router.delete('/accounts/:id/backup/safety-snapshot/:filename', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  const filename = req.params.filename;
  const accountId = req.params.id;
  const backupDir = process.env.BACKUP_DIR || '/backups';

  const client = await pool.connect();
  try {
    if (!(await checkAccountOwnership(client, accountId, req.user.id))) {
      return res.status(404).json({ error: 'Compte introuvable' });
    }

    // Anchor the whole filename against the ownership-verified accountId, same as the restore route.
    const expectedSuffix = `-${accountId}.json.gz`;
    const timestampPart = filename.startsWith('bankapp-safety-') && filename.endsWith(expectedSuffix)
      ? filename.slice('bankapp-safety-'.length, filename.length - expectedSuffix.length)
      : null;
    if (!timestampPart || !SAFETY_TIMESTAMP_RE.test(timestampPart)) {
      return res.status(400).json({ error: 'Nom de fichier invalide' });
    }

    await fs.unlink(path.join(backupDir, 'last', filename));
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.code === 'ENOENT' ? 404 : 500).json({
      error: err.code === 'ENOENT' ? 'Fichier introuvable' : errMsg(err),
    });
  } finally {
    client.release();
  }
});

// GET /api/backup/download/:filename?category= - Download a full database backup (SQL.gz)
// Admin only: the dump contains every user's data (including password hashes),
// so ownership of the triggering request is not a meaningful access boundary.
router.get('/backup/download/:filename', async (req, res) => {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' });

  const filename = req.params.filename;
  const backupDir = process.env.BACKUP_DIR || '/backups';

  // Validate filename to prevent path traversal
  const category = backupCategorySchema.safeParse(req.query.category);
  if (!category.success || !isValidBackupName(filename, category.data)) {
    return res.status(400).json({ error: 'Nom de fichier de sauvegarde invalide' });
  }

  try {
    const filePath = await findBackupFile(backupDir, filename, category.data);
    const decrypted = decryptBuffer(await fs.readFile(filePath));

    // The on-disk file is encrypted at rest; decrypt here so the downloaded file is
    // a plain .sql.gz usable directly with pg_dump/psql elsewhere.
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/gzip');
    res.send(decrypted);
  } catch (err: any) {
    res.status(err.code === 'ENOENT' ? 404 : 500).json({
      error: err.code === 'ENOENT' ? 'Fichier de sauvegarde introuvable' : errMsg(err),
    });
  }
});

// GET /api/accounts/:id/backup/safety-snapshot/download/:filename - Download a safety snapshot
// Safety snapshots are scoped to a specific account and contain restorable data
router.get('/accounts/:id/backup/safety-snapshot/download/:filename', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  const filename = req.params.filename;
  const accountId = req.params.id;
  const backupDir = process.env.BACKUP_DIR || '/backups';

  const client = await pool.connect();
  try {
    // Verify account ownership
    if (!(await checkAccountOwnership(client, accountId, req.user.id))) {
      return res.status(404).json({ error: 'Compte introuvable' });
    }

    // Validate filename format and account ownership
    const expectedSuffix = `-${accountId}.json.gz`;
    const timestampPart = filename.startsWith('bankapp-safety-') && filename.endsWith(expectedSuffix)
      ? filename.slice('bankapp-safety-'.length, filename.length - expectedSuffix.length)
      : null;
    
    if (!timestampPart || !SAFETY_TIMESTAMP_RE.test(timestampPart)) {
      return res.status(400).json({ error: 'Nom de fichier invalide' });
    }

    const filePath = path.join(backupDir, 'last', filename);
    const decrypted = decryptBuffer(await fs.readFile(filePath));

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/gzip');
    res.send(decrypted);
  } catch (err: any) {
    res.status(err.code === 'ENOENT' ? 404 : 500).json({
      error: err.code === 'ENOENT' ? 'Fichier introuvable' : errMsg(err),
    });
  } finally {
    client.release();
  }
});

// GET /api/backup/list - List available backups for download
// Full database backups contain every user's data, so they're only listed for admins.
// Safety snapshots are account-scoped, so they're filtered to accounts the requester owns.
router.get('/backup/list', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  const backupDir = process.env.BACKUP_DIR || '/backups';
  const lastDir = path.join(backupDir, 'last');
  const isAdmin = req.user.role === 'admin';

  try {
    // No backup folder yet (fresh install): there is simply nothing to list.
    const files = await fs.readdir(lastDir).catch((err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') return [] as string[];
      throw err;
    });
    const ownedAccountIds = new Set(
      (await pool.query('SELECT id FROM accounts WHERE user_id = $1', [req.user.id])).rows.map((r) => r.id)
    );

    const backups = [];
    const safetySnapshots = [];

    for (const file of files) {
      try {
        const filePath = path.join(lastDir, file);
        const stat = await fs.stat(filePath);

        if (BACKUP_FILENAME_RE.test(file)) {
          if (!isAdmin) continue;
          // Full database backup
          const fileMatch = file.match(/bankapp-(\d{8})-(\d{6})/);
          const date = fileMatch ? `${fileMatch[1].slice(0, 4)}-${fileMatch[1].slice(4, 6)}-${fileMatch[1].slice(6, 8)}` : 'unknown';
          const time = fileMatch ? `${fileMatch[2].slice(0, 2)}:${fileMatch[2].slice(2, 4)}:${fileMatch[2].slice(4, 6)}` : 'unknown';

          backups.push({
            filename: file,
            date,
            time,
            sizeBytes: stat.size,
            sizeMB: parseFloat((stat.size / (1024 * 1024)).toFixed(2)),
            type: 'full' as const,
            downloadUrl: `/api/backup/download/${encodeURIComponent(file)}`,
          });
        } else if (SAFETY_FILENAME_RE.test(file)) {
          // Safety snapshot - extract account ID from filename
          const fileMatch = file.match(/bankapp-safety-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)-([a-f0-9-]+)\.json\.gz/);
          const timestamp = fileMatch ? fileMatch[1] : 'unknown';
          const accountId = fileMatch ? fileMatch[2] : 'unknown';
          if (!ownedAccountIds.has(accountId)) continue;

          safetySnapshots.push({
            filename: file,
            date: timestamp.split('T')[0].replace(/-/g, '-'),
            time: timestamp.split('T')[1].replace(/-/g, ':'),
            sizeBytes: stat.size,
            sizeMB: parseFloat((stat.size / (1024 * 1024)).toFixed(2)),
            type: 'safety' as const,
            accountId,
          });
        }
      } catch (err) {
        console.error('Error reading backup file info:', file, err);
      }
    }

    // Sort by filename (which contains timestamp) in descending order
    backups.sort((a, b) => b.filename.localeCompare(a.filename));
    safetySnapshots.sort((a, b) => b.filename.localeCompare(a.filename));

    res.json({
      backups,
      safetySnapshots,
    });
  } catch (err: any) {
    res.status(500).json({
      error: errMsg(err),
      backups: [],
      safetySnapshots: [],
    });
  }
});

export default router;
