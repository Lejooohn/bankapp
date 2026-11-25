// Pure helpers for the scheduler view: no component state, no API calls.
// Calendar rules (holidays, business days, date parsing) come from @bankapp/shared.
import { parseLocalDate as parseDay } from '@bankapp/shared';

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

// Occurrences not inserted yet, or null when the schedule has no known end. Same counts as the
// Occurrences column, so both always agree.
export function remainingOccurrences(s: any): number | null {
  if (!s.end_date || s.expected_payments == null) return null;
  return Math.max(0, s.expected_payments - s.payments_completed);
}

// Amount of the occurrences not inserted yet, or null when there is nothing to show
// (no known end, or finished). Counted in cents.
export function remainingAmount(s: any): number | null {
  const n = remainingOccurrences(s);
  if (!n || s.is_completed) return null;
  return Math.round(Math.abs(parseFloat(s.amount)) * 100) * n / 100;
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
