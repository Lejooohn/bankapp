// me API routes (mounted from index.ts).
import express from 'express';

import pool from '../db.js';
import { errMsg } from '../lib/shared.js';

const router = express.Router();

// GET /api/me - Get current user info (requires auth)
router.get('/api/me', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const result = await pool.query(
      'SELECT id, username, email, theme, language, role FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: errMsg(err) });
  }
});

export default router;
