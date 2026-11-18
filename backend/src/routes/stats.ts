// stats API routes (mounted from index.ts).
import express from 'express';

import pool from '../db.js';
import { errMsg, checkAccountOwnership } from '../lib/shared.js';

const router = express.Router();

// ── Statistics endpoints ──────────────────────────────────────────────────────

router.get('/api/accounts/:id/stats/expenses-by-month', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { rows } = await pool.query(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', date), 'YYYY-MM-01') as month,
         SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as expenses,
         SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as income
       FROM transactions
       WHERE account_id = $1
         AND deleted_at IS NULL
         AND is_locked IS NOT TRUE
         AND date >= NOW() - INTERVAL '12 months'
       GROUP BY DATE_TRUNC('month', date)
       ORDER BY DATE_TRUNC('month', date) ASC`,
      [req.params.id]
    );

    const data = rows.map((r: any) => ({
      month: r.month,
      expenses: parseFloat(r.expenses || 0),
      income: parseFloat(r.income || 0)
    }));

    res.json(data);
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.get('/api/accounts/:id/stats/top-categories', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { rows } = await pool.query(
      `SELECT
         category,
         COUNT(*) as count,
         SUM(ABS(amount)) as total,
         COUNT(DISTINCT DATE_TRUNC('month', date)) as months_count
       FROM transactions
       WHERE account_id = $1
         AND deleted_at IS NULL
         AND category IS NOT NULL
         AND amount < 0
         AND date >= NOW() - INTERVAL '12 months'
       GROUP BY category
       ORDER BY total DESC
       LIMIT 10`,
      [req.params.id]
    );

    const data = rows.map((r: any) => {
      const total = parseFloat(r.total || 0);
      const monthsCount = parseInt(r.months_count || 1);
      const avgPerMonth = total / monthsCount;
      return {
        name: r.category,
        value: total,
        count: parseInt(r.count),
        avgPerMonth: avgPerMonth
      };
    });

    res.json(data);
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.get('/api/accounts/:id/stats/categories-by-month', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { month } = req.query;
    if (!month || typeof month !== 'string') {
      return res.status(400).json({ error: 'Month parameter required (YYYY-MM format)' });
    }
    const monthDate = new Date(`${month}-01`);
    if (isNaN(monthDate.getTime())) {
      return res.status(400).json({ error: 'Invalid month format' });
    }
    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);

    const { rows } = await pool.query(
      `SELECT
         category,
         COUNT(*) as count,
         SUM(ABS(amount)) as total
       FROM transactions
       WHERE account_id = $1
         AND deleted_at IS NULL
         AND category IS NOT NULL
         AND amount < 0
         AND date >= $2
         AND date < $3
       GROUP BY category
       ORDER BY total DESC`,
      [req.params.id, monthStart.toISOString().split('T')[0], monthEnd.toISOString().split('T')[0]]
    );

    const data = rows.map((r: any) => ({
      name: r.category,
      value: parseFloat(r.total || 0),
      count: parseInt(r.count)
    }));

    res.json(data);
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.get('/api/accounts/:id/stats/balance-history', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    // Get monthly balance evolution with correct initial balance
    const { rows } = await pool.query(
      `WITH prior_balance AS (
         SELECT COALESCE(SUM(amount), 0) as balance_before
         FROM transactions
         WHERE account_id = $1
           AND deleted_at IS NULL
           AND date < DATE_TRUNC('month', NOW() - INTERVAL '12 months')
       ),
       monthly_totals AS (
         SELECT
           DATE_TRUNC('month', date)::DATE as month_date,
           SUM(amount) as monthly_sum
         FROM transactions
         WHERE account_id = $1
           AND deleted_at IS NULL
           AND date >= NOW() - INTERVAL '12 months'
         GROUP BY DATE_TRUNC('month', date)
       )
       SELECT
         month_date,
         (SELECT balance_before FROM prior_balance) + SUM(monthly_sum) OVER (ORDER BY month_date) as balance
       FROM monthly_totals
       ORDER BY month_date ASC`,
      [req.params.id]
    );

    const data = rows.map((r: any) => {
      const d = new Date(r.month_date);
      const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      return {
        month: monthStr,
        balance: parseFloat(r.balance || 0)
      };
    });

    res.json(data);
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

export default router;
