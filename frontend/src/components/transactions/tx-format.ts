// Pure formatting and grouping helpers for the transaction list.
import { occurrenceRank, parseLocalDate } from '@bankapp/shared';

export function fmtDate(d: string | Date, locale: string): string {
  const dt = new Date(d);
  return dt.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// Signed amount in the reader's locale: "−62,48 €" / "+2 650,00 €" (fr), "−€62.48" (en).
// A real minus sign keeps the same width as the plus in tabular figures.
const amountFormats = new Map<string, Intl.NumberFormat>();

export function fmtAmount(n: string | number, locale: string, signDisplay: 'exceptZero' | 'auto' = 'exceptZero'): string {
  const key = `${locale}|${signDisplay}`;
  let format = amountFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', signDisplay });
    amountFormats.set(key, format);
  }
  return format.format(parseFloat(String(n)) || 0).replace('-', '−');
}

export function daysSince(d: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));
}

export function daysLeft(d: string): number {
  return Math.max(0, 30 - daysSince(d));
}

export function sameMonthYear(a: string, b: string): boolean {
  return !!a && !!b && a.substring(0, 7) === b.substring(0, 7);
}

export function fmtMonthYear(d: string | Date, locale: string): string {
  const label = new Date(d).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// "YYYY-MM"
export function getMonthKey(dateString: string): string {
  return dateString.substring(0, 7);
}

// "YYYY-MM" of today, in local time (toISOString would give the previous day's month around midnight)
export function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Rank of this operation in its schedule ("2/3"). Only schedules with a known end show a count
// (same rule as the Échéancier column).
export function occurrenceLabel(tx: any, schedules: Map<string, any>): string | null {
  if (!tx.schedule_id) return null;
  const s = schedules.get(tx.schedule_id);
  if (!s || s.expected_payments == null) return null;
  const rank = occurrenceRank(s, parseLocalDate(tx.date.substring(0, 10)));
  return `${Math.min(rank, s.expected_payments)}/${s.expected_payments}`;
}
