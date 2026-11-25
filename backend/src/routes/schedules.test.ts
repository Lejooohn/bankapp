// Schedule updates and end-of-schedule rules, run through the real Express app.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../db.js', async () => {
  const h = await import('../../test/harness.js');
  return { default: h.fakeDb.pool, initDB: async () => {} };
});

import { app } from '../index.js';
import { deactivateEndedSchedules, generateNextMonthForAccount, monthAfterOccurrence } from '../services/schedule-generate.js';
import { fakeDb, withServer, jsonRequest, AUTH, TEST_USER_ID } from '../../test/harness.js';

const SCHEDULE = {
  id: 's-1', account_id: 'acc-1', user_id: TEST_USER_ID, description: 'Headphones', amount: '39.80',
  transaction_type: 'Prélèvement', category: 'Shop', details: 'x/4', target_account_id: null,
  frequency: 'MONTHLY', start_date: '2026-10-01', end_date: '2026-12-14', day_of_month: 14, skip_weekends: true,
  next_schedule_date: '2026-12-14', payments_completed: 2, expected_payments: null, max_occurrences: null,
  is_completed: false, is_active: true,
};

// Serves one stored schedule, plus the date of its last inserted transaction.
function serve(schedule: any, lastDate: string | null = null) {
  fakeDb.setHandler((sql) => {
    if (sql.includes('SELECT id FROM accounts WHERE id')) return { rows: [{ id: 'acc-1' }] };
    if (sql.includes('MAX(date)')) return { rows: [{ last_date: lastDate }] };
    if (sql.includes('SELECT COUNT(*)')) return { rows: [{ cnt: '3' }] };
    if (sql.includes('FROM schedules') || sql.includes('UPDATE schedules')) return { rows: [{ ...schedule }] };
    return undefined;
  });
}

const updates = () => fakeDb.calls.filter(c => c.sql.includes('UPDATE schedules'));
const patch = (base: string, body: unknown) =>
  jsonRequest(base, '/api/schedules/s-1', { method: 'PATCH', headers: AUTH, body });

beforeEach(() => {
  fakeDb.reset();
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 23, 12) });
});
afterEach(() => { vi.useRealTimers(); });

describe('PATCH /api/schedules/:id', () => {
  it('keeps category, details, end date and target account when only is_active is sent', async () => {
    serve(SCHEDULE);
    await withServer(app, async (base) => {
      expect((await patch(base, { is_active: false })).status).toBe(200);
    });
    const [u, ...rest] = updates();
    for (const col of ['category', 'details', 'end_date', 'target_account_id']) {
      expect(u.sql).toMatch(new RegExp(`${col} = CASE WHEN \\$\\d+::boolean THEN \\S+ ELSE ${col} END`));
    }
    expect(u.params.slice(14)).toEqual([false, false, false, false]);
    expect(u.params[13]).toBe(false);
    expect(rest).toHaveLength(0);
  });

  it('still clears a field sent as null', async () => {
    serve(SCHEDULE);
    await withServer(app, async (base) => {
      expect((await patch(base, { details: null })).status).toBe(200);
    });
    expect(updates()[0].params[4]).toBeNull();
    expect(updates()[0].params.slice(14)).toEqual([false, true, false, false]);
  });

  it('rejects invalid input', async () => {
    await withServer(app, async (base) => {
      expect((await patch(base, { is_active: 'no' })).status).toBe(400);
      expect((await patch(base, { day_of_month: 32 })).status).toBe(400);
      expect((await patch(base, { end_date: '14/12/2026' })).status).toBe(400);
    });
    expect(updates()).toHaveLength(0);
  });

  it('keeps a schedule finished when it is edited after its last occurrence was inserted', async () => {
    serve(SCHEDULE, '2026-12-14');
    await withServer(app, async (base) => { await patch(base, { end_date: '2026-12-14', details: 'x/4' }); });
    expect(updates()[1].params.slice(0, 3)).toEqual([null, true, false]);
  });

  it('leaves a schedule active while its last occurrence is still to come', async () => {
    serve(SCHEDULE, '2026-11-16');
    await withServer(app, async (base) => { await patch(base, { end_date: '2026-12-14' }); });
    expect(updates()[1].params.slice(0, 3)).toEqual(['2026-12-14', false, true]);
  });

  it('reactivates a finished schedule when its end date is extended', async () => {
    serve({ ...SCHEDULE, end_date: '2027-02-14', is_completed: true, is_active: false }, '2026-12-14');
    await withServer(app, async (base) => { await patch(base, { end_date: '2027-02-14' }); });
    expect(updates()[1].params.slice(0, 3)).toEqual(['2027-01-14', false, true]);
  });
});

describe('end of a schedule', () => {
  it('is switched off by the monthly insertion of its last occurrence', async () => {
    serve(SCHEDULE);
    expect(await generateNextMonthForAccount('acc-1', TEST_USER_ID)).toEqual({ created: 1, skipped: 0 });
    // next_schedule_date, payments_completed, is_completed, is_active
    expect(updates()[0].params.slice(1, 5)).toEqual([null, 3, true, false]);
  });

  it('stays active when an occurrence is left', async () => {
    serve({ ...SCHEDULE, end_date: '2027-01-14' });
    await generateNextMonthForAccount('acc-1', TEST_USER_ID);
    expect(updates()[0].params.slice(1, 5)).toEqual(['2027-01-14', 3, false, true]);
  });

  it('is switched off by the single insertion of its last occurrence', async () => {
    serve(SCHEDULE);
    await withServer(app, async (base) => {
      const res = await jsonRequest(base, '/api/accounts/acc-1/schedules/s-1/generate-single', { method: 'POST', headers: AUTH, body: {} });
      expect(await res.json()).toEqual({ created: 1, skipped: 0 });
    });
    expect(updates()[0].params).toEqual([null, 3, true, false, 's-1']);
  });

  it('single insertion finds the next occurrence from day_of_month, not from the start day', async () => {
    serve({ ...SCHEDULE, start_date: '2026-10-28', day_of_month: 5, end_date: '2026-12-10', next_schedule_date: '2026-11-05' });
    await withServer(app, async (base) => {
      await jsonRequest(base, '/api/accounts/acc-1/schedules/s-1/generate-single', { method: 'POST', headers: AUTH, body: {} });
    });
    const p = updates()[0].params;
    expect([p[0], p[2], p[3]]).toEqual(['2026-12-07', false, true]);
  });

  it('is switched off once the end date is in the past', async () => {
    await deactivateEndedSchedules('2026-11-23');
    expect(updates()[0].params).toEqual(['2026-11-23']);
    expect(updates()[0].sql).toContain('is_active = false');
  });

  it('reports the finished schedule with all its payments done', async () => {
    serve({ ...SCHEDULE, is_completed: true, is_active: false, next_schedule_date: null });
    await withServer(app, async (base) => {
      const [s] = await (await jsonRequest(base, '/api/accounts/acc-1/schedules', { headers: AUTH })).json() as any[];
      expect([s.payments_completed, s.expected_payments]).toEqual([3, 3]);
    });
  });

  it('an occurrence shifted into the next month belongs to the month before', () => {
    const s = { day_of_month: 31, skip_weekends: true };
    // Saturday 2026-10-31 is shifted to Monday 2026-11-02: November is still due.
    expect(monthAfterOccurrence(s, new Date(2026, 10, 2))).toEqual(new Date(2026, 10, 1));
    expect(monthAfterOccurrence(s, new Date(2026, 10, 30))).toEqual(new Date(2026, 11, 1));
  });
});

describe('payment counts of a schedule with a known end', () => {
  it('counts quarterly payments from day_of_month, in the list and after an update', async () => {
    serve({ ...SCHEDULE, frequency: 'QUARTERLY', start_date: '2026-07-01', day_of_month: 15, end_date: '2027-04-30', next_schedule_date: '2026-10-15' });
    await withServer(app, async (base) => {
      const [s] = await (await jsonRequest(base, '/api/accounts/acc-1/schedules', { headers: AUTH })).json() as any[];
      expect([s.payments_completed, s.expected_payments]).toEqual([1, 4]);
      const p = await (await patch(base, { details: 'x' })).json() as any;
      expect([p.payments_completed, p.expected_payments]).toEqual([1, 4]);
    });
  });

  it('gives no expected count without an end date', async () => {
    serve({ ...SCHEDULE, end_date: null });
    await withServer(app, async (base) => {
      const [s] = await (await jsonRequest(base, '/api/accounts/acc-1/schedules', { headers: AUTH })).json() as any[];
      expect(s.expected_payments).toBeNull();
    });
  });
});

describe('POST /api/accounts/:id/schedules', () => {
  // next_schedule_date is the last parameter of the insertion.
  async function createdNextDate(fields: object) {
    fakeDb.setHandler((sql) => {
      if (sql.includes('SELECT id FROM accounts WHERE id')) return { rows: [{ id: 'acc-1' }] };
      if (sql.includes('INSERT INTO schedules')) return { rows: [{ ...SCHEDULE }] };
      return undefined;
    });
    const body = { description: 'Insurance', amount: 90, transaction_type: 'Prélèvement', day_of_month: 15, skip_weekends: false, ...fields };
    await withServer(app, async (base) => {
      const res = await jsonRequest(base, '/api/accounts/acc-1/schedules', { method: 'POST', headers: AUTH, body });
      expect(res.status).toBe(200);
    });
    return fakeDb.calls.filter(c => c.sql.includes('INSERT INTO schedules')).at(-1)!.params.at(-1);
  }

  it('the first occurrence of a schedule already started follows its frequency', async () => {
    expect(await createdNextDate({ frequency: 'MONTHLY', start_date: '2026-01-15' })).toBe('2026-12-15');
    expect(await createdNextDate({ frequency: 'QUARTERLY', start_date: '2026-01-15' })).toBe('2027-01-15');
    expect(await createdNextDate({ frequency: 'BIANNUAL', start_date: '2026-03-15' })).toBe('2027-03-15');
    expect(await createdNextDate({ frequency: 'ANNUAL', start_date: '2025-06-15' })).toBe('2027-06-15');
  });

  it('keeps the last day of a short month', async () => {
    expect(await createdNextDate({ frequency: 'MONTHLY', start_date: '2027-02-01', day_of_month: 31 })).toBe('2027-02-28');
  });

  it('has no next occurrence past the end date', async () => {
    expect(await createdNextDate({ frequency: 'QUARTERLY', start_date: '2026-01-15', end_date: '2026-12-31' })).toBeNull();
  });
});
