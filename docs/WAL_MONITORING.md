# WAL Gap Monitoring Implementation

## Overview

WAL (Write-Ahead Log) gap monitoring tracks the critical metric for data persistence health — how much data is sitting in the kernel's page cache waiting to be flushed to disk.

**Why this matters:** The Sep 2026 incident showed that data can be visible in PostgreSQL queries but not actually on disk. A large WAL gap signals this condition, alerting you before data is lost on a crash.

## Deployment

### 1. Backend Service (`backend/src/services/wal-monitor.ts`)

Provides two functions:
- `getWalGap(pool)` — Query the database and return current WAL gap
- `classifyWalGap(bytes)` — Pure function to classify gap as 'ok', 'warning', or 'critical'

The query:
```sql
SELECT CAST(
  pg_wal_lsn_diff(pg_current_wal_lsn(), (SELECT redo_lsn FROM pg_control_checkpoint()))
  AS NUMERIC) AS gap_bytes
```

### 2. API Endpoint (`backend/src/index.ts`, ~line 183)

**Route:** `GET /api/backup/wal-status` (admin only)

Example response:
```json
{
  "gapBytes": 1048576,
  "gapMB": 1.0,
  "level": "warning",
  "checkedAt": "2026-10-02T18:45:30Z"
}
```

**Use case:** Dashboard or monitoring tool can poll this endpoint every 5 minutes.

### 3. Automated Monitoring (`backend/src/index.ts`, ~line 3680)

A cron job runs every 15 minutes:
- If WAL gap is `ok`: logs at debug level (quiet)
- If `warning`: logs at warn level
- If `critical`: logs at error level

Docker logs can be parsed by external monitoring systems (Grafana, Prometheus, ELK) to trigger alerts.

## Thresholds

Derived from **Sep 2026 incident analysis:**

| Threshold | Level | Meaning |
|-----------|-------|---------|
| < 1 MB | OK | Data flushing normally, safe |
| 1-10 MB | Warning | Data accumulating, monitor closely |
| 10-50 MB | Warning | Significant cache pressure |
| ≥ 50 MB | **Critical** | **Data stuck in RAM at risk** |

The Sep 2026 incident reached **77.5 MB** (critical) due to `vm.dirty_ratio=20%`.

## Testing

```bash
# Run unit tests for WAL gap classifier
cd backend && npm test -- wal-monitor

# Test API endpoint (requires auth token). An admin with a second factor gets
# {"mfa_required": true, "mfa_token": ...} instead of a token: use an admin without one,
# or complete the second step (docs/api.md).
TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"..."}' \
  | jq -r '.token')

curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/backup/wal-status

```

## Troubleshooting

**WAL gap stuck at high value:**
1. Check `vm.dirty_ratio` on host — should be 5 (not 20)
   ```bash
   ssh admin@nas cat /proc/sys/vm/dirty_ratio
   ```
2. Check disk usage — should be < 70%
3. Restart PostgreSQL container if necessary

**Cannot connect error:**
- Verify database container is running: `docker ps | grep bankapp-db`
- Verify connectivity: `docker exec bankapp-db pg_isready -U bankapp`

## Next Steps

This is part of a three-phase backup reliability plan:
1. ✅ **Phase 1: WAL Gap Monitoring** (done, commit c09dc03)
   - API endpoint, cron logging, in-app alerts
2. ✅ **Phase 2: Restore Reliability** (done, commit TBD)
   - Backup decryption, validated restore flow
3. **Phase 3: Off-Site Backup** (planned)
   - rclone sync to cloud storage (S3, B2, etc.)
   - PostgreSQL replication (optional, long-term)

## References

- Incident: `memory/lessons_learned_bankapp_2026.md`
- Root cause: `memory/nas_dirty_ratio_problem.md`
- API: `docs/api.md` → `GET /api/backup/wal-status`
