// categories API routes (mounted from index.ts).
import express from 'express';

import pool from '../db.js';
import { checkAccountOwnership, errMsg } from '../lib/shared.js';

const router = express.Router();

// ── Categories ────────────────────────────────────────────────────────────────

router.get('/api/accounts/:id/categories', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const result = await pool.query(
      `SELECT id, name FROM categories WHERE account_id = $1 AND user_id = $2
       ORDER BY name`,
      [req.params.id, req.user.id]
    );
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.get('/api/accounts/:id/categories/stats', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const result = await pool.query(
      `SELECT c.name, COUNT(t.id)::int AS transaction_count
       FROM (
         SELECT name FROM categories WHERE account_id = $1 AND user_id = $2
         UNION
         SELECT DISTINCT category AS name FROM transactions WHERE account_id = $1 AND user_id = $2 AND category IS NOT NULL AND deleted_at IS NULL
       ) c
       LEFT JOIN transactions t ON t.account_id = $1 AND t.user_id = $2 AND t.category = c.name AND t.deleted_at IS NULL
       GROUP BY c.name ORDER BY c.name`,
      [req.params.id, req.user.id]
    );
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.post('/api/accounts/:id/categories', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Le nom est requis' });
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await pool.query(
      'INSERT INTO categories (account_id, user_id, name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [req.params.id, req.user.id, name.trim()]
    );
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.patch('/api/accounts/:id/categories/:name', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { newName } = req.body;
  if (!newName?.trim()) return res.status(400).json({ error: 'Le nouveau nom est requis' });
  const oldName = decodeURIComponent(req.params.name);
  const client = await pool.connect();
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await client.query('BEGIN');
    await client.query('INSERT INTO categories (account_id, user_id, name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [req.params.id, req.user.id, newName.trim()]);
    await client.query('UPDATE transactions SET category = $1 WHERE account_id = $2 AND user_id = $3 AND category = $4 AND deleted_at IS NULL', [newName.trim(), req.params.id, req.user.id, oldName]);
    await client.query('UPDATE categorization_rules SET category = $1 WHERE account_id = $2 AND user_id = $3 AND category = $4', [newName.trim(), req.params.id, req.user.id, oldName]);
    await client.query('DELETE FROM categories WHERE account_id = $1 AND user_id = $2 AND name = $3', [req.params.id, req.user.id, oldName]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: errMsg(err) });
  } finally { client.release(); }
});

router.delete('/api/accounts/:id/categories/:name', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const name = decodeURIComponent(req.params.name);
  const client = await pool.connect();
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await client.query('BEGIN');
    await client.query('DELETE FROM categories WHERE account_id = $1 AND user_id = $2 AND name = $3', [req.params.id, req.user.id, name]);
    await client.query('UPDATE transactions SET category = NULL WHERE account_id = $1 AND user_id = $2 AND category = $3 AND deleted_at IS NULL', [req.params.id, req.user.id, name]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: errMsg(err) });
  } finally { client.release(); }
});

export default router;
