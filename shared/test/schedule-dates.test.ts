import { describe, it, expect } from 'vitest';
import {
  getEasterDate, isFrenchHoliday, isBusinessDay, getNextBusinessDay, shiftToBusinessDay,
  countPeriodicOccurrences, computeNextScheduleDate, nextOccurrenceDate, computeTriggerDate,
  scheduleTxAmount, parseLocalDate, formatLocalDate, addMonths,
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
