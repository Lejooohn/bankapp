// transactions API routes (mounted from index.ts).
import express from 'express';

import pool from '../db.js';
import { broadcastTransactionsChanged } from './events.js';
import { errMsg, normalizeString, checkAccountOwnership, isSavingsAccount } from '../lib/shared.js';
import { transactionSchema, transferSchema, patchTransactionSchema } from '../lib/schemas.js';

const router = express.Router();

// ── Transactions ──────────────────────────────────────────────────────────────

router.get('/api/accounts/:id/transactions', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
  const offset = parseInt(req.query.offset as string) || 0;
  try {
    // Verify account ownership
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const result = await pool.query(
      `SELECT *, COUNT(*) OVER() AS total_count
       FROM transactions WHERE account_id = $1 AND user_id = $2 AND deleted_at IS NULL
       ORDER BY date DESC, id DESC LIMIT $3 OFFSET $4`,
      [req.params.id, req.user.id, limit, offset]
    );
    const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;
    const data = result.rows.map(({ total_count, ...r }: any) => r);
    res.json({ data, total });
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.get('/api/accounts/:id/transactions/search', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { q, mode, startDate, endDate, category, min, max, reconciled, amountOp, amountVal, excludeText } = req.query;
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
  const offset = parseInt(req.query.offset as string) || 0;
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const params: any[] = [req.params.id];
    let whereClause = 'account_id = $1 AND deleted_at IS NULL';

    // Combined mode: allow multiple filters at once
    if (mode === 'combined') {
      // Text filter
      if (q) {
        const normalized = normalizeString(q as string);
        params.push(normalized);
        const textCondition = `(immutable_unaccent(LOWER(tiers)) LIKE '%' || $${params.length} || '%' OR immutable_unaccent(LOWER(COALESCE(details,''))) LIKE '%' || $${params.length} || '%' OR amount::text LIKE '%' || $${params.length} || '%')`;
        if (excludeText === 'true') {
          whereClause += ` AND NOT ${textCondition}`;
        } else {
          whereClause += ` AND ${textCondition}`;
        }
      }
      // Amount comparison filter
      if (amountOp && amountVal) {
        const value = parseFloat(amountVal as string);
        if (!isNaN(value)) {
          params.push(value);
          const sqlOp = amountOp === '>=' ? '>=' : amountOp === '<=' ? '<=' : amountOp === '>' ? '>' : amountOp === '<' ? '<' : '=';
          whereClause += ` AND amount::numeric ${sqlOp} $${params.length}`;
        }
      }
      // Amount range filter
      if (min) {
        params.push(parseFloat(min as string));
        whereClause += ` AND amount::numeric >= $${params.length}`;
      }
      if (max) {
        params.push(parseFloat(max as string));
        whereClause += ` AND amount::numeric <= $${params.length}`;
      }
      // Category filter
      if (category) {
        params.push(category);
        whereClause += ` AND category = $${params.length}`;
      }
      // Reconciliation filter
      if (reconciled !== undefined) {
        const isReconciled = reconciled === 'true';
        params.push(isReconciled);
        whereClause += ` AND is_reconciled = $${params.length}`;
      }
      // Date range filter
      if (startDate) {
        params.push(startDate);
        whereClause += ` AND date >= $${params.length}`;
      }
      if (endDate) {
        params.push(endDate);
        whereClause += ` AND date <= $${params.length}`;
      }
    } else if (mode === 'description' && q) {
      const normalized = normalizeString(q as string);
      params.push(normalized);
      whereClause += ` AND (immutable_unaccent(LOWER(tiers)) LIKE '%' || $${params.length} || '%' OR immutable_unaccent(LOWER(COALESCE(details,''))) LIKE '%' || $${params.length} || '%' OR amount::text LIKE '%' || $${params.length} || '%')`;
    } else if (mode === 'amount' && q) {
      const match = (q as string).trim().match(/^([><]=?|=)?(.+)$/);
      if (match) {
        const op = match[1];
        const valueStr = match[2];
        if (op) {
          // Has comparator: search numerically (>1183, <-50, etc.)
          const value = parseFloat(valueStr);
          if (!isNaN(value)) {
            params.push(value);
            const sqlOp = op === '>=' ? '>=' : op === '<=' ? '<=' : op === '>' ? '>' : op === '<' ? '<' : '=';
            whereClause += ` AND amount::numeric ${sqlOp} $${params.length}`;
          }
        } else {
          // No comparator: search by text content (1183 finds 1183.52)
          params.push(`%${valueStr}%`);
          whereClause += ` AND amount::text LIKE $${params.length}`;
        }
      }
    } else if (mode === 'amount_range') {
      if (min) {
        params.push(parseFloat(min as string));
        whereClause += ` AND amount::numeric >= $${params.length}`;
      }
      if (max) {
        params.push(parseFloat(max as string));
        whereClause += ` AND amount::numeric <= $${params.length}`;
      }
    } else if (mode === 'filters') {
      if (category) {
        params.push(category);
        whereClause += ` AND category = $${params.length}`;
      }
      if (reconciled !== undefined) {
        const isReconciled = reconciled === 'true';
        params.push(isReconciled);
        whereClause += ` AND is_reconciled = $${params.length}`;
      }
    } else if (mode === 'date' && startDate) {
      params.push(startDate);
      whereClause += ` AND date >= $${params.length}`;
    }
    if (mode === 'date' && endDate) { params.push(endDate); whereClause += ` AND date <= $${params.length}`; }
    if (category && mode !== 'filters' && mode !== 'combined') { params.push(category); whereClause += ` AND category = $${params.length}`; }

    const result = await pool.query(
      `SELECT *, COUNT(*) OVER() AS total_count FROM transactions WHERE ${whereClause}
       ORDER BY date DESC, id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;
    const data = result.rows.map(({ total_count, ...r }: any) => r);
    res.json({ data, total });
  } catch (err: any) { console.error(err); res.status(500).json({ error: errMsg(err) }); }
});

router.post('/api/accounts/:id/transactions', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const parsed = transactionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  const { date, tiers, details, amount, category, transaction_type, is_reconciled } = parsed.data;
  try {
    // Verify account ownership
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (await isSavingsAccount(req.params.id)) {
      return res.status(403).json({ error: 'Un compte Livret/Épargne ne peut recevoir des opérations que via un virement' });
    }

    let finalCategory = category;
    if (!finalCategory) {
      const rulesResult = await pool.query(
        'SELECT tiers_pattern, details_pattern, category FROM categorization_rules WHERE account_id = $1 AND user_id = $2 AND active = true',
        [req.params.id, req.user.id]
      );
      const tiersNorm = normalizeString(tiers);
      const detailsNorm = normalizeString(details || '');
      for (const rule of rulesResult.rows) {
        const tiersMatch = !rule.tiers_pattern ||
          rule.tiers_pattern
            .split('|')
            .map((p: string) => normalizeString(p))
            .filter(Boolean)
            .some((p: string) => tiersNorm.includes(p));
        const detailsMatch = !rule.details_pattern ||
          rule.details_pattern
            .split('|')
            .map((p: string) => normalizeString(p))
            .filter(Boolean)
            .some((p: string) => detailsNorm.includes(p));
        if (tiersMatch && detailsMatch) { finalCategory = rule.category; break; }
      }
    }
    const result = await pool.query(
      'INSERT INTO transactions (account_id, user_id, date, description, tiers, details, amount, category, transaction_type, is_reconciled) VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9) RETURNING id',
      [req.params.id, req.user.id, date, tiers, details, amount, finalCategory || null, transaction_type, is_reconciled]
    );
    broadcastTransactionsChanged(req.user.id, req.params.id);
    res.json({ id: result.rows[0].id });
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

// Transfer endpoint: creates two linked transactions (debit on source, credit on target)
router.post('/api/accounts/:id/transfers', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  const { date, amount, tiers, details, target_account_id, category } = parsed.data;
  const sourceAccountId = req.params.id;

  try {
    // Verify source and target accounts exist and belong to user
    const sourceResult = await pool.query('SELECT id FROM accounts WHERE id = $1 AND user_id = $2', [sourceAccountId, req.user.id]);
    const targetResult = await pool.query('SELECT id FROM accounts WHERE id = $1 AND user_id = $2', [target_account_id, req.user.id]);
    if (!sourceResult.rows[0] || !targetResult.rows[0]) {
      return res.status(403).json({ error: 'Compte source ou cible introuvable' });
    }

    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create debit transaction on source account (negative amount)
      const debitResult = await client.query(
        'INSERT INTO transactions (account_id, user_id, date, description, tiers, details, amount, category, transaction_type, related_account_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
        [sourceAccountId, req.user.id, date, tiers, tiers, details || null, -amount, category || null, 'Virement émis', target_account_id]
      );

      // Create credit transaction on target account (positive amount)
      const creditResult = await client.query(
        'INSERT INTO transactions (account_id, user_id, date, description, tiers, details, amount, category, transaction_type, related_account_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
        [target_account_id, req.user.id, date, tiers, tiers, details || null, amount, category || null, 'Virement reçu', sourceAccountId]
      );

      await client.query('COMMIT');
      broadcastTransactionsChanged(req.user.id, sourceAccountId);
      broadcastTransactionsChanged(req.user.id, target_account_id);
      res.json({
        debit_id: debitResult.rows[0].id,
        credit_id: creditResult.rows[0].id
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.patch('/api/transactions/:id', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const parsed = patchTransactionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  const data = parsed.data;

  // Dynamic SET builder — allows explicitly setting nullable fields to null (#13)
  const setClauses: string[] = [];
  const values: any[] = [];
  let p = 1;
  if (data.date !== undefined)          { setClauses.push(`date = $${p++}`); values.push(data.date); }
  if (data.tiers !== undefined)         { setClauses.push(`tiers = $${p}`, `description = $${p}`); values.push(data.tiers); p++; }
  if ('details' in data)                { setClauses.push(`details = $${p++}`); values.push(data.details ?? null); }
  if ('category' in data)               { setClauses.push(`category = $${p++}`); values.push(data.category ?? null); }
  if (data.amount !== undefined)        { setClauses.push(`amount = $${p++}`); values.push(data.amount); }
  if ('transaction_type' in data)       { setClauses.push(`transaction_type = $${p++}`); values.push(data.transaction_type ?? null); }
  if (data.is_reconciled !== undefined) { setClauses.push(`is_reconciled = $${p++}`); values.push(data.is_reconciled); }

  if (setClauses.length === 0) return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
  values.push(req.params.id, req.user.id);
  try {
    const result = await pool.query(
      `UPDATE transactions SET ${setClauses.join(', ')}
       WHERE id = $${p} AND account_id IN (SELECT id FROM accounts WHERE user_id = $${p + 1}) AND is_locked IS NOT TRUE
       RETURNING account_id`,
      values
    );
    if (!result.rows[0]) {
      const exists = await pool.query('SELECT t.is_locked FROM transactions t JOIN accounts a ON a.id = t.account_id WHERE t.id = $1 AND a.user_id = $2', [req.params.id, req.user.id]);
      if (exists.rows[0]?.is_locked) return res.status(403).json({ error: 'Le solde initial est une opération immuable' });
      return res.status(404).json({ error: 'Transaction introuvable' });
    }
    broadcastTransactionsChanged(req.user.id, result.rows[0].account_id);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.delete('/api/transactions/:id', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const result = await pool.query(
      `UPDATE transactions SET deleted_at = NOW()
       WHERE id = $1 AND account_id IN (SELECT id FROM accounts WHERE user_id = $2) AND is_locked IS NOT TRUE
       RETURNING account_id`,
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) {
      const exists = await pool.query('SELECT t.is_locked FROM transactions t JOIN accounts a ON a.id = t.account_id WHERE t.id = $1 AND a.user_id = $2', [req.params.id, req.user.id]);
      if (exists.rows[0]?.is_locked) return res.status(403).json({ error: 'Le solde initial est une opération immuable' });
      return res.status(404).json({ error: 'Transaction introuvable' });
    }
    broadcastTransactionsChanged(req.user.id, result.rows[0].account_id);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.delete('/api/accounts/:id/transactions/delete-range', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { start, end } = req.body;
    if (!start || !end) return res.status(400).json({ error: 'start and end dates required' });
    await pool.query(
      'UPDATE transactions SET deleted_at = NOW() WHERE account_id = $1 AND date >= $2 AND date <= $3 AND is_locked IS NOT TRUE',
      [req.params.id, start, end]
    );
    broadcastTransactionsChanged(req.user.id, req.params.id);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.get('/api/accounts/:id/transactions/trash/count', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count FROM transactions WHERE account_id = $1 AND deleted_at IS NOT NULL AND deleted_at > NOW() - INTERVAL '30 days'`,
      [req.params.id]
    );
    res.json({ count: result.rows[0].count });
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.get('/api/accounts/:id/transactions/trash', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const result = await pool.query(
      `SELECT * FROM transactions WHERE account_id = $1 AND deleted_at IS NOT NULL AND deleted_at > NOW() - INTERVAL '30 days' ORDER BY deleted_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.patch('/api/transactions/:id/restore', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const result = await pool.query(
      `UPDATE transactions SET deleted_at = NULL
       WHERE id = $1 AND account_id IN (SELECT id FROM accounts WHERE user_id = $2)
       RETURNING account_id`,
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Transaction introuvable' });
    broadcastTransactionsChanged(req.user.id, result.rows[0].account_id);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.post('/api/accounts/:id/transactions/restore-bulk', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids required' });
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await pool.query(
      'UPDATE transactions SET deleted_at = NULL WHERE account_id = $1 AND id = ANY($2::uuid[])',
      [req.params.id, ids]
    );
    broadcastTransactionsChanged(req.user.id, req.params.id);
    res.json({ success: true, count: ids.length });
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.delete('/api/accounts/:id/transactions/trash', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const result = await pool.query(
      'DELETE FROM transactions WHERE account_id = $1 AND deleted_at IS NOT NULL AND deleted_at > NOW() - INTERVAL \'30 days\'',
      [req.params.id]
    );
    res.json({ success: true, count: result.rowCount });
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.post('/api/accounts/:id/transactions/delete-bulk', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids required' });
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await pool.query(
      'UPDATE transactions SET deleted_at = NOW() WHERE account_id = $1 AND id = ANY($2::uuid[]) AND is_locked IS NOT TRUE',
      [req.params.id, ids]
    );
    broadcastTransactionsChanged(req.user.id, req.params.id);
    res.json({ success: true, count: ids.length });
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.post('/api/accounts/:id/transactions/categorize-bulk', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { ids, category } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids required' });
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await pool.query(
      'UPDATE transactions SET category = $1 WHERE account_id = $2 AND id = ANY($3::uuid[]) AND is_locked IS NOT TRUE',
      [category ?? null, req.params.id, ids]
    );
    broadcastTransactionsChanged(req.user.id, req.params.id);
    res.json({ success: true, count: ids.length });
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

export default router;
