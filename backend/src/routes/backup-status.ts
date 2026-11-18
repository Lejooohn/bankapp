// backup-status API routes (mounted from index.ts).
import express from 'express';

import fs from 'fs/promises';
import path from 'path';
import pool from '../db.js';
import { listSafetySnapshots } from '../services/backup-restore-apply.js';
import { dedupeBackupsByDate, computeBackupCounts } from '../services/backup-dedupe.js';
import { getWalGap } from '../services/wal-monitor.js';
import { hashTokenForStorage, errMsg, checkAccountOwnership } from '../lib/shared.js';

const router = express.Router();

// Backup Status (requires auth - manual token verification before middleware)
router.get('/api/backup/status', async (req, res) => {
  const header = req.headers.authorization;
  if (!header) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const token = header.replace('Bearer ', '');
  try {
    const tokenHash = hashTokenForStorage(token);
    const sessionResult = await pool.query(
      'SELECT user_id FROM sessions WHERE token_hash = $1 AND (expires_at IS NULL OR expires_at > NOW())',
      [tokenHash]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const userId = sessionResult.rows[0].user_id;
    const userRole = (await pool.query('SELECT role FROM users WHERE id = $1', [userId])).rows[0]?.role;
    const isAdmin = userRole === 'admin';

    // Source of truth: filesystem (what actually exists)
    const backupDir = process.env.BACKUP_DIR || '/backups';
    // Match both formats: bankapp-YYYYMMDD.sql.gz (auto) and bankapp-YYYYMMDD-HHMMSS.sql.gz (manual)
    const BACKUP_FILENAME_RE = /^bankapp-\d{8}(-\d{6})?\.sql\.gz$/;

    let backups: Array<{
      filename: string;
      date: string;
      time: string;
      sizeBytes: number;
      sizeMB: number;
      timestamp: string;
      category: string;
    }> = [];

    // ADMINS: see full database backups
    // USERS: see only safety snapshots for their own accounts (handled below)
    if (isAdmin) {
      const backupDirs = ['daily', 'manual'];
      const seenFiles = new Set<string>();
      const now = Date.now();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

      for (const subdir of backupDirs) {
        const dirPath = path.join(backupDir, subdir);
        let files: string[] = [];
        try {
          files = await fs.readdir(dirPath);
        } catch (err) {
          console.debug(`[backup-status] Could not read ${dirPath}:`, (err as any)?.code);
        }

        for (const file of files) {
          if (!BACKUP_FILENAME_RE.test(file) || seenFiles.has(file)) continue;

          try {
            const filePath = path.join(dirPath, file);
            const stat = await fs.stat(filePath);

            // Clean up manual backups older than 30 days
            if (subdir === 'manual' && now - stat.mtime.getTime() > thirtyDaysMs) {
              try {
                await fs.unlink(filePath);
              } catch (err) {
                console.error(`[backup-status] Failed to delete old manual backup ${file}:`, err);
              }
              continue;
            }

            seenFiles.add(file);

            // Parse both formats: bankapp-YYYYMMDD.sql.gz and bankapp-YYYYMMDD-HHMMSS.sql.gz
            const fileMatch = file.match(/bankapp-(\d{8})(?:-(\d{6}))?/);
            const date = fileMatch ? `${fileMatch[1].slice(0, 4)}-${fileMatch[1].slice(4, 6)}-${fileMatch[1].slice(6, 8)}` : 'unknown';
            const time = fileMatch && fileMatch[2] ? `${fileMatch[2].slice(0, 2)}:${fileMatch[2].slice(2, 4)}:${fileMatch[2].slice(4, 6)}` : '00:00:00';
            const sizeBytes = stat.size;
            const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);

            backups.push({
              filename: file,
              date,
              time,
              sizeBytes,
              sizeMB: parseFloat(sizeMB),
              timestamp: stat.mtime.toISOString(),
              category: subdir as any
            });
          } catch (err) {
            console.error(`[backup-status] Error reading backup file ${subdir}/${file}:`, err);
          }
        }
      }
      // Dedupe same-date backups across last/ and daily/, assign final categories
      backups = dedupeBackupsByDate(backups as any);
      // Sort by filename (timestamp) descending
      backups.sort((a, b) => b.filename.localeCompare(a.filename));
    }

    // Safety snapshots: account-scoped, always available
    const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : null;
    const safetySnapshots = accountId && (await checkAccountOwnership(accountId, userId))
      ? await listSafetySnapshots(backupDir, accountId)
      : [];

    const counts = computeBackupCounts(backups as any);

    res.json({
      status: backups.length > 0 || safetySnapshots.length > 0 ? 'success' : 'no_backup',
      backups,
      safetySnapshots,
      counts
    });
  } catch (err: any) {
    console.error('backup status error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Unable to retrieve backup status',
      backups: [],
      safetySnapshots: [],
      counts: { daily: 0, manual: 0, total: 0 }
    });
  }
});

// GET /api/backup/wal-status - Monitor WAL gap (admin only)
router.get('/api/backup/wal-status', async (req, res) => {
  const header = req.headers.authorization;
  if (!header) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const token = header.replace('Bearer ', '');
  try {
    const tokenHash = hashTokenForStorage(token);
    const sessionResult = await pool.query(
      'SELECT user_id FROM sessions WHERE token_hash = $1 AND (expires_at IS NULL OR expires_at > NOW())',
      [tokenHash]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const userId = sessionResult.rows[0].user_id;
    const userRole = (await pool.query('SELECT role FROM users WHERE id = $1', [userId])).rows[0]?.role;

    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Réservé aux administrateurs' });
    }

    const status = await getWalGap(pool);
    res.json(status);
  } catch (err: any) {
    console.error('wal-status error:', err);
    res.status(500).json({
      error: errMsg(err),
      gapBytes: null,
      gapMB: null,
      level: 'unknown',
      checkedAt: new Date().toISOString()
    });
  }
});

export default router;
