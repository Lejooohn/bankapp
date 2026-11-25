import { describe, it, expect } from 'vitest';
import { automaticBackupHealth, getBackupPolicy, nextBackupRun } from './backup-policy.js';

describe('getBackupPolicy', () => {
  it('reads the sidecar settings', () => {
    expect(getBackupPolicy({ SCHEDULE: '30 2 * * *', BACKUP_KEEP_DAYS: '7', BACKUP_KEEP_WEEKS: '4', BACKUP_KEEP_MONTHS: '6' }))
      .toMatchObject({ schedule: { hour: 2, minute: 30 }, keepDays: 7, keepWeeks: 4, keepMonths: 6 });
  });

  it.each([undefined, '@daily', '0 23 * * 1', '*/5 * * * *', '0 25 * * *'])('does not invent a time for %s', (SCHEDULE) => {
    expect(getBackupPolicy({ SCHEDULE, BACKUP_KEEP_DAYS: 'many' })).toMatchObject({ schedule: null, keepDays: null });
  });
});

describe('nextBackupRun', () => {
  const policy = getBackupPolicy({ SCHEDULE: '0 23 * * *' });
  it('is today before the time, tomorrow from that time on', () => {
    expect(nextBackupRun(policy, new Date(2026, 10, 25, 10, 0))).toBe(new Date(2026, 10, 25, 23, 0).toISOString());
    expect(nextBackupRun(policy, new Date(2026, 10, 25, 23, 0))).toBe(new Date(2026, 10, 26, 23, 0).toISOString());
  });
  it('is unknown without a schedule', () => {
    expect(nextBackupRun(getBackupPolicy({}))).toBeNull();
  });
});

describe('automaticBackupHealth', () => {
  const now = Date.parse('2026-11-25T10:00:00Z');
  const entry = (category: any, timestamp: string): any => ({ category, timestamp });
  it('is ok after last night, late after a missed night, none without any daily dump', () => {
    expect(automaticBackupHealth([entry('daily', '2026-11-24T22:15:00.000Z')], now).state).toBe('ok');
    expect(automaticBackupHealth([entry('daily', '2026-11-23T22:15:00.000Z')], now).state).toBe('late');
    expect(automaticBackupHealth([entry('manual', '2026-11-25T09:00:00.000Z')], now)).toEqual({ lastRun: null, state: 'none' });
  });
});
