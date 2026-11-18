// Pure helpers for the scheduler view: no component state, no API calls.
// Calendar rules (holidays, business days, date parsing) come from @bankapp/shared.
import { parseLocalDate as parseDay, isBusinessDay } from '@bankapp/shared';

// Transaction types that credit the account (kept in sync with the backend).
export const CREDIT_TYPES = new Set(['Versement', 'Virement reçu', 'Dépôt de chèque']);

// Schedule dates are "YYYY-MM-DD" (the API may send a timestamp: keep the day part only).
export function parseLocalDate(str: string | null | undefined): Date | null {
  if (!str) return null;
  return parseDay(str.substring(0, 10));
}

export function formatCountdown(targetIso: string, lang: string, now: number): string {
  const dayUnit = lang === 'en' ? 'd' : 'j';
  const diffMs = new Date(targetIso).getTime() - now;
  if (diffMs <= 0) return `0${dayUnit} 0h 0m`;
  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  return `${days}${dayUnit} ${hours}h ${minutes}m`;
}

// Clamp day_of_month to the last day of the target month so e.g. day 31
// doesn't roll a 30-day month over into the next one.
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function clampedDate(year: number, month: number, dom: number): Date {
  return new Date(year, month, Math.min(dom, daysInMonth(year, month)));
}

// Next occurrence strictly after today (or null when past end_date).
export function nextOccurrence(s: any): Date | null {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dom = s.day_of_month;
  const start = parseLocalDate(s.start_date)!;
  let candidate: Date;

  if (s.frequency === 'MONTHLY') {
    candidate = clampedDate(today.getFullYear(), today.getMonth(), dom);
    if (candidate <= today) candidate = clampedDate(today.getFullYear(), today.getMonth() + 1, dom);
    while (candidate < start) candidate = clampedDate(candidate.getFullYear(), candidate.getMonth() + 1, dom);
  } else {
    const step = s.frequency === 'QUARTERLY' ? 3 : s.frequency === 'BIANNUAL' ? 6 : 12;
    let d = clampedDate(start.getFullYear(), start.getMonth(), dom);
    while (d <= today) d = clampedDate(d.getFullYear(), d.getMonth() + step, dom);
    candidate = d;
  }

  if (s.skip_weekends) {
    // Skip to next business day (weekend + French holidays)
    while (!isBusinessDay(candidate)) {
      candidate.setDate(candidate.getDate() + 1);
    }
  }

  if (s.end_date && candidate > parseLocalDate(s.end_date)!) return null;
  return candidate;
}

// Count occurrences remaining from next occurrence to end_date (inclusive)
export function remainingOccurrences(s: any): number | null {
  if (!s.end_date) return null;
  const end = parseLocalDate(s.end_date)!;
  const dom = s.day_of_month;
  const step = s.frequency === 'QUARTERLY' ? 3 : s.frequency === 'BIANNUAL' ? 6 : 12;

  const first = nextOccurrence(s);
  if (!first) return 0;

  let count = 0;
  let cur = new Date(first);

  while (cur <= end) {
    count++;
    if (s.frequency === 'MONTHLY') {
      cur = clampedDate(cur.getFullYear(), cur.getMonth() + 1, dom);
    } else {
      cur = clampedDate(cur.getFullYear(), cur.getMonth() + step, dom);
    }
    if (s.skip_weekends) {
      // Skip to next business day (weekend + French holidays)
      while (!isBusinessDay(cur)) {
        cur.setDate(cur.getDate() + 1);
      }
    }
  }
  return count;
}

export function fmtAmount(a: string | number, type: string): string {
  const sign = CREDIT_TYPES.has(type) ? '+' : '−';
  return `${sign}${Math.abs(parseFloat(String(a))).toFixed(2)} €`;
}

export function fmtEur(n: number): string {
  return (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(2) + ' €';
}

export function sortValue(s: any, col: string, freqLabels: Record<string, string>): string | number | null {
  switch (col) {
    case 'is_active': return s.is_active ? 1 : 0;
    case 'description': return (s.description || '').toLowerCase();
    case 'details': return (s.details || '').toLowerCase();
    case 'frequency': return freqLabels[s.frequency] || s.frequency || '';
    case 'category': return (s.category || '').toLowerCase();
    case 'day_of_month': return s.day_of_month ?? 0;
    case 'next_schedule_date': return s.next_schedule_date ? parseLocalDate(s.next_schedule_date)!.getTime() : null;
    case 'occurrences': return s.payments_completed ?? 0;
    case 'amount': return CREDIT_TYPES.has(s.transaction_type) ? Math.abs(parseFloat(s.amount)) : -Math.abs(parseFloat(s.amount));
    default: return '';
  }
}

// Label of the month the real insertion will create: earliest next_schedule_date, else next month.
export function nextMonthLabel(schedules: any[], locale: string): string {
  let minDate: Date | null = null;
  for (const s of schedules) {
    if (s.next_schedule_date) {
      const d = new Date(s.next_schedule_date);
      if (!minDate || d < minDate) minDate = d;
    }
  }
  if (!minDate) {
    const d = new Date(); d.setMonth(d.getMonth() + 1);
    minDate = d;
  }
  return minDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

// The real insertion always targets "next month" relative to today.
export function insertedMonthLabel(locale: string): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}
