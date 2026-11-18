interface BackupEntry {
  filename: string;
  date: string;
  time: string;
  sizeBytes: number;
  sizeMB: number;
  timestamp: string;
  category: 'daily' | 'manual';
}

export function dedupeBackupsByDate(backups: BackupEntry[]): BackupEntry[] {
  // Dedupe: if same timestamp exists in both daily and manual, keep only the daily version
  const seenTimestamps = new Set<string>();
  const result: BackupEntry[] = [];

  for (const backup of backups.sort((a, b) => {
    // Sort by tier priority (daily first) then by filename desc
    const tierOrder = { 'daily': 0, 'manual': 1 };
    const tierDiff = tierOrder[a.category] - tierOrder[b.category];
    if (tierDiff !== 0) return tierDiff;
    return b.filename.localeCompare(a.filename);
  })) {
    if (!seenTimestamps.has(backup.timestamp)) {
      seenTimestamps.add(backup.timestamp);
      result.push(backup);
    }
  }

  return result;
}

export function computeBackupCounts(backups: BackupEntry[]): {
  daily: number;
  manual: number;
  total: number;
} {
  const counts = { daily: 0, manual: 0, total: backups.length };

  for (const backup of backups) {
    if (backup.category === 'daily') counts.daily++;
    else if (backup.category === 'manual') counts.manual++;
  }

  return counts;
}
