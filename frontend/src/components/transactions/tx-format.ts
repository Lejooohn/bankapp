// Pure formatting and grouping helpers for the transaction list.

export function fmtDate(d: string | Date, locale: string): string {
  const dt = new Date(d);
  return dt.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function fmtAmount(n: string | number): string {
  const v = parseFloat(String(n));
  return (v >= 0 ? '+' : '') + v.toFixed(2) + ' €';
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
  return new Date(d).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

// "YYYY-MM"
export function getMonthKey(dateString: string): string {
  return dateString.substring(0, 7);
}

// Only schedules with a known end show a count (same rule as the Échéancier column)
export function occurrenceLabel(tx: any, schedules: Map<string, any>): string | null {
  if (!tx.schedule_id) return null;
  const s = schedules.get(tx.schedule_id);
  if (!s || s.expected_payments == null) return null;
  return `${s.payments_completed}/${s.expected_payments}`;
}
