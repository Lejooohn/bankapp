// backup-status API routes (mounted from index.ts).
import express from 'express';

import pool from '../db.js';
import { listSafetySnapshots } from '../services/backup-restore-apply.js';
import { listBackups } from '../services/backup-files.js';
import { automaticBackupHealth, getBackupPolicy, nextBackupRun } from '../services/backup-policy.js';
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
    // ADMINS: see full database backups
    // USERS: see only safety snapshots for their own accounts (handled below)
    const backups = isAdmin ? await listBackups(backupDir) : [];

    // Safety snapshots: account-scoped, always available
    const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : null;
    const safetySnapshots = accountId && (await checkAccountOwnership(accountId, userId))
      ? await listSafetySnapshots(backupDir, accountId)
      : [];

    // The policy is the same for everyone. Its state is only known from the full dumps, which users do not see.
    const policy = getBackupPolicy();

    res.json({
      status: backups.length > 0 || safetySnapshots.length > 0 ? 'success' : 'no_backup',
      backups,
      safetySnapshots,
      policy,
      nextRun: nextBackupRun(policy),
      automatic: isAdmin ? automaticBackupHealth(backups) : null
    });
  } catch (err: any) {
    console.error('backup status error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Unable to retrieve backup status',
      backups: [],
      safetySnapshots: []
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
