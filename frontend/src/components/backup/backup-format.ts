// Types and formatting shared by the Backups dialog and its parts.
export type BackupCategory = 'daily' | 'weekly' | 'monthly' | 'manual' | 'pre-restore';
export type BackupTab = BackupCategory | 'snapshot';

export interface BackupFile {
  filename: string;
  category?: BackupCategory; // none for an account snapshot
  date: string | null;
  time: string | null;
  timestamp: string;
  sizeBytes: number;
  sizeMB: number;
  expiresAt?: string | null;
}

export interface BackupPolicyInfo {
  schedule: { hour: number; minute: number } | null;
  keepDays: number | null;
  keepWeeks: number | null;
  keepMonths: number | null;
  manualDays: number;
  snapshotsPerAccount: number;
}

export interface BackupStatus {
  status: 'success' | 'error' | 'no_backup';
  backups: BackupFile[];
  safetySnapshots: BackupFile[];
  policy?: BackupPolicyInfo;
  nextRun?: string | null;
  automatic?: { lastRun: string | null; state: 'ok' | 'late' | 'none' } | null;
}

// Same list as the API: weekly and monthly dumps are only removed by their retention.
export const DELETABLE: readonly (BackupCategory | undefined)[] = ['daily', 'manual', 'pre-restore', undefined];

type Translate = (key: string) => string;

export function fmtSize(bytes: number, locale: string): string {
  const mega = bytes / (1024 * 1024);
  const [value, unit, digits] = mega >= 1 ? [mega, 'megabyte', 1] : [bytes / 1024, 'kilobyte', 0];
  return new Intl.NumberFormat(locale, { style: 'unit', unit: unit as string, maximumFractionDigits: digits as number }).format(value as number);
}

export function fmtTime(date: Date, locale: string): string {
  return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

// "Aujourd'hui", "Hier", "Demain", otherwise the date, in local time
export function fmtDay(date: Date, locale: string, t: Translate, now: Date = new Date()): string {
  const dayNumber = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
  const diff = dayNumber(date) - dayNumber(now);
  if (diff === 0) return t("Aujourd'hui");
  if (diff === -1) return t('Hier');
  if (diff === 1) return t('Demain');
  const sameYear = date.getFullYear() === now.getFullYear();
  const label = date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Color of each kind, from the palette of the account types (copies made by a restore stay neutral)
export const LEVEL_COLOR: Record<BackupTab, string> = {
  daily: 'var(--acct-checking)',
  weekly: 'var(--acct-investment)',
  monthly: 'var(--acct-savings)',
  manual: 'var(--pending)',
  'pre-restore': 'var(--text-2)',
  snapshot: 'var(--text-2)',
};

const capitalize = (label: string) => label.charAt(0).toUpperCase() + label.slice(1);

// Moment of a backup: from its name when it says so, otherwise its last write. Daily names only hold the day.
function momentOf(b: BackupFile): Date {
  return b.category && b.date ? new Date(`${b.date}T${b.time ?? '00:00:00'}`) : new Date(b.timestamp);
}

// Week or month number and year, from a weekly or monthly name
function periodOf(b: BackupFile): { year: number; n: number } | null {
  const m = b.category === 'weekly' || b.category === 'monthly' ? b.filename.match(/(\d{4})(\d{2})\.sql\.gz$/) : null;
  return m && { year: Number(m[1]), n: Number(m[2]) };
}

// What a backup is called in a dialog: the day, the week, the month, or the moment.
export function backupTitle(b: BackupFile, locale: string, t: Translate): string {
  const period = periodOf(b);
  if (period && b.category === 'weekly') return t('Semaine {n} ({year})').replace('{n}', String(period.n)).replace('{year}', String(period.year));
  if (period) return capitalize(new Date(period.year, period.n - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' }));
  const at = momentOf(b);
  return b.category === 'daily' ? fmtDay(at, locale, t) : `${fmtDay(at, locale, t)} ${fmtTime(at, locale)}`;
}

// In the list, the calendar leaf already gives the number and the month of a day.
export function backupRowTitle(b: BackupFile, locale: string, t: Translate): string {
  if (b.category !== 'daily') return backupTitle(b, locale, t);
  const at = momentOf(b);
  const day = fmtDay(at, locale, t);
  return [t("Aujourd'hui"), t('Hier')].includes(day) ? day : capitalize(at.toLocaleDateString(locale, { weekday: 'long' }));
}

// The calendar leaf: day and month, week number, or month and year.
export function backupStamp(b: BackupFile, locale: string, t: Translate): { main: string; sub: string } {
  const period = periodOf(b);
  if (period && b.category === 'weekly') return { main: String(period.n), sub: t('sem.') };
  if (period) return { main: String(period.n).padStart(2, '0'), sub: String(period.year) };
  const at = momentOf(b);
  return { main: String(at.getDate()), sub: at.toLocaleDateString(locale, { month: 'short' }) };
}

// Second line of the row: what the file holds, or when it goes away.
export function backupNote(b: BackupFile, locale: string, t: Translate): string {
  const day = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'long' });
  if (b.category === 'weekly' || b.category === 'monthly') return t('État au {date}').replace('{date}', day(b.timestamp));
  if (b.expiresAt) return t('Supprimée après le {date}').replace('{date}', day(b.expiresAt));
  return '';
}
