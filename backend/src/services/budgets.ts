import pool from '../db.js';
import { formatLocalDate } from '@bankapp/shared';
import type { Budget, BudgetWithProgress, CreateBudgetData, UpdateBudgetData } from '@bankapp/shared';

// Génération de couleurs de budget : le vert/orange/rouge sont réservés à la barre
// de progression (sous/proche/au-dessus du budget) et sont donc exclus ici. La plage
// de teintes autorisée (teal -> bleu -> violet -> magenta -> rose) est parcourue avec
// un pas en nombre d'or, ce qui garantit une bonne séparation visuelle entre couleurs
// consécutives quel que soit le nombre de budgets (contrairement à un simple pas fixe
// qui finit par produire des teintes proches une fois la liste épuisée).
const HUE_MIN = 175;
const HUE_MAX = 335;
const HUE_RANGE = HUE_MAX - HUE_MIN;
const GOLDEN_RATIO_CONJUGATE = 0.6180339887498949;
const LIGHTNESS_VARIANTS = [
  { sat: 70, light: 55 },
  { sat: 60, light: 38 },
  { sat: 55, light: 68 },
];

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => Math.round(255 * x).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`.toUpperCase();
}

export function budgetColorForIndex(index: number): string {
  const hue = HUE_MIN + ((index * GOLDEN_RATIO_CONJUGATE * HUE_RANGE) % HUE_RANGE);
  const variant = LIGHTNESS_VARIANTS[index % LIGHTNESS_VARIANTS.length];
  return hslToHex(hue, variant.sat, variant.light);
}

async function assignBudgetColor(accountId: string): Promise<string> {
  const result = await pool.query('SELECT color FROM budgets WHERE account_id = $1', [accountId]);
  const used = new Set(result.rows.map(r => r.color));

  for (let i = 0; i < 1000; i++) {
    const candidate = budgetColorForIndex(i);
    if (!used.has(candidate)) return candidate;
  }
  // Extrêmement improbable : fallback déterministe
  return budgetColorForIndex(used.size);
}

export async function getBudgetsByAccount(accountId: string, userId: string): Promise<Budget[]> {
  const result = await pool.query(
    `SELECT b.* FROM budgets b
     WHERE b.account_id = $1 AND b.user_id = $2
     ORDER BY b.start_date DESC, b.name ASC`,
    [accountId, userId]
  );
  return result.rows;
}

export async function getBudgetById(id: string, userId: string): Promise<Budget | null> {
  const result = await pool.query(
    `SELECT b.* FROM budgets b
     WHERE b.id = $1 AND b.user_id = $2`,
    [id, userId]
  );
  return result.rows[0] || null;
}

export async function createBudget(data: CreateBudgetData & { userId: string }): Promise<Budget> {
  const color = await assignBudgetColor(data.account_id);
  const result = await pool.query(
    `INSERT INTO budgets
     (account_id, category_id, name, amount, currency, period, start_date, end_date, color, description, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      data.account_id,
      data.category_id || null,
      data.name,
      data.amount,
      data.currency || 'EUR',
      data.period || 'monthly',
      // budgets.start_date is NOT NULL: default to today (local calendar day) when not given.
      data.start_date || formatLocalDate(new Date()),
      data.end_date || null,
      color,
      data.description || null,
      data.userId
    ]
  );
  return result.rows[0];
}

export async function updateBudget(
  id: string,
  data: UpdateBudgetData,
  userId: string
): Promise<Budget | null> {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      fields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  }

  if (fields.length === 0) return null;

  // The id and user id are the last two parameters: after the loop paramIndex points at the id.
  values.push(id, userId);

  const result = await pool.query(
    `UPDATE budgets b
     SET ${fields.join(', ')}, updated_at = NOW()
     WHERE b.id = $${paramIndex} AND b.user_id = $${paramIndex + 1}
     RETURNING b.*`,
    values
  );

  return result.rows[0] || null;
}

export async function deleteBudget(id: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM budgets b
     WHERE b.id = $1 AND b.user_id = $2`,
    [id, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getBudgetsWithProgress(
  accountId: string,
  userId: string
): Promise<BudgetWithProgress[]> {
  const budgets = await getBudgetsByAccount(accountId, userId);
  
  const budgetsWithProgress = await Promise.all(
    budgets.map(async (budget) => {
      // Use start_date if provided, otherwise use current date
      const referenceDate = budget.start_date ? new Date(budget.start_date) : new Date();
      
      // Calculer la date de début et fin en fonction de la période
      let startOfPeriod: Date;
      let endOfPeriod: Date;
      
      const refYear = referenceDate.getFullYear();
      const refMonth = referenceDate.getMonth();
      
      if (budget.period === 'monthly') {
        // Month starts on the 1st, ends on the last day
        startOfPeriod = new Date(refYear, refMonth, 1);
        endOfPeriod = new Date(refYear, refMonth + 1, 0, 23, 59, 59);
      } else if (budget.period === 'yearly') {
        // Year starts on Jan 1, ends on Dec 31
        startOfPeriod = new Date(refYear, 0, 1);
        endOfPeriod = new Date(refYear, 11, 31, 23, 59, 59);
      } else if (budget.period === 'weekly') {
        // Find Monday of current week (ISO: Monday=1, Sunday=7)
        const dayOfWeek = referenceDate.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        startOfPeriod = new Date(referenceDate);
        startOfPeriod.setDate(startOfPeriod.getDate() + mondayOffset);
        endOfPeriod = new Date(startOfPeriod);
        endOfPeriod.setDate(endOfPeriod.getDate() + 6);
        endOfPeriod.setHours(23, 59, 59, 999);
      } else {
        // daily: single day
        startOfPeriod = new Date(referenceDate);
        startOfPeriod.setHours(0, 0, 0, 0);
        endOfPeriod = new Date(referenceDate);
        endOfPeriod.setHours(23, 59, 59, 999);
      }

      // Si end_date est défini dans le budget, l'utiliser pour limiter la période
      if (budget.end_date) {
        const budgetEnd = new Date(budget.end_date);
        budgetEnd.setHours(23, 59, 59, 999);
        if (budgetEnd < endOfPeriod) {
          endOfPeriod = budgetEnd;
        }
      }

      // Récupérer les dépenses pour ce budget
      const params: any[] = [
        accountId,
        startOfPeriod.toISOString(),
        endOfPeriod.toISOString()
      ];
      
      let sql = `
        SELECT COALESCE(SUM(CASE WHEN t.transaction_type = 'Revenu' THEN 0 ELSE ABS(t.amount) END), 0) as total,
                COUNT(*) as count
         FROM transactions t
         WHERE t.account_id = $1
         AND t.deleted_at IS NULL
         AND t.date >= $2
         AND t.date <= $3`;
      
      if (budget.category_id) {
        params.push(budget.category_id);
        sql += `
          AND EXISTS (
            SELECT 1 FROM categories c
            WHERE c.id = $4 AND c.name = t.category AND c.account_id = $1
          )`;
      }
      
      const result = await pool.query(sql, params);

      const currentSpent = Number(result.rows[0].total) || 0;
      const transactionsCount = Number(result.rows[0].count) || 0;
      const remaining = budget.amount - currentSpent;
      const progressPercent = budget.amount > 0 ? Math.min(100, Math.max(0, (currentSpent / budget.amount) * 100)) : 0;

      return {
        ...budget,
        current_spent: parseFloat(currentSpent.toFixed(2)),
        remaining: parseFloat(remaining.toFixed(2)),
        progress_percent: progressPercent,
        transactions_count: transactionsCount
      };
    })
  );
  
  return budgetsWithProgress;
}

export async function getBudgetSummary(accountId: string, userId: string): Promise<{
  total_budgeted: number;
  total_spent: number;
  total_remaining: number;
  budgets_count: number;
}> {
  const budgets = await getBudgetsWithProgress(accountId, userId);
  
  const totalBudgeted = budgets.reduce((sum, b) => sum + Number(b.amount), 0);
  const totalSpent = budgets.reduce((sum, b) => sum + b.current_spent, 0);
  const totalRemaining = totalBudgeted - totalSpent;

  return {
    total_budgeted: parseFloat(Number(totalBudgeted).toFixed(2)),
    total_spent: parseFloat(Number(totalSpent).toFixed(2)),
    total_remaining: parseFloat(Number(totalRemaining).toFixed(2)),
    budgets_count: budgets.length
  };
}
