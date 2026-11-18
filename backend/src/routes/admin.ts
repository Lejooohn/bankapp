// admin API routes (mounted from index.ts).
import express from 'express';

import bcrypt from 'bcryptjs';
import fs from 'fs/promises';
import path from 'path';
import pool from '../db.js';
import { createManualBackup } from '../services/backup-create.js';
import { requireAdmin, errMsg } from '../lib/shared.js';
import { adminUsernameSchema, adminPasswordSchema } from '../lib/schemas.js';

const router = express.Router();

// GET /api/admin/users - List all user accounts (admin only)
router.get('/api/admin/users', async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const result = await pool.query(
      'SELECT id, username, email, role, created_at FROM users ORDER BY created_at ASC'
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// PATCH /api/admin/users/:id - Rename a user (admin only)
router.patch('/api/admin/users/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const parsed = adminUsernameSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });

  try {
    const result = await pool.query(
      'UPDATE users SET username = $1, updated_at = NOW() WHERE id = $2 RETURNING id, username, email, role',
      [parsed.data.username, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }
    res.json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Ce nom d\'utilisateur est déjà pris' });
    }
    res.status(500).json({ error: errMsg(err) });
  }
});

// PATCH /api/admin/users/:id/password - Reset a user's password (admin only, no current password required)
router.patch('/api/admin/users/:id/password', async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const parsed = adminPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });

  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const result = await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id',
      [passwordHash, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }
    // Invalidate existing sessions so the new password takes effect immediately
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [req.params.id]);
    await pool.query('DELETE FROM trusted_devices WHERE user_id = $1', [req.params.id]);
    await pool.query('DELETE FROM mfa_challenges WHERE user_id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// DELETE /api/admin/users/:id - Delete a user account and all their data (admin only)
router.delete('/api/admin/users/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;

  if (req.params.id === req.user!.id) {
    return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
  }

  try {
    const targetResult = await pool.query('SELECT role FROM users WHERE id = $1', [req.params.id]);
    if (targetResult.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }
    if (targetResult.rows[0].role === 'admin') {
      return res.status(400).json({ error: 'Impossible de supprimer un compte administrateur' });
    }

    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// POST /api/backup/create - Trigger an on-demand full database backup (admin only:
// the dump contains every user's data, so only admins may create/list/download/delete it)
router.post('/api/backup/create', async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const backupDir = process.env.BACKUP_DIR || '/backups';
    const result = await createManualBackup(process.env.DATABASE_URL!, backupDir, req.user!.id);
    res.json({ filename: result.filename, sizeMB: parseFloat((result.sizeBytes / (1024 * 1024)).toFixed(2)) });
  } catch (err: any) {
    console.error('manual backup error:', err);
    res.status(500).json({ error: errMsg(err) });
  }
});

// DELETE /api/backup/:filename - Delete a full database backup (admin only)
router.delete('/api/backup/:filename', async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const BACKUP_FILENAME_RE = /^bankapp-\d{8}-\d{6}\.sql\.gz$/;
  if (!BACKUP_FILENAME_RE.test(req.params.filename)) {
    return res.status(400).json({ error: 'Nom de fichier de sauvegarde invalide' });
  }

  try {
    const backupDir = process.env.BACKUP_DIR || '/backups';
    const filePath = path.join(backupDir, 'last', req.params.filename);
    await fs.unlink(filePath);

    // Remove from backups table
    await pool.query('DELETE FROM backups WHERE filename = $1', [req.params.filename]);

    res.json({ success: true });
  } catch (err: any) {
    res.status(err.code === 'ENOENT' ? 404 : 500).json({
      error: err.code === 'ENOENT' ? 'Fichier de sauvegarde introuvable' : errMsg(err),
    });
  }
});

// POST /api/admin/users/:id/mfa/reset - Removes a user's second factor (lost phone). The user can
// enrol again afterwards. Also ends their trusted devices.
router.post('/api/admin/users/:id/mfa/reset', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const user = await pool.query('SELECT id FROM users WHERE id = $1', [req.params.id]);
    if (user.rows.length === 0) return res.status(404).json({ error: 'Utilisateur introuvable' });
    await pool.query('DELETE FROM user_totp WHERE user_id = $1', [req.params.id]);
    await pool.query('DELETE FROM user_recovery_codes WHERE user_id = $1', [req.params.id]);
    await pool.query('DELETE FROM trusted_devices WHERE user_id = $1', [req.params.id]);
    await pool.query('DELETE FROM mfa_challenges WHERE user_id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: errMsg(err) });
  }
});

export default router;
