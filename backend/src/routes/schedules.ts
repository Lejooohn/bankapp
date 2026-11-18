// schedules API routes (mounted from index.ts).
import express from 'express';

import pool from '../db.js';
import { broadcastTransactionsChanged } from './events.js';
import { parseLocalDate, formatLocalDate, scheduleTxAmount, computeTriggerDate, nextOccurrenceDate, computeNextScheduleDate, countPeriodicOccurrences, shiftToBusinessDay, addMonths } from '@bankapp/shared';
import { errMsg, checkAccountOwnership, ownedAccountIds } from '../lib/shared.js';
import { scheduleSchema } from '../lib/schemas.js';
import { generateNextMonthForAccount } from '../services/schedule-generate.js';

const router = express.Router();

// ── Schedules ─────────────────────────────────────────────────────────────────

router.get('/api/accounts/:id/schedules', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const result = await pool.query('SELECT * FROM schedules WHERE account_id = $1 AND user_id = $2 ORDER BY description ASC', [req.params.id, req.user.id]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calculate payments_completed dynamically for each schedule
    const schedules = result.rows.map(schedule => {
      let paymentsCompleted = 0;
      let expectedPayments = 0;

      if (schedule.end_date && schedule.start_date) {
        const startDate = parseLocalDate(schedule.start_date);
        const endDate = parseLocalDate(schedule.end_date);
        const nextScheduleDate = schedule.next_schedule_date ? parseLocalDate(schedule.next_schedule_date) : null;

        // Calculate expected_payments
        if (schedule.frequency === 'MONTHLY') {
          expectedPayments = countPeriodicOccurrences(startDate, endDate, schedule.day_of_month, schedule.skip_weekends, 1);
          // Count occurrences already completed (up to but not including next_schedule_date)
          const countUpTo = nextScheduleDate || today;
          let current = new Date(startDate.getFullYear(), startDate.getMonth(), schedule.day_of_month);
          current.setHours(0, 0, 0, 0);
          if (current < startDate) current.setMonth(current.getMonth() + 1);
          while (current < countUpTo) {
            if (shiftToBusinessDay(current, schedule.skip_weekends) < countUpTo) paymentsCompleted++;
            current.setMonth(current.getMonth() + 1);
          }
        } else if (schedule.frequency === 'QUARTERLY') {
          expectedPayments = countPeriodicOccurrences(startDate, endDate, schedule.day_of_month, schedule.skip_weekends, 3);
          const countUpTo = nextScheduleDate || today;
          let current = new Date(startDate);
          current.setHours(0, 0, 0, 0);
          while (current < countUpTo) {
            if (shiftToBusinessDay(current, schedule.skip_weekends) < countUpTo) paymentsCompleted++;
            current.setMonth(current.getMonth() + 3);
          }
        } else if (schedule.frequency === 'BIANNUAL') {
          expectedPayments = countPeriodicOccurrences(startDate, endDate, schedule.day_of_month, schedule.skip_weekends, 6);
          const countUpTo = nextScheduleDate || today;
          let current = new Date(startDate);
          current.setHours(0, 0, 0, 0);
          while (current < countUpTo) {
            if (shiftToBusinessDay(current, schedule.skip_weekends) < countUpTo) paymentsCompleted++;
            current.setMonth(current.getMonth() + 6);
          }
        } else if (schedule.frequency === 'ANNUAL') {
          expectedPayments = countPeriodicOccurrences(startDate, endDate, schedule.day_of_month, schedule.skip_weekends, 12);
          const countUpTo = nextScheduleDate || today;
          let current = new Date(startDate);
          current.setHours(0, 0, 0, 0);
          while (current < countUpTo) {
            if (shiftToBusinessDay(current, schedule.skip_weekends) < countUpTo) paymentsCompleted++;
            current.setFullYear(current.getFullYear() + 1);
          }
        }
      }

      return {
        ...schedule,
        expected_payments: expectedPayments || schedule.expected_payments,
        payments_completed: paymentsCompleted || schedule.payments_completed || 0
      };
    });

    res.json(schedules);
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.post('/api/accounts/:id/schedules', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  const { description, amount, transaction_type, category, details, frequency, start_date, end_date, max_occurrences, day_of_month, skip_weekends, target_account_id } = parsed.data;
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    // A transfer schedule credits another account: it must belong to the same user.
    if (target_account_id && !(await checkAccountOwnership(target_account_id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Calculate next_schedule_date: first occurrence >= max(today, start_date)
    const startDateObj = parseLocalDate(start_date);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Use the later of today or start_date as reference
    const referenceDate = startDateObj > today ? startDateObj : today;

    // Calculate first occurrence on or after referenceDate
    const nextScheduleDate = computeNextScheduleDate(referenceDate, day_of_month, skip_weekends);

    // Check if next occurrence exceeds end_date; if so, don't set it
    let nextScheduleDateStr: string | null = null;
    if (end_date) {
      const endDateObj = parseLocalDate(end_date);
      if (nextScheduleDate <= endDateObj) {
        nextScheduleDateStr = formatLocalDate(nextScheduleDate);
      }
    } else {
      nextScheduleDateStr = formatLocalDate(nextScheduleDate);
    }

    const result = await pool.query(
      `INSERT INTO schedules (account_id, user_id, description, amount, transaction_type, category, details, frequency, start_date, end_date, max_occurrences, day_of_month, skip_weekends, target_account_id, next_schedule_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [req.params.id, req.user.id, description, amount, transaction_type, category ?? null, details ?? null, frequency, start_date, end_date ?? null, max_occurrences ?? null, day_of_month, skip_weekends, target_account_id ?? null, nextScheduleDateStr]
    );
    let schedule = result.rows[0];

    // Calculate expected_payments and payments_completed dynamically for response
    let paymentsCompleted = 0;
    let expectedPayments = 0;
    if (schedule.end_date && schedule.start_date) {
      const startDate = parseLocalDate(schedule.start_date);
      const endDate = parseLocalDate(schedule.end_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (frequency === 'MONTHLY') {
        expectedPayments = countPeriodicOccurrences(startDate, endDate, schedule.day_of_month, schedule.skip_weekends, 1);
        let current = new Date(startDate.getFullYear(), startDate.getMonth(), day_of_month);
        current.setHours(0, 0, 0, 0);
        if (current < startDate) current.setMonth(current.getMonth() + 1);
        while (current < today) {
          paymentsCompleted++;
          current.setMonth(current.getMonth() + 1);
        }
      } else if (frequency === 'QUARTERLY') {
        expectedPayments = countPeriodicOccurrences(startDate, endDate, schedule.day_of_month, schedule.skip_weekends, 3);
        let current = new Date(startDate);
        current.setHours(0, 0, 0, 0);
        while (current < today) {
          paymentsCompleted++;
          current.setMonth(current.getMonth() + 3);
        }
      } else if (frequency === 'BIANNUAL') {
        expectedPayments = countPeriodicOccurrences(startDate, endDate, schedule.day_of_month, schedule.skip_weekends, 6);
        let current = new Date(startDate);
        current.setHours(0, 0, 0, 0);
        while (current < today) {
          paymentsCompleted++;
          current.setMonth(current.getMonth() + 6);
        }
      } else if (frequency === 'ANNUAL') {
        expectedPayments = countPeriodicOccurrences(startDate, endDate, schedule.day_of_month, schedule.skip_weekends, 12);
        let current = new Date(startDate);
        current.setHours(0, 0, 0, 0);
        while (current < today) {
          paymentsCompleted++;
          current.setFullYear(current.getFullYear() + 1);
        }
      }
    }

    schedule.expected_payments = expectedPayments;
    schedule.payments_completed = paymentsCompleted;
    res.json(schedule);
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.patch('/api/schedules/:id', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { description, amount, transaction_type, category, details, frequency, start_date, end_date, day_of_month, skip_weekends, target_account_id, is_active } = req.body;

  // Validate day_of_month if provided
  if (day_of_month !== undefined && (typeof day_of_month !== 'number' || day_of_month < 1 || day_of_month > 31 || !Number.isInteger(day_of_month))) {
    return res.status(400).json({ error: 'Le jour du mois doit être un entier entre 1 et 31' });
  }

  try {
    // A transfer schedule credits another account: it must belong to the same user.
    if (target_account_id && !(await checkAccountOwnership(target_account_id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const result = await pool.query(
      `UPDATE schedules SET
         description = COALESCE($1, description),
         amount = COALESCE($2, amount),
         transaction_type = COALESCE($3, transaction_type),
         category = $4,
         details = $5,
         frequency = COALESCE($6, frequency),
         start_date = COALESCE($7, start_date),
         end_date = $8,
         day_of_month = COALESCE($9, day_of_month),
         skip_weekends = COALESCE($10, skip_weekends),
         target_account_id = $12,
         is_active = COALESCE($14, is_active),
         updated_at = NOW()
       WHERE id = $11 AND user_id = $13 RETURNING *`,
      [description, amount, transaction_type, category ?? null, details ?? null, frequency, start_date ?? null, end_date ?? null, day_of_month, skip_weekends, req.params.id, target_account_id ?? null, req.user.id, is_active]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Schedule not found' });

    let schedule = result.rows[0];

    // Recalculate next_schedule_date if day_of_month, start_date, skip_weekends, or end_date changed
    const shouldRecalculate = day_of_month !== undefined || start_date !== undefined || skip_weekends !== undefined || end_date !== undefined;

    if (shouldRecalculate) {
      const startDateObj = parseLocalDate(schedule.start_date);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Determine reference date for calculation
      let referenceDate;

      // If only day_of_month changed (not start_date or skip_weekends), use the month of
      // the existing next_schedule_date to preserve the scheduling window.
      // This prevents retroactively filling gaps in past months.
      if (day_of_month !== undefined && start_date === undefined && skip_weekends === undefined && end_date === undefined) {
        const nextScheduleDateObj = parseLocalDate(schedule.next_schedule_date);
        if (nextScheduleDateObj && nextScheduleDateObj > today) {
          // Use the first day of the month where the next occurrence should be
          referenceDate = new Date(nextScheduleDateObj.getFullYear(), nextScheduleDateObj.getMonth(), 1);
          referenceDate.setHours(0, 0, 0, 0);
        } else {
          // If next_schedule_date is in the past or today, move to next month
          referenceDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
          referenceDate.setHours(0, 0, 0, 0);
        }
      } else {
        // For other changes, use the later of today or start_date as reference
        referenceDate = startDateObj > today ? startDateObj : today;
      }

      // Use day_of_month and skip_weekends from request body, or fall back to schedule's values
      const dom = day_of_month !== undefined ? day_of_month : schedule.day_of_month;
      const shouldSkipWeekends = skip_weekends !== undefined ? skip_weekends : schedule.skip_weekends;

      // Calculate first occurrence on or after referenceDate
      const nextScheduleDate = computeNextScheduleDate(referenceDate, dom, shouldSkipWeekends);

      // Check if next occurrence exceeds end_date; if so, don't set it
      const finalEndDate = end_date !== undefined ? end_date : schedule.end_date;
      let nextScheduleDateStr: string | null = null;
      if (finalEndDate) {
        const endDateObj = parseLocalDate(finalEndDate);
        if (nextScheduleDate <= endDateObj) {
          nextScheduleDateStr = formatLocalDate(nextScheduleDate);
        }
      } else {
        nextScheduleDateStr = formatLocalDate(nextScheduleDate);
      }

      const updateRes = await pool.query(
        'UPDATE schedules SET next_schedule_date = $1 WHERE id = $2 RETURNING *',
        [nextScheduleDateStr, schedule.id]
      );
      schedule = updateRes.rows[0];
    }

    // Calculate expected_payments and payments_completed dynamically for response
    let paymentsCompleted = 0;
    let expectedPayments = 0;
    if (schedule.end_date && schedule.start_date) {
      const startDate = parseLocalDate(schedule.start_date);
      const endDate = parseLocalDate(schedule.end_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (schedule.frequency === 'MONTHLY') {
        expectedPayments = countPeriodicOccurrences(startDate, endDate, schedule.day_of_month, schedule.skip_weekends, 1);
        let current = new Date(startDate.getFullYear(), startDate.getMonth(), schedule.day_of_month);
        current.setHours(0, 0, 0, 0);
        if (current < startDate) current.setMonth(current.getMonth() + 1);
        while (current < today) {
          paymentsCompleted++;
          current.setMonth(current.getMonth() + 1);
        }
      } else if (schedule.frequency === 'QUARTERLY') {
        expectedPayments = countPeriodicOccurrences(startDate, endDate, schedule.day_of_month, schedule.skip_weekends, 3);
        let current = new Date(startDate);
        current.setHours(0, 0, 0, 0);
        while (current < today) {
          paymentsCompleted++;
          current.setMonth(current.getMonth() + 3);
        }
      } else if (schedule.frequency === 'BIANNUAL') {
        expectedPayments = countPeriodicOccurrences(startDate, endDate, schedule.day_of_month, schedule.skip_weekends, 6);
        let current = new Date(startDate);
        current.setHours(0, 0, 0, 0);
        while (current < today) {
          paymentsCompleted++;
          current.setMonth(current.getMonth() + 6);
        }
      } else if (schedule.frequency === 'ANNUAL') {
        expectedPayments = countPeriodicOccurrences(startDate, endDate, schedule.day_of_month, schedule.skip_weekends, 12);
        let current = new Date(startDate);
        current.setHours(0, 0, 0, 0);
        while (current < today) {
          paymentsCompleted++;
          current.setFullYear(current.getFullYear() + 1);
        }
      }
    }

    schedule.expected_payments = expectedPayments;
    schedule.payments_completed = paymentsCompleted;
    res.json(schedule);
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.delete('/api/schedules/:id', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    await pool.query('DELETE FROM schedules WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.get('/api/accounts/:id/schedules/generate-next-month', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const today = new Date();
    const nmStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const nmEnd   = new Date(today.getFullYear(), today.getMonth() + 2, 0);

    const { rows: schedules } = await pool.query(
      'SELECT * FROM schedules WHERE account_id = $1 AND user_id = $2 AND is_active = true',
      [req.params.id, req.user.id]
    );

    const items: any[] = [];
    for (const s of schedules) {
      const due = nextOccurrenceDate(s, nmStart);
      if (!due || due < nmStart || due > nmEnd) continue;
      const txAmount = scheduleTxAmount(s);
      items.push({
        date: formatLocalDate(due),
        description: s.description,
        amount: txAmount,
        category: s.category ?? null,
        transaction_type: s.transaction_type,
        schedule_id: s.id,
      });
    }

    items.sort((a, b) => a.date.localeCompare(b.date));
    res.json({ items });
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.get('/api/accounts/:id/schedules/simulate-next-month', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const today = new Date();
    const nmStart    = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const nmEnd      = new Date(today.getFullYear(), today.getMonth() + 2, 0);

    const { rows: schedules } = await pool.query(
      'SELECT * FROM schedules WHERE account_id = $1 AND user_id = $2 AND is_active = true',
      [req.params.id, req.user.id]
    );

  const simulatedTransactions: any[] = [];
  for (const s of schedules) {
    const due = nextOccurrenceDate(s, nmStart);
    if (!due || due < nmStart || due > nmEnd) continue;
    const txAmount = scheduleTxAmount(s);
    simulatedTransactions.push({
      id: `sim-${s.id}`,
      account_id: req.params.id,
      date: formatLocalDate(due),
      description: s.description,
      tiers: s.description,
      amount: txAmount,
      category: s.category ?? null,
      transaction_type: s.transaction_type,
      is_reconciled: false,
      deleted_at: null,
      schedule_id: s.id,
      is_transfer: !!s.target_account_id,
      target_account_id: s.target_account_id,
      related_account_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

    res.json(simulatedTransactions);
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.post('/api/accounts/:id/schedules/generate-next-month', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const targetMonth = req.query.month ? parseInt(req.query.month as string) : undefined;
    const targetYear = req.query.year ? parseInt(req.query.year as string) : undefined;
    const updateSchedules = req.query.mode !== 'preview';

    const result = await generateNextMonthForAccount(req.params.id, req.user.id, {
      targetMonth,
      targetYear,
      updateSchedules,
    });
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.get('/api/accounts/:id/schedules/generate-next-month/status', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const today = new Date();
    const nmStart    = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const nmEnd      = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    const nmStartStr = formatLocalDate(nmStart);
    const nmNextStr  = formatLocalDate(new Date(today.getFullYear(), today.getMonth() + 2, 1));

    const { rows: schedules } = await pool.query(
      'SELECT * FROM schedules WHERE account_id = $1 AND user_id = $2 AND is_active = true',
      [req.params.id, req.user.id]
    );

    const dueIds: string[] = [];
    for (const s of schedules) {
      const due = nextOccurrenceDate(s, nmStart);
      if (!due || due < nmStart || due > nmEnd) continue;
      dueIds.push(s.id);
    }

    let alreadyCreatedCount = 0;
    if (dueIds.length > 0) {
      const existingRes = await pool.query(
        `SELECT COUNT(DISTINCT schedule_id)::int AS count FROM transactions
         WHERE schedule_id = ANY($1::uuid[]) AND date >= $2 AND date < $3 AND deleted_at IS NULL`,
        [dueIds, nmStartStr, nmNextStr]
      );
      alreadyCreatedCount = existingRes.rows[0].count;
    }

    const triggerDate = computeTriggerDate(today.getFullYear(), today.getMonth());

    res.json({
      dueCount: dueIds.length,
      alreadyCreatedCount,
      autoRunDate: triggerDate.toISOString(),
    });
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

// ── New endpoints: simulate and generate for specific month ──────────────────

router.get('/api/accounts/:id/schedules/simulate-month', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 1);
    monthEnd.setDate(monthEnd.getDate() - 1);

    const { rows: schedules } = await pool.query(
      'SELECT * FROM schedules WHERE account_id = $1',
      [req.params.id]
    );

    const simulatedTransactions: any[] = [];
    for (const s of schedules) {
      const due = nextOccurrenceDate(s, monthStart);
      if (!due) continue;

      // Normalize dates to compare only year/month/day
      const dueDate = new Date(due.getFullYear(), due.getMonth(), due.getDate());
      const startDate = new Date(monthStart.getFullYear(), monthStart.getMonth(), monthStart.getDate());
      const endDate = new Date(monthEnd.getFullYear(), monthEnd.getMonth(), monthEnd.getDate());

      if (dueDate < startDate || dueDate > endDate) continue;

      const txAmount = scheduleTxAmount(s);
      simulatedTransactions.push({
        id: `sim-${s.id}`,
        account_id: req.params.id,
        date: formatLocalDate(due),
        description: s.description,
        tiers: s.description,
        amount: txAmount,
        category: s.category ?? null,
        transaction_type: s.transaction_type,
        is_reconciled: false,
        deleted_at: null,
        schedule_id: s.id,
        is_transfer: !!s.target_account_id,
        target_account_id: s.target_account_id,
        related_account_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    simulatedTransactions.sort((a, b) => a.date.localeCompare(b.date));
    res.json(simulatedTransactions);
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

router.post('/api/accounts/:id/schedules/generate-month', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
  const year = parseInt(req.query.year as string) || new Date().getFullYear();

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);
  monthEnd.setDate(monthEnd.getDate() - 1);
  const nextMonthStart = formatLocalDate(new Date(year, month, 1));

  const { rows: schedules } = await pool.query(
    'SELECT * FROM schedules WHERE account_id = $1',
    [req.params.id]
  );

  const dueItems: { s: any; due: Date; txAmount: number }[] = [];
  for (const s of schedules) {
    const due = nextOccurrenceDate(s, monthStart);
    if (!due) continue;

    // Normalize dates to compare only year/month/day
    const dueDate = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    const startDate = new Date(monthStart.getFullYear(), monthStart.getMonth(), monthStart.getDate());
    const endDate = new Date(monthEnd.getFullYear(), monthEnd.getMonth(), monthEnd.getDate());

    if (dueDate < startDate || dueDate > endDate) continue;
    const txAmount = scheduleTxAmount(s);
    dueItems.push({ s, due, txAmount });
  }

  if (dueItems.length === 0) return res.json({ created: 0, skipped: 0 });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const dueIds = dueItems.map(i => i.s.id);
    const existingRes = await client.query(
      `SELECT schedule_id FROM transactions
       WHERE schedule_id = ANY($1::uuid[]) AND date >= $2 AND date < $3 AND deleted_at IS NULL`,
      [dueIds, formatLocalDate(monthStart), formatLocalDate(new Date(monthStart.getFullYear(), monthStart.getMonth(), monthStart.getDate() + 1))]
    );
    const existingIds = new Set(existingRes.rows.map((r: any) => r.schedule_id));

    const notYetCreated = dueItems.filter(i => !existingIds.has(i.s.id));
    // Never write into an account the user does not own (legacy schedules may point at one).
    const ownedTargets = await ownedAccountIds(notYetCreated.map(i => i.s.target_account_id), req.user.id);
    const toCreate = notYetCreated.filter(i => !i.s.target_account_id || ownedTargets.has(i.s.target_account_id));
    const skipped = dueItems.length - toCreate.length;

    if (toCreate.length > 0) {
      const normalItems = toCreate.filter(i => !i.s.target_account_id);
      const transferItems = toCreate.filter(i => i.s.target_account_id);

      if (normalItems.length > 0) {
        await client.query(
          `INSERT INTO transactions (account_id, user_id, date, description, tiers, amount, category, is_reconciled, schedule_id, transaction_type, details)
           SELECT $1, $2, d, lbl, lbl, amt, cat, false, sid, txtype, det
           FROM unnest($3::date[], $4::text[], $5::numeric[], $6::text[], $7::uuid[], $8::text[], $9::text[])
                AS u(d, lbl, amt, cat, sid, txtype, det)`,
          [
            req.params.id,
            req.user.id,
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
            req.params.id,
            req.user.id,
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
            req.user.id,
            formatLocalDate(item.due),
            item.s.description,
            item.s.description,
            Math.abs(item.txAmount),
            item.s.category ?? null,
            item.s.id,
            req.params.id,
            item.s.details ?? null,
          ]
        );
      }

      await client.query(
        `UPDATE schedules
         SET next_schedule_date = $1,
             payments_completed = payments_completed + 1,
             is_completed = (expected_payments IS NOT NULL AND payments_completed + 1 >= expected_payments)
         WHERE id = ANY($2::uuid[])`,
        [nextMonthStart, toCreate.map(i => i.s.id)]
      );
    }

    await client.query('COMMIT');
    if (toCreate.length > 0 && req.user) {
      broadcastTransactionsChanged(req.user.id, req.params.id);
      const targetAccountIds = new Set(toCreate.map(i => i.s.target_account_id).filter(Boolean));
      for (const targetId of targetAccountIds) {
        broadcastTransactionsChanged(req.user.id, targetId);
      }
    }
    res.json({ created: toCreate.length, skipped });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: errMsg(err) });
  } finally {
    client.release();
  }
});

// ── Generate single schedule for next month ────────────────────────────────

router.post('/api/accounts/:id/schedules/:scheduleId/generate-single', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { rows: schedules } = await pool.query(
      'SELECT * FROM schedules WHERE id = $1 AND account_id = $2',
      [req.params.scheduleId, req.params.id]
    );

    if (schedules.length === 0) return res.status(404).json({ error: 'Schedule not found' });

    const s = schedules[0];

    if (!s.is_active) {
      return res.status(400).json({ error: 'Cette échéance est désactivée' });
    }
    // Never write into an account the user does not own (legacy schedules may point at one).
    if (s.target_account_id && !(await checkAccountOwnership(s.target_account_id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Use next_schedule_date from DB as the date to insert
    if (!s.next_schedule_date) {
      return res.json({ created: 0, skipped: 0, message: 'No next occurrence date' });
    }

    // Convert to YYYY-MM-DD format
    const nextDate = new Date(s.next_schedule_date);
    const dueStr = nextDate.toISOString().split('T')[0];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check if already exists
      const existingRes = await client.query(
        `SELECT id, deleted_at FROM transactions WHERE schedule_id = $1 AND date = $2`,
        [s.id, dueStr]
      );

      const activeExisting = existingRes.rows.filter(r => r.deleted_at === null);

      if (activeExisting.length > 0) {
        await client.query('ROLLBACK');
        return res.json({ created: 0, skipped: 1, message: 'Already exists for this month' });
      }

      const txAmount = scheduleTxAmount(s);

      if (!s.target_account_id) {
        await client.query(
          `INSERT INTO transactions (account_id, user_id, date, description, tiers, amount, category, is_reconciled, schedule_id, transaction_type, details)
           VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, $9, $10)`,
          [req.params.id, req.user.id, dueStr, s.description, s.description, txAmount, s.category ?? null, s.id, s.transaction_type, s.details ?? null]
        );
      } else {
        await client.query(
          `INSERT INTO transactions (account_id, user_id, date, description, tiers, amount, category, is_reconciled, schedule_id, transaction_type, related_account_id, details)
           VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, 'Virement émis', $9, $10)`,
          [req.params.id, req.user.id, dueStr, s.description, s.description, -Math.abs(txAmount), s.category ?? null, s.id, s.target_account_id, s.details ?? null]
        );
        await client.query(
          `INSERT INTO transactions (account_id, user_id, date, description, tiers, amount, category, is_reconciled, schedule_id, transaction_type, related_account_id, details)
           VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, 'Virement reçu', $9, $10)`,
          [s.target_account_id, req.user.id, dueStr, s.description, s.description, Math.abs(txAmount), s.category ?? null, s.id, req.params.id, s.details ?? null]
        );
      }

      // Calculate which occurrence this is based on the date we just inserted
      const startDate = new Date(s.start_date);
      const insertedDate = new Date(dueStr);

      // Calculate occurrence number: months between start_date and inserted date + 1
      const occurrenceNumber = (insertedDate.getFullYear() - startDate.getFullYear()) * 12 +
                               (insertedDate.getMonth() - startDate.getMonth()) + 1;

      // Count all transactions (including this new one)
      const countRes = await client.query(
        `SELECT COUNT(*) as cnt FROM transactions WHERE schedule_id = $1 AND deleted_at IS NULL`,
        [s.id]
      );
      const actualPaymentsCompleted = Math.max(occurrenceNumber, parseInt(countRes.rows[0].cnt || 0));

      // Calculate next_schedule_date: simply start_date + (occurrenceNumber months)
      const nextOccDate = addMonths(startDate, occurrenceNumber);

      // Check if next occurrence exceeds end_date; if so, clear it and mark as completed
      let nextOccStr: string | null = null;
      let shouldMarkCompleted = s.expected_payments && actualPaymentsCompleted >= s.expected_payments;

      if (s.end_date) {
        const endDate = parseLocalDate(s.end_date);
        if (nextOccDate > endDate) {
          // No more occurrences — don't set next_schedule_date
          shouldMarkCompleted = true;
        } else {
          nextOccStr = formatLocalDate(nextOccDate);
        }
      } else {
        nextOccStr = formatLocalDate(nextOccDate);
      }

      const isCompleted = shouldMarkCompleted;

      await client.query(
        `UPDATE schedules
         SET next_schedule_date = $1,
             payments_completed = $2,
             is_completed = $3
         WHERE id = $4`,
        [nextOccStr, actualPaymentsCompleted, isCompleted, s.id]
      );

      await client.query('COMMIT');
      if (req.user) {
        broadcastTransactionsChanged(req.user.id, req.params.id);
        if (s.target_account_id) broadcastTransactionsChanged(req.user.id, s.target_account_id);
      }
      res.json({ created: 1, skipped: 0 });
    } catch (err: any) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: errMsg(err) });
    } finally {
      client.release();
    }
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

export default router;
