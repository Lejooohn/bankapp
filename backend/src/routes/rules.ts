// rules API routes (mounted from index.ts).
import express from 'express';

import pool from '../db.js';
import { broadcastTransactionsChanged } from './events.js';
import { errMsg, checkAccountOwnership, buildRuleMatchCondition, mergePatterns } from '../lib/shared.js';
import { ruleSchema, patchRuleSchema } from '../lib/schemas.js';

const router = express.Router();

// ── Categorization rules ──────────────────────────────────────────────────────

const DUPLICATE_RULE = 'Une règle avec ce tiers et ces détails existe déjà';

router.get('/api/accounts/:id/rules', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const result = await pool.query('SELECT * FROM categorization_rules WHERE account_id = $1 AND user_id = $2 AND deleted_at IS NULL ORDER BY created_at DESC', [req.params.id, req.user.id]);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.post('/api/accounts/:id/rules', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const parsed = ruleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  const { tiers_pattern, details_pattern, category } = parsed.data;
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // A deleted rule keeps its row, hence its place in the unique key: creating it again revives it.
    const result = await pool.query(
      `INSERT INTO categorization_rules (account_id, user_id, tiers_pattern, details_pattern, category) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT ON CONSTRAINT categorization_rules_account_tiers_details_key
       DO UPDATE SET category = EXCLUDED.category, user_id = EXCLUDED.user_id, active = true, deleted_at = NULL, created_at = NOW()
       WHERE categorization_rules.deleted_at IS NOT NULL
       RETURNING *`,
      [req.params.id, req.user.id, tiers_pattern, details_pattern || null, category]
    );
    if (result.rows.length === 0) return res.status(409).json({ error: DUPLICATE_RULE });
    res.json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: DUPLICATE_RULE });
    res.status(500).json({ error: errMsg(err) });
  }
});

router.patch('/api/accounts/:id/rules/:ruleId', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const hasDetailsPattern = 'details_pattern' in req.body;
  const parsed = patchRuleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  const { tiers_pattern, details_pattern, category } = parsed.data;
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (tiers_pattern !== undefined) {
      updates.push(`tiers_pattern = $${paramIndex++}`);
      params.push(tiers_pattern);
    }
    if (hasDetailsPattern) {
      updates.push(`details_pattern = $${paramIndex++}`);
      params.push(details_pattern);
    }
    if (category !== undefined) {
      updates.push(`category = $${paramIndex++}`);
      params.push(category);
    }

    if (updates.length === 0) return res.status(400).json({ error: 'Aucune mise à jour fournie' });

    params.push(req.params.ruleId, req.params.id, req.user.id);
    const result = await pool.query(
      `UPDATE categorization_rules SET ${updates.join(', ')} WHERE id = $${paramIndex++} AND account_id = $${paramIndex++} AND user_id = $${paramIndex++} AND deleted_at IS NULL RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Rule not found' });
    res.json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: DUPLICATE_RULE });
    res.status(500).json({ error: errMsg(err) });
  }
});

router.delete('/api/accounts/:id/rules/:ruleId', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await pool.query('UPDATE categorization_rules SET active = false, deleted_at = NOW() WHERE id = $1 AND account_id = $2 AND user_id = $3 AND deleted_at IS NULL', [req.params.ruleId, req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.patch('/api/accounts/:id/rules/:ruleId/add-patterns', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { tiers, details } = req.body;
  if (!tiers && !details) return res.status(400).json({ error: 'Au moins un pattern est requis' });
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const ruleRes = await pool.query(
      'SELECT tiers_pattern, details_pattern FROM categorization_rules WHERE id = $1 AND account_id = $2 AND user_id = $3 AND deleted_at IS NULL',
      [req.params.ruleId, req.params.id, req.user.id]
    );
    if (ruleRes.rows.length === 0) return res.status(404).json({ error: 'Rule not found' });
    const rule = ruleRes.rows[0];
    const newTiers = mergePatterns(rule.tiers_pattern, tiers || null);
    const newDetails = mergePatterns(rule.details_pattern, details || null);
    const result = await pool.query(
      'UPDATE categorization_rules SET tiers_pattern = $1, details_pattern = $2 WHERE id = $3 AND account_id = $4 AND user_id = $5 RETURNING *',
      [newTiers, newDetails, req.params.ruleId, req.params.id, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: DUPLICATE_RULE });
    res.status(500).json({ error: errMsg(err) });
  }
});

router.get('/api/accounts/:id/apply-rules-preview', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const rulesRes = await pool.query(
      'SELECT id, tiers_pattern, details_pattern, category FROM categorization_rules WHERE account_id = $1 AND user_id = $2 AND active = true ORDER BY created_at DESC',
      [req.params.id, req.user.id]
    );
    const preview = await Promise.all(rulesRes.rows.map(async (rule: any) => {
      const { sql, params } = buildRuleMatchCondition(rule.tiers_pattern, rule.details_pattern, 4);
      if (!sql) return { id: rule.id, tiers_pattern: rule.tiers_pattern, details_pattern: rule.details_pattern, category: rule.category, count: 0 };
      try {
        const r = await pool.query(
          `SELECT COUNT(*)::int AS count FROM transactions
           WHERE account_id = $1 AND user_id = $2 AND deleted_at IS NULL AND (category IS NULL OR category != $3) AND (${sql})`,
          [req.params.id, req.user!.id, rule.category, ...params]
        );
        return { id: rule.id, tiers_pattern: rule.tiers_pattern, details_pattern: rule.details_pattern, category: rule.category, count: r.rows[0].count };
      } catch (e: any) {
        console.error(`Rule ${rule.id} error:`, e.message, 'SQL:', sql, 'Params count:', params.length);
        throw e;
      }
    }));
    res.json(preview);
  } catch (err: any) { console.error('apply-rules-preview error:', err.message); res.status(500).json({ error: errMsg(err) }); }
});

router.get('/api/accounts/:id/apply-rules-conflicts', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const rulesResult = await pool.query(
      'SELECT id, tiers_pattern, details_pattern, category FROM categorization_rules WHERE account_id = $1 AND user_id = $2 AND active = true ORDER BY created_at',
      [req.params.id, req.user.id]
    );

    const rulesWithConflicts = await Promise.all(rulesResult.rows.map(async (rule: any) => {
      // Get matches (no category) - limit to 100 for display
      const { sql: matchSql, params: matchParams } = buildRuleMatchCondition(rule.tiers_pattern, rule.details_pattern, 3);
      const matchesRes = await pool.query(
        `SELECT id, date, tiers, details, amount, category FROM transactions
         WHERE account_id = $1 AND user_id = $2 AND deleted_at IS NULL AND category IS NULL AND (${matchSql})
         ORDER BY date DESC LIMIT 100`,
        [req.params.id, req.user!.id, ...matchParams]
      );
      const matches = matchesRes.rows;

      // Get conflicts (different category) - limit to 100 for preview
      const { sql: conflictSql, params: conflictParams } = buildRuleMatchCondition(rule.tiers_pattern, rule.details_pattern, 4);
      const conflictsRes = await pool.query(
        `SELECT id, date, tiers, details, amount, category FROM transactions
         WHERE account_id = $1 AND user_id = $2 AND deleted_at IS NULL AND category IS NOT NULL AND category != $3 AND (${conflictSql})
         ORDER BY date DESC LIMIT 100`,
        [req.params.id, req.user!.id, rule.category, ...conflictParams]
      );

      return {
        id: rule.id,
        tiers_pattern: rule.tiers_pattern,
        details_pattern: rule.details_pattern,
        category: rule.category,
        matches,
        conflicts: conflictsRes.rows
      };
    }));

    res.json(rulesWithConflicts);
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.post('/api/accounts/:id/apply-rules', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { excludeIds } = req.body || {};
  const excludedList = Array.isArray(excludeIds) ? excludeIds : [];

  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const rulesResult = await pool.query(
      'SELECT tiers_pattern, details_pattern, category FROM categorization_rules WHERE account_id = $1 AND user_id = $2 AND active = true ORDER BY created_at',
      [req.params.id, req.user.id]
    );
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let updated = 0;
      let ruleUpdates: any[] = [];

      for (const rule of rulesResult.rows) {
        const { sql, params } = buildRuleMatchCondition(rule.tiers_pattern, rule.details_pattern, 4);

        const excludeClause = excludedList.length > 0
          ? ` AND id != ALL($${4 + params.length}::uuid[])`
          : '';

        const queryParams = excludedList.length > 0
          ? [rule.category, req.params.id, req.user.id, ...params, excludedList]
          : [rule.category, req.params.id, req.user.id, ...params];

        const r = await client.query(
          `UPDATE transactions SET category = $1 WHERE account_id = $2 AND user_id = $3 AND deleted_at IS NULL AND (${sql})${excludeClause}`,
          queryParams
        );

        const count = r.rowCount ?? 0;
        updated += count;
        ruleUpdates.push({ tiers_pattern: rule.tiers_pattern, details_pattern: rule.details_pattern, category: rule.category, count });
      }

      await client.query('COMMIT');
      console.log(`[apply-rules] Account ${req.params.id}: Updated ${updated} total transactions across ${ruleUpdates.length} rules`, ruleUpdates);
      if (updated > 0) broadcastTransactionsChanged(req.user.id, req.params.id);
      res.json({ updated });
    } catch (err: any) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: errMsg(err) });
    } finally {
      client.release();
    }
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

// ── Single rule operations ────────────────────────────────────────────────────

router.put('/api/accounts/:id/rules/:ruleId/toggle', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const r = await pool.query(
      'UPDATE categorization_rules SET active = NOT active WHERE id = $1 AND account_id = $2 AND user_id = $3 AND deleted_at IS NULL RETURNING *',
      [req.params.ruleId, req.params.id, req.user.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Rule not found' });
    res.json(r.rows[0]);
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.get('/api/accounts/:id/rules/:ruleId/preview', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const ruleRes = await pool.query(
      'SELECT tiers_pattern, details_pattern, category FROM categorization_rules WHERE id = $1 AND account_id = $2 AND user_id = $3 AND deleted_at IS NULL',
      [req.params.ruleId, req.params.id, req.user.id]
    );
    if (!ruleRes.rows.length) return res.status(404).json({ error: 'Rule not found' });

    const rule = ruleRes.rows[0];
    const { sql, params } = buildRuleMatchCondition(rule.tiers_pattern, rule.details_pattern, 4);

    const r = await pool.query(
      `SELECT
        COUNT(*)::int AS matched,
        COUNT(*) FILTER (WHERE category IS NULL OR category != $3)::int AS count
       FROM transactions
       WHERE account_id = $1 AND user_id = $2 AND deleted_at IS NULL AND (${sql})`,
      [req.params.id, req.user.id, rule.category, ...params]
    );
    const { matched, count } = r.rows[0];
    res.json({ tiers_pattern: rule.tiers_pattern, details_pattern: rule.details_pattern, category: rule.category, matched, count, already_correct: matched - count });
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.get('/api/accounts/:id/rules/:ruleId/matches', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 40));
    const offset = (page - 1) * limit;

    const ruleRes = await pool.query(
      'SELECT tiers_pattern, details_pattern, category FROM categorization_rules WHERE id = $1 AND account_id = $2 AND user_id = $3 AND deleted_at IS NULL',
      [req.params.ruleId, req.params.id, req.user.id]
    );
    if (!ruleRes.rows.length) return res.status(404).json({ error: 'Rule not found' });

    const rule = ruleRes.rows[0];
    const { sql, params } = buildRuleMatchCondition(rule.tiers_pattern, rule.details_pattern, 3);
    const { sql: conflictSql, params: conflictParams } = buildRuleMatchCondition(rule.tiers_pattern, rule.details_pattern, 4);

    // Count transactions needing update (no category)
    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS count FROM transactions
       WHERE account_id = $1 AND user_id = $2 AND deleted_at IS NULL AND category IS NULL AND (${sql})`,
      [req.params.id, req.user.id, ...params]
    );
    const total = countRes.rows[0].count;

    // Get transactions without category (to update)
    const matchRes = await pool.query(
      `SELECT id, date, tiers, details, amount, category FROM transactions
       WHERE account_id = $1 AND user_id = $2 AND deleted_at IS NULL AND category IS NULL AND (${sql})
       ORDER BY date DESC, id DESC LIMIT $${3 + params.length} OFFSET $${4 + params.length}`,
      [req.params.id, req.user.id, ...params, limit, offset]
    );

    // Get conflicting transactions (already have different category)
    const conflictsRes = await pool.query(
      `SELECT id, date, tiers, details, amount, category FROM transactions
       WHERE account_id = $1 AND user_id = $2 AND deleted_at IS NULL AND category IS NOT NULL AND category != $3 AND (${conflictSql})
       ORDER BY date DESC LIMIT 100`,
      [req.params.id, req.user.id, rule.category, ...conflictParams]
    );

    res.json({
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      matches: matchRes.rows,
      conflicts: conflictsRes.rows
    });
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.post('/api/accounts/:id/rules/:ruleId/apply', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { excludeIds } = req.body || {};
  const excludedList = Array.isArray(excludeIds) ? excludeIds : [];

  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const ruleRes = await pool.query(
      'SELECT tiers_pattern, details_pattern, category FROM categorization_rules WHERE id = $1 AND account_id = $2 AND user_id = $3 AND deleted_at IS NULL',
      [req.params.ruleId, req.params.id, req.user.id]
    );
    if (!ruleRes.rows.length) return res.status(404).json({ error: 'Rule not found' });

    const rule = ruleRes.rows[0];
    const { sql: countSql, params: countParams } = buildRuleMatchCondition(rule.tiers_pattern, rule.details_pattern, 3);
    const { sql: updateSql, params: updateParams } = buildRuleMatchCondition(rule.tiers_pattern, rule.details_pattern, 4);

    const countExcludeClause = excludedList.length > 0
      ? ` AND id != ALL($${3 + countParams.length}::uuid[])`
      : '';
    const updateExcludeClause = excludedList.length > 0
      ? ` AND id != ALL($${4 + updateParams.length}::uuid[])`
      : '';
    const excludeParams = excludedList.length > 0 ? [excludedList] : [];

    // Count all matches
    const countRes = await pool.query(
      `WITH matched_tx AS (
        SELECT id FROM transactions
        WHERE account_id = $1 AND user_id = $2 AND deleted_at IS NULL AND (${countSql})${countExcludeClause}
      )
      SELECT COUNT(*)::int as matched FROM matched_tx`,
      [req.params.id, req.user.id, ...countParams, ...excludeParams]
    );
    const { matched } = countRes.rows[0];

    // Update matched transactions
    const r = await pool.query(
      `UPDATE transactions SET category = $1 WHERE account_id = $2 AND user_id = $3 AND deleted_at IS NULL AND (${updateSql})${updateExcludeClause}`,
      [rule.category, req.params.id, req.user.id, ...updateParams, ...excludeParams]
    );
    const updated = r.rowCount ?? 0;
    console.log(`[apply-rule] Account ${req.params.id}, Rule ${req.params.ruleId}: Matched ${matched}, Updated ${updated} transactions`);
    if (updated > 0) broadcastTransactionsChanged(req.user.id, req.params.id);
    res.json({ matched, updated });
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.post('/api/accounts/:id/reset-categories', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const r = await pool.query(
      'UPDATE transactions SET category = NULL WHERE account_id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [req.params.id, req.user.id]
    );
    console.log(`[reset-categories] Account ${req.params.id}: Reset ${r.rowCount} transactions`);
    if ((r.rowCount ?? 0) > 0) broadcastTransactionsChanged(req.user.id, req.params.id);
    res.json({ updated: r.rowCount ?? 0 });
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

export default router;
