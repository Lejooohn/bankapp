// Pure schedule date and amount rules, shared by the backend (generation) and the frontend
// (schedule display). No database access, no request state. Dates are local calendar days
// (see parseLocalDate / formatLocalDate).

// Parse YYYY-MM-DD string or Date object without timezone offset issues
export function parseLocalDate(dateInput: string | Date): Date {
  let year: number, month: number, day: number;

  if (typeof dateInput === 'string') {
    [year, month, day] = dateInput.split('-').map(Number);
  } else {
    year = dateInput.getFullYear();
    month = dateInput.getMonth() + 1;
    day = dateInput.getDate();
  }

  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date;
}

// Format a Date's local calendar day as 'YYYY-MM-DD' without going through
// toISOString() (which converts to UTC and rolls the date back a day whenever
// the server's TZ offset is ahead of UTC, e.g. Europe/Paris in summer).
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
// Kept in sync with CREDIT_TYPES in the frontend transaction modals.
const CREDIT_TRANSACTION_TYPES = new Set(['Versement', 'Virement reçu', 'Dépôt de chèque']);
export function scheduleTxAmount(s: { transaction_type: string; amount: number }): number {
  return CREDIT_TRANSACTION_TYPES.has(s.transaction_type) ? Math.abs(s.amount) : -Math.abs(s.amount);
}

// Returns { year, month, day } for the given instant, interpreted in Europe/Paris,
// independent of the process's local TZ (month is 0-indexed to match Date's convention).
export function getParisDateParts(d: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (type: string) => parseInt(parts.find(p => p.type === type)!.value, 10);
  return { year: get('year'), month: get('month') - 1, day: get('day') };
}

// Trigger day = 2 calendar days before the 1st of "next month" (relative to the given date).
export function computeTriggerDate(year: number, month: number): Date {
  const nextMonthFirst = new Date(year, month + 1, 1);
  const triggerDate = new Date(nextMonthFirst);
  triggerDate.setDate(triggerDate.getDate() - 2);
  return triggerDate;
}
// French holidays helper: Calculate Easter date for a given year
// Meeus/Jones/Butcher algorithm (Gregorian calendar). Easter falls in March or April,
// so the month must be computed, not assumed. The previous formula always returned a
// March date, which moved Easter Monday, Ascension and Whit Monday on most years.
export function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// French holidays: Check if a date is a French public holiday
export function isFrenchHoliday(date: Date): boolean {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  const day = date.getDate();
  
  const easter = getEasterDate(year);
  const easterDay = easter.getDate();
  const easterMonth = easter.getMonth();
  
  // Mobile holidays (based on Easter)
  const mondayAfterEaster = new Date(year, easterMonth, easterDay + 1);
  const ascension = new Date(year, easterMonth, easterDay + 39);
  const pentecostMonday = new Date(year, easterMonth, easterDay + 50);
  
  // Fixed holidays
  const holidays: [number, number][] = [
    // Month (0-indexed), Day
    [0, 1],   // Jan 1 - New Year
    [4, 1],   // May 1 - Labor Day
    [4, 8],   // May 8 - WWII Victory
    [6, 14],  // July 14 - Bastille Day
    [7, 15],  // Aug 15 - Assumption
    [10, 1],  // Nov 1 - All Saints
    [10, 11], // Nov 11 - Armistice
    [11, 25], // Dec 25 - Christmas
  ];
  
  // Check fixed holidays
  for (const [m, d] of holidays) {
    if (month === m && day === d) return true;
  }
  
  // Check mobile holidays
  if (
    (month === mondayAfterEaster.getMonth() && day === mondayAfterEaster.getDate()) ||
    (month === ascension.getMonth() && day === ascension.getDate()) ||
    (month === pentecostMonday.getMonth() && day === pentecostMonday.getDate())
  ) {
    return true;
  }
  
  return false;
}

// Check if a date is a weekend (Saturday = 6, Sunday = 0)
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

// Check if a date is a business day (not weekend, not holiday)
export function isBusinessDay(date: Date): boolean {
  return !isWeekend(date) && !isFrenchHoliday(date);
}

// Get the next business day (skips weekends and French holidays)
export function getNextBusinessDay(date: Date): Date {
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);
  
  while (!isBusinessDay(nextDay)) {
    nextDay.setDate(nextDay.getDate() + 1);
  }
  
  return nextDay;
}

// Simple month addition: start_date + N months
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

// Date a generated occurrence actually lands on once weekend shifting is applied.
export function shiftToBusinessDay(date: Date, skipWeekends: boolean): Date {
  const d = new Date(date);
  if (skipWeekends) {
    while (!isBusinessDay(d)) d.setDate(d.getDate() + 1);
  }
  return d;
}

// Number of occurrences every stepMonths months (1 = monthly, 3 = quarterly, 6 = biannual,
// 12 = annual) between start and end (inclusive), counting only those whose actual date
// (after weekend shift) is not later than end_date.
export function countPeriodicOccurrences(start: Date, end: Date, dayOfMonth: number, skipWeekends: boolean, stepMonths: number): number {
  let count = 0;
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const lastMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= lastMonth) {
    const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const occurrence = new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(dayOfMonth, lastDay));
    if (occurrence >= start && shiftToBusinessDay(occurrence, skipWeekends) <= end) count++;
    cursor.setMonth(cursor.getMonth() + stepMonths);
  }
  return count;
}

// First occurrence of day_of_month on or after referenceDate, honoring skip_weekends.
export function computeNextScheduleDate(referenceDate: Date, dayOfMonth: number, skipWeekends: boolean): Date {
  let next = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), dayOfMonth);
  next.setHours(0, 0, 0, 0);

  if (next < referenceDate) {
    next = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, dayOfMonth);
    next.setHours(0, 0, 0, 0);
  }

  if (skipWeekends) {
    while (!isBusinessDay(next)) {
      next.setDate(next.getDate() + 1);
    }
  }

  return next;
}

export function nextOccurrenceDate(
  s: { day_of_month: number; frequency: string; start_date: string; skip_weekends: boolean; end_date?: string | null },
  from: Date
): Date | null {
  const dom = s.day_of_month;
  const start = parseLocalDate(s.start_date);
  let candidate: Date;

  // Helper: get last day of month (1-indexed clamping)
  const clampDayToMonth = (year: number, month: number, day: number): Date => {
    const lastDay = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(day, lastDay));
  };

  if (s.frequency === 'MONTHLY') {
    // Never propose an occurrence before the schedule's own start_date.
    const floor = from > start ? from : start;
    candidate = clampDayToMonth(floor.getFullYear(), floor.getMonth(), dom);
    if (candidate < floor) candidate = clampDayToMonth(floor.getFullYear(), floor.getMonth() + 1, dom);
  } else {
    const step = s.frequency === 'QUARTERLY' ? 3 : s.frequency === 'BIANNUAL' ? 6 : 12;
    let d = clampDayToMonth(start.getFullYear(), start.getMonth(), dom);
    while (d < from) d = clampDayToMonth(d.getFullYear(), d.getMonth() + step, dom);
    candidate = d;
  }

  if (s.skip_weekends) {
    // Skip weekends and holidays: move to next business day
    while (!isBusinessDay(candidate)) {
      candidate.setDate(candidate.getDate() + 1);
    }
  }

  if (s.end_date && candidate > parseLocalDate(s.end_date)) return null;
  return candidate;
}
