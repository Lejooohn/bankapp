// Creates the scheduled transactions for one month and advances each schedule.
// Database writes stay here; calendar rules live in @bankapp/shared.

import pool from '../db.js';
import { broadcastTransactionsChanged } from '../routes/events.js';
import { ownedAccountIds } from '../lib/shared.js';
import { parseLocalDate, formatLocalDate, scheduleTxAmount, nextOccurrenceDate, computeNextScheduleDate } from '@bankapp/shared';

// ── Schedule helper ───────────────────────────────────────────────────────────

export async function generateNextMonthForAccount(
  accountId: string,
  userId: string,
  opts: { targetYear?: number; targetMonth?: number; updateSchedules?: boolean } = {}
): Promise<{ created: number; skipped: number }> {
  const today = new Date();

  const targetMonth = opts.targetMonth ?? today.getMonth() + 2;
  const targetYear = opts.targetYear ?? today.getFullYear();
  const updateSchedules = opts.updateSchedules ?? true;

  const nmStart    = new Date(targetYear, targetMonth - 1, 1);
  const nmEnd      = new Date(targetYear, targetMonth, 0);
  const nmStartStr = formatLocalDate(nmStart);
  const nmNextStr  = formatLocalDate(new Date(targetYear, targetMonth, 1));

  const { rows: schedules } = await pool.query(
    'SELECT * FROM schedules WHERE account_id = $1 AND user_id = $2 AND is_active = true',
    [accountId, userId]
  );

  const dueItems: { s: any; due: Date; txAmount: number }[] = [];
  for (const s of schedules) {
    const due = nextOccurrenceDate(s, nmStart);
    if (!due || due < nmStart || due > nmEnd) continue;
    const txAmount = scheduleTxAmount(s);
    dueItems.push({ s, due, txAmount });
  }

  if (dueItems.length === 0) return { created: 0, skipped: 0 };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const dueIds = dueItems.map(i => i.s.id);
    const existingRes = await client.query(
      `SELECT schedule_id FROM transactions
       WHERE schedule_id = ANY($1::uuid[]) AND date >= $2 AND date < $3 AND deleted_at IS NULL`,
      [dueIds, nmStartStr, nmNextStr]
    );
    const existingIds = new Set(existingRes.rows.map((r: any) => r.schedule_id));

    const notYetCreated = dueItems.filter(i => !existingIds.has(i.s.id));
    // Never write into an account the user does not own (legacy schedules may point at one).
    const ownedTargets = await ownedAccountIds(notYetCreated.map(i => i.s.target_account_id), userId);
    const toCreate = notYetCreated.filter(i => !i.s.target_account_id || ownedTargets.has(i.s.target_account_id));
    const skipped  = dueItems.length - toCreate.length;

    if (toCreate.length > 0) {
      if (!userId) throw new Error('generateNextMonthForAccount requires userId');
      const normalItems = toCreate.filter(i => !i.s.target_account_id);
      const transferItems = toCreate.filter(i => i.s.target_account_id);

      if (normalItems.length > 0) {
        await client.query(
          `INSERT INTO transactions (account_id, user_id, date, description, tiers, amount, category, is_reconciled, schedule_id, transaction_type, details)
           SELECT $1, $2, d, lbl, lbl, amt, cat, false, sid, txtype, det
           FROM unnest($3::date[], $4::text[], $5::numeric[], $6::text[], $7::uuid[], $8::text[], $9::text[])
                AS u(d, lbl, amt, cat, sid, txtype, det)`,
          [
            accountId,
            userId,
            normalItems.map(i => formatLocalDate(i.due)),
            normalItems.map(i => i.s.description),
            normalItems.map(i => i.txAmount),
            normalItems.map(i => i.s.category ?? null),
            normalItems.map(i => i.s.id),
            normalItems.map(i => i.s.transaction_type),
            normalItems.map(i => i.s.details ?? null),
          ]
        );
      }

      for (const item of transferItems) {
        await client.query(
          `INSERT INTO transactions (account_id, user_id, date, description, tiers, amount, category, is_reconciled, schedule_id, transaction_type, related_account_id, details)
           VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, 'Virement émis', $9, $10)`,
          [
            accountId,
            userId,
            formatLocalDate(item.due),
            item.s.description,
            item.s.description,
            -Math.abs(item.txAmount),
            item.s.category ?? null,
            item.s.id,
            item.s.target_account_id,
            item.s.details ?? null,
          ]
        );
        await client.query(
          `INSERT INTO transactions (account_id, user_id, date, description, tiers, amount, category, is_reconciled, schedule_id, transaction_type, related_account_id, details)
           VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, 'Virement reçu', $9, $10)`,
          [
            item.s.target_account_id,
            userId,
            formatLocalDate(item.due),
            item.s.description,
            item.s.description,
            Math.abs(item.txAmount),
            item.s.category ?? null,
            item.s.id,
            accountId,
            item.s.details ?? null,
          ]
        );
      }

      if (updateSchedules) {
        // Month right after the one we just inserted, used as the reference point
        // for each schedule's own next occurrence (which depends on its day_of_month).
        const referenceDate = new Date(targetYear, targetMonth, 1);

        for (const item of toCreate) {
          const s = item.s;
          const nextDate = computeNextScheduleDate(referenceDate, s.day_of_month, s.skip_weekends);
          const nextDateStr = formatLocalDate(nextDate);
          const startDateObj = parseLocalDate(s.start_date);
          const occurrencesCount = (nextDate.getFullYear() - startDateObj.getFullYear()) * 12 +
                                    (nextDate.getMonth() - startDateObj.getMonth());
          const paymentsCompleted = (s.payments_completed || 0) + 1;
          const isCompleted = s.expected_payments != null && occurrencesCount >= s.expected_payments;
          const isActive = !(s.max_occurrences != null && occurrencesCount >= s.max_occurrences);

          await client.query(
            `UPDATE schedules
             SET occurrences_count = $1,
                 next_schedule_date = $2,
                 payments_completed = $3,
                 is_completed = $4,
                 is_active = $5
             WHERE id = $6 AND user_id = $7`,
            [occurrencesCount, nextDateStr, paymentsCompleted, isCompleted, isActive, s.id, userId]
          );
        }
      }
    }

    await client.query('COMMIT');
    if (toCreate.length > 0) {
      broadcastTransactionsChanged(userId, accountId);
      const targetAccountIds = new Set(toCreate.map(i => i.s.target_account_id).filter(Boolean));
      for (const targetId of targetAccountIds) {
        broadcastTransactionsChanged(userId, targetId);
      }
    }
    return { created: toCreate.length, skipped };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
