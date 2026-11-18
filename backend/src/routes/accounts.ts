// accounts API routes (mounted from index.ts).
import express from 'express';

import pool from '../db.js';
import { checkAccountOwnership, errMsg } from '../lib/shared.js';
import { accountSchema } from '../lib/schemas.js';

const router = express.Router();

// ── Accounts ──────────────────────────────────────────────────────────────────

router.post('/api/accounts', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const parsed = accountSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  const { name, bank_name, balance, account_type } = parsed.data;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Initial balance is recorded as its own immutable transaction rather than
    // left on accounts.balance, so it shows up in the ledger and account.balance
    // stays 0 (avoiding double-counting in /summary and stats aggregates).
    const result = await client.query(
      'INSERT INTO accounts (name, bank_name, balance, account_type, user_id) VALUES ($1, $2, 0, $3, $4) RETURNING *',
      [name, bank_name, account_type, req.user.id]
    );
    const account = result.rows[0];
    if (balance !== 0) {
      await client.query(
        `INSERT INTO transactions (account_id, user_id, date, description, tiers, details, amount, transaction_type, is_reconciled, is_locked)
         VALUES ($1, $2, CURRENT_DATE, $3, $3, NULL, $4, 'Solde initial', true, true)`,
        [account.id, req.user.id, 'Solde initial', balance]
      );
    }
    await client.query('COMMIT');
    res.json(account);
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: errMsg(err) });
  } finally {
    client.release();
  }
});

router.get('/api/accounts', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const result = await pool.query(
      'SELECT * FROM accounts WHERE user_id = $1 ORDER BY sort_order ASC, created_at ASC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.get('/api/accounts/:id', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const result = await pool.query(
      'SELECT * FROM accounts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.patch('/api/accounts/:id', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { name, bank_name, description } = req.body;
  try {
    const result = await pool.query(
      `UPDATE accounts SET name = COALESCE($1, name), bank_name = $2, description = $3, updated_at = NOW() WHERE id = $4 AND user_id = $5 RETURNING *`,
      [name || null, bank_name || null, description || null, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Account not found' });
    res.json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.patch('/api/accounts/:id/set-default', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    await pool.query('UPDATE accounts SET is_default = FALSE WHERE user_id = $1', [req.user.id]);
    const result = await pool.query(
      'UPDATE accounts SET is_default = TRUE WHERE id = $1 AND user_id = $2 RETURNING *',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Account not found' });
    res.json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.patch('/api/accounts/:id/reorder', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { direction } = req.body;
  try {
    const account = await pool.query(
      'SELECT sort_order FROM accounts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (account.rows.length === 0) return res.status(404).json({ error: 'Account not found' });

    const currentOrder = account.rows[0].sort_order;
    const newOrder = direction === 'up' ? currentOrder - 1 : currentOrder + 1;

    const otherAccount = await pool.query(
      'SELECT id FROM accounts WHERE sort_order = $1 AND user_id = $2 LIMIT 1',
      [newOrder, req.user.id]
    );

    if (otherAccount.rows.length > 0) {
      await pool.query('UPDATE accounts SET sort_order = $1 WHERE id = $2 AND user_id = $3',
        [currentOrder, otherAccount.rows[0].id, req.user.id]);
    }

    const result = await pool.query(
      'UPDATE accounts SET sort_order = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
      [newOrder, req.params.id, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.delete('/api/accounts/:id', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    await pool.query('DELETE FROM accounts WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

// ── Summary ───────────────────────────────────────────────────────────────────

router.get('/api/accounts/:id/summary', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const result = await pool.query(`
      SELECT
        COALESCE(a.balance, 0) AS initial_balance,
        COALESCE(SUM(CASE WHEN t.is_reconciled = true THEN t.amount::numeric ELSE 0 END), 0)::float AS reconciled,
        COALESCE(SUM(CASE WHEN t.is_reconciled = false THEN t.amount::numeric ELSE 0 END), 0)::float AS pending,
        COUNT(t.id) AS transaction_count
      FROM accounts a
      LEFT JOIN transactions t ON a.id = t.account_id AND t.user_id = $2 AND t.deleted_at IS NULL
      WHERE a.id = $1 AND a.user_id = $2
      GROUP BY a.id, a.balance
    `, [req.params.id, req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Account not found' });
    const { initial_balance, reconciled, pending, transaction_count } = result.rows[0];
    const initialBal = parseFloat(initial_balance || 0);
    const reconciledBal = parseFloat(reconciled || 0);
    const pendingBal = parseFloat(pending || 0);
    res.json({
      reconciled: initialBal + reconciledBal,
      pending: pendingBal,
      total: initialBal + reconciledBal + pendingBal,
      transaction_count: parseInt(transaction_count || 0),
    });
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

export default router;
