import { describe, it, expect } from 'vitest';
import {
  getEasterDate, isFrenchHoliday, isBusinessDay, getNextBusinessDay, shiftToBusinessDay,
  countPeriodicOccurrences, computeNextScheduleDate, nextOccurrenceDate, computeTriggerDate,
  scheduleTxAmount, parseLocalDate, formatLocalDate, addMonths, occurrenceRank, nextMonthScheduleTotals, schedulePayments,
} from '../src/index.js';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe('French public holidays', () => {
  it('computes Easter Sunday for known years', () => {
    expect(formatLocalDate(getEasterDate(2026))).toBe('2026-04-05');
    expect(formatLocalDate(getEasterDate(2027))).toBe('2027-03-28');
  });

  it('flags fixed and Easter-based holidays', () => {
    expect(isFrenchHoliday(d(2026, 1, 1))).toBe(true);   // New Year
    expect(isFrenchHoliday(d(2026, 7, 14))).toBe(true);  // Bastille Day
    expect(isFrenchHoliday(d(2026, 4, 6))).toBe(true);   // Easter Monday
    expect(isFrenchHoliday(d(2026, 5, 14))).toBe(true);  // Ascension
    expect(isFrenchHoliday(d(2026, 5, 25))).toBe(true);  // Whit Monday
    expect(isFrenchHoliday(d(2026, 6, 15))).toBe(false);
  });

  it('treats weekends and holidays as non-business days', () => {
    expect(isBusinessDay(d(2026, 11, 16))).toBe(true);   // Monday
    expect(isBusinessDay(d(2026, 11, 14))).toBe(false);  // Saturday
    expect(isBusinessDay(d(2026, 12, 25))).toBe(false);  // Christmas
  });

  it('getNextBusinessDay skips a weekend and a holiday', () => {
    // Friday 2026-12-24 -> Sat, Sun, Fri 25 is a holiday -> Sat 26 -> Sun 27 -> Mon 28
    expect(formatLocalDate(getNextBusinessDay(d(2026, 12, 24)))).toBe('2026-12-28');
  });

  it('shiftToBusinessDay only shifts when skipWeekends is set', () => {
    expect(formatLocalDate(shiftToBusinessDay(d(2026, 11, 14), true))).toBe('2026-11-16');
    expect(formatLocalDate(shiftToBusinessDay(d(2026, 11, 14), false))).toBe('2026-11-14');
  });
});

describe('date parsing and arithmetic', () => {
  it('round-trips YYYY-MM-DD without timezone drift', () => {
    expect(formatLocalDate(parseLocalDate('2026-03-31'))).toBe('2026-03-31');
  });

  it('addMonths keeps the calendar day when it exists', () => {
    expect(formatLocalDate(addMonths(d(2026, 1, 15), 2))).toBe('2026-03-15');
  });
});

describe('computeNextScheduleDate', () => {
  it('returns this month when the day is still ahead', () => {
    expect(formatLocalDate(computeNextScheduleDate(d(2026, 11, 1), 10, false))).toBe('2026-11-10');
  });

  it('rolls to next month when the day has passed', () => {
    expect(formatLocalDate(computeNextScheduleDate(d(2026, 11, 20), 10, false))).toBe('2026-12-10');
  });

  it('moves a weekend occurrence to the next business day', () => {
    // 2026-11-14 is a Saturday
    expect(formatLocalDate(computeNextScheduleDate(d(2026, 11, 1), 14, true))).toBe('2026-11-16');
  });
});

describe('countPeriodicOccurrences', () => {
  it('counts monthly occurrences inclusively', () => {
    expect(countPeriodicOccurrences(d(2026, 1, 10), d(2026, 6, 10), 10, false, 1)).toBe(6);
  });

  it('counts quarterly occurrences', () => {
    expect(countPeriodicOccurrences(d(2026, 1, 10), d(2026, 12, 31), 10, false, 3)).toBe(4);
  });

  it('does not count an occurrence whose shifted date is after the end', () => {
    // 2026-06-14 is a Sunday, shifted to Monday 15 which is after end 14
    expect(countPeriodicOccurrences(d(2026, 1, 14), d(2026, 6, 14), 14, true, 1)).toBe(5);
  });
});

describe('nextOccurrenceDate', () => {
  const base = { day_of_month: 5, frequency: 'MONTHLY', start_date: '2026-01-05', skip_weekends: false, end_date: null };

  it('never proposes a date before start_date', () => {
    expect(formatLocalDate(nextOccurrenceDate(base, d(2025, 12, 1))!)).toBe('2026-01-05');
  });

  it('returns null once past end_date', () => {
    expect(nextOccurrenceDate({ ...base, end_date: '2026-03-01' }, d(2026, 4, 1))).toBeNull();
  });

  it('steps quarterly from start_date', () => {
    const s = { ...base, frequency: 'QUARTERLY' };
    expect(formatLocalDate(nextOccurrenceDate(s, d(2026, 2, 1))!)).toBe('2026-04-05');
  });
});

describe('scheduleTxAmount and computeTriggerDate', () => {
  it('credits positive types and debits everything else', () => {
    expect(scheduleTxAmount({ transaction_type: 'Versement', amount: -100 })).toBe(100);
    expect(scheduleTxAmount({ transaction_type: 'Prélèvement', amount: 100 })).toBe(-100);
  });

  it('triggers two days before the 1st of next month', () => {
    expect(formatLocalDate(computeTriggerDate(2026, 11))).toBe('2026-12-30');
  });
});

describe('occurrenceRank', () => {
  const s = { day_of_month: 14, frequency: 'MONTHLY', start_date: '2026-10-01', skip_weekends: true };

  it('numbers each occurrence of a monthly schedule', () => {
    expect(['2026-10-14', '2026-11-16', '2026-12-14'].map(x => occurrenceRank(s, parseLocalDate(x)))).toEqual([1, 2, 3]);
  });

  it('keeps the rank when the day is corrected within the month', () => {
    expect(occurrenceRank(s, d(2026, 11, 10))).toBe(2);
    expect(occurrenceRank(s, d(2026, 11, 28))).toBe(2);
  });

  it('counts by step for a quarterly schedule', () => {
    const q = { ...s, frequency: 'QUARTERLY' };
    expect([d(2026, 10, 14), d(2027, 1, 14), d(2027, 4, 14)].map(x => occurrenceRank(q, x))).toEqual([1, 2, 3]);
  });

  it('an occurrence shifted into the next month keeps its own rank', () => {
    const e = { ...s, day_of_month: 31 };
    expect(occurrenceRank(e, d(2026, 11, 2))).toBe(1);   // Saturday 2026-10-31, shifted
    expect(occurrenceRank(e, d(2026, 11, 30))).toBe(2);
  });
});

describe('nextMonthScheduleTotals', () => {
  const base = {
    is_active: true, is_completed: false, frequency: 'MONTHLY', skip_weekends: true, end_date: null,
    start_date: '2026-01-01', day_of_month: 5, next_schedule_date: '2027-01-05', transaction_type: 'Prélèvement', amount: '10.50',
  };
  const today = d(2026, 11, 24);

  it('stays on December of the current year when every next occurrence is in the following year', () => {
    const credit = { ...base, transaction_type: 'Virement reçu', amount: '100.00' };
    expect(nextMonthScheduleTotals([base, base, credit], today)).toEqual({ debits: 2, credits: 1, totalDebit: 21, totalCredit: 100 });
  });

  it('leaves out schedules that only start the following year', () => {
    const nextYear = { ...base, start_date: '2027-01-15', day_of_month: 15, next_schedule_date: '2027-01-15' };
    expect(nextMonthScheduleTotals([base, nextYear], today).debits).toBe(1);
    expect(nextMonthScheduleTotals([base, nextYear], d(2027, 1, 1)).debits).toBe(2);
  });

  it('leaves out finished schedules, even when their last occurrence is that month, and inactive ones', () => {
    const done = { ...base, is_active: false, is_completed: true, next_schedule_date: null, end_date: '2026-12-14' };
    const doneSwitchedOn = { ...done, is_active: true };
    const off = { ...base, is_active: false };
    expect(nextMonthScheduleTotals([base, done, doneSwitchedOn, off], today).debits).toBe(1);
  });

  it('uses the month of the earliest next occurrence within the year', () => {
    const october = { ...base, start_date: '2026-10-01', next_schedule_date: '2026-10-05' };
    const june = { ...base, next_schedule_date: '2026-06-05' };
    expect(nextMonthScheduleTotals([june, october], d(2026, 5, 20)).debits).toBe(1);
  });

  it('is not shifted by a stale date, nor by a schedule already inserted on its own', () => {
    const stale = { ...base, next_schedule_date: '2026-03-05' };
    expect(nextMonthScheduleTotals([stale, base], today).debits).toBe(2);
    const ahead = { ...base, next_schedule_date: '2027-02-05' };
    expect(nextMonthScheduleTotals([base, ahead], today).debits).toBe(2);
  });

  it('returns zeros without schedules', () => {
    expect(nextMonthScheduleTotals([], today)).toEqual({ debits: 0, credits: 0, totalDebit: 0, totalCredit: 0 });
  });
});

describe('schedulePayments', () => {
  const today = d(2026, 11, 24);
  const s = {
    frequency: 'MONTHLY', start_date: '2026-01-01', end_date: '2027-03-31', day_of_month: 5, skip_weekends: true,
    next_schedule_date: '2026-12-07', is_completed: false,
  };

  it('is null without an end date', () => {
    expect(schedulePayments({ ...s, end_date: null }, today)).toBeNull();
  });

  it('counts the remaining occurrences from the next one to the end', () => {
    expect(schedulePayments(s, today)).toEqual({ expected: 15, completed: 11, remaining: 4 });
  });

  it('an occurrence inserted ahead of time is no longer remaining', () => {
    expect(schedulePayments({ ...s, next_schedule_date: '2027-01-05' }, today)!.remaining).toBe(3);
  });

  it('counts by step from day_of_month, not from the start day', () => {
    const q = { ...s, start_date: '2026-01-01', end_date: '2026-12-31', day_of_month: 15, next_schedule_date: '2026-04-15' };
    expect(schedulePayments({ ...q, frequency: 'QUARTERLY' }, today)).toEqual({ expected: 4, completed: 1, remaining: 3 });
    expect(schedulePayments({ ...q, frequency: 'BIANNUAL', next_schedule_date: '2026-07-15' }, today)).toEqual({ expected: 2, completed: 1, remaining: 1 });
    expect(schedulePayments({ ...q, frequency: 'ANNUAL', end_date: '2028-12-31', next_schedule_date: '2027-01-15' }, today)).toEqual({ expected: 3, completed: 1, remaining: 2 });
  });

  it('handles the end of the month and an occurrence shifted into the next one', () => {
    const e = { ...s, start_date: '2026-01-01', end_date: '2026-12-31', day_of_month: 31 };
    expect(schedulePayments({ ...e, next_schedule_date: '2026-03-31' }, today)).toEqual({ expected: 12, completed: 2, remaining: 10 });
    // Saturday 2026-10-31 is shifted to 2026-11-02: October is still to come.
    expect(schedulePayments({ ...e, next_schedule_date: '2026-11-02' }, today)).toEqual({ expected: 12, completed: 9, remaining: 3 });
  });

  it('a finished schedule has nothing left', () => {
    expect(schedulePayments({ ...s, next_schedule_date: null, is_completed: true }, today)).toEqual({ expected: 15, completed: 15, remaining: 0 });
  });

  it('a last occurrence shifted past the end is not expected, and never counts as negative', () => {
    // Saturday 2026-12-05 is shifted to the 7th, after the end.
    const e = { ...s, end_date: '2026-12-06' };
    expect(schedulePayments(e, today)).toEqual({ expected: 11, completed: 11, remaining: 0 });
    expect(schedulePayments({ ...e, next_schedule_date: '2027-03-05' }, today)!.remaining).toBe(0);
  });

  it('without a next date, counts from today', () => {
    expect(schedulePayments({ ...s, next_schedule_date: null }, today)!.remaining).toBe(4);
  });
});
