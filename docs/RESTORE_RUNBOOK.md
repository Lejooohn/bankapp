# Emergency Restore Runbook

Restores are tested by hand: there is no automated restore test

> **Default names:** containers `bankapp-db`, `bankapp-api`, volume `bankapp-pgdata`, project directory = the folder containing `docker-compose.yml`. See `docs/DEPLOYMENT.md`. The scripts default to the `bankapp` names; `POSTGRES_CONTAINER` can override them.

## Quick Start (Emergency)

**If database is corrupted or lost:**

```bash
# In the project folder:
POSTGRES_CONTAINER=bankapp-db bash scripts/restore.sh
bash scripts/restore.sh

# Follows this flow:
# 1. Lists available backups (daily/ and manual/)
# 2. Asks which to restore
# 3. Validates backup (decrypts, decompresses, checks schema)
# 4. Creates safety snapshot to pre-restore/
# 5. Stops frontend/backend
# 6. Drops old schema
# 7. Restores with atomic transaction (all-or-nothing)
# 8. Verifies row counts
# 9. Restarts services
```

**Expected duration:** 2-5 minutes
**Risk:** Low (transaction rollback on error, safety snapshot preserved)

---

## Detailed Flow

### 1. Backup Selection

The script lists all available backups in `$BACKUP_DIR/daily/` and `$BACKUP_DIR/manual/`:
- **daily/** — automated dumps, encrypted by `sweepAndEncryptAutoBackups` every 15 minutes
- **manual/** — on-demand dumps via API, also encrypted

You'll be prompted to use the latest or specify a custom path.

### 2. Pre-Restoration Validation ⚠️ CRITICAL

Before touching the database, the script:
1. **Decrypts** the backup (AES-256-GCM using `ENCRYPTION_KEY` from `.env`)
2. **Decompresses** (gzip)
3. **Validates** SQL syntax and schema presence
4. **Rejects** if any step fails

This prevents the scenario: *"DROP SCHEMA → restore fails → database empty"*

### 3. Safety Snapshot

Before dropping anything, creates a backup of the current state:
```
$BACKUP_DIR/pre-restore/dump-before-2026-10-02-142930.sql.gz
```

Keep this file — it's your insurance policy for the restore itself to fail.

### 4. Atomic Restore

Uses `psql --single-transaction`, so either:
- **Success:** all data restored, transaction committed
- **Failure:** entire transaction rolled back, no partial data

### 5. Verification

Checks row counts and max transaction date to confirm restore integrity.

---

## Scenarios

### Scenario A: Corrupted Database

```bash
# Symptoms: queries fail, constraints violated

bash scripts/restore.sh
# Select the most recent backup from daily/
```

**Outcome:** Clean restore, services restarted, old state preserved in pre-restore/

---

### Scenario B: Accidental Data Deletion

```bash
# Symptoms: some rows missing, but most data intact

# Option 1: Restore entire DB from before the accident
bash scripts/restore.sh

# Option 2: Merge specific rows from old backup
# (More complex, requires manual SQL merging via pre-restore dump)
```

---

### Scenario C: Restore Itself Failed

```bash
# Symptoms: restore script crashed, database schema dropped

# Step 1: The script created a safety snapshot before dropping
# It's in: $BACKUP_DIR/pre-restore/dump-before-*.sql.gz

# Step 2: Restore from that snapshot
bash scripts/restore.sh
# Select the pre-restore/ dump

# Step 3: Try again with a different backup
```

---

## Testing Restore Reliability

### No Automated Test

There is no automated restore test. Test a restore by hand on a copy of the stack (below) before relying on a backup.
on the local stack (below) before relying on a backup.

### Manual Test (Local Dev)

```bash
# 1. Start local stack
docker-compose --env-file .env.local -f docker-compose.local.yml up -d

# 2. List available backups
ls -lht backups/daily/ backups/manual/ 2>/dev/null

# 3. Test restore against bankapp-db-local
POSTGRES_CONTAINER=bankapp-db-local bash scripts/restore.sh

# 4. Select one of the backups
# Script validates and restores into local DB
```

---

## Key Metrics

| Metric | Value | Source |
|--------|-------|--------|
| **RTO** (Recovery Time Objective) | ~5 min | Last measured by hand |
| **RPO** (Recovery Point Objective) | ~24h | Daily backup at 23:00 |
| **Restore Test Frequency** | Manual | Not scheduled |
| **Backup Retention** | 7 daily + 4 weekly + 6 monthly | `prodrigestivill/postgres-backup-local` config |
| **Encryption** | AES-256-GCM at rest | `backend/src/services/encryption.ts` |
| **Backup Age Alert** | None | Check `backups/` by hand |

---

## Troubleshooting

### "ENCRYPTION_KEY env var must be 64 hex characters"

**Problem:** `.env` file missing or `ENCRYPTION_KEY` not set.

**Solution:**
```bash
# Check that .env exists in the bankapp root
ls -la /path/to/bankapp/.env

# If missing, copy from .env.example and fill in the key
cp .env.example .env
# Edit .env and set ENCRYPTION_KEY to a valid 64-hex value
```

### "Cannot connect to PostgreSQL"

**Problem:** Database container not running.

**Solution:**
```bash
# Start the stack
docker-compose -f docker-compose.yml up -d

# Wait for healthcheck
sleep 10

# Try restore again
bash scripts/restore.sh
```

### "Restored database has 0 accounts"

**Problem:** Backup is from an early state or corrupted.

**Solution:**
1. Check backup file size: `ls -lh $BACKUP_DIR/daily/`
2. Try an older backup: `bash scripts/restore.sh /path/to/other/backup`

### "Transaction rolled back — restore failed"

**Problem:** SQL syntax error or constraint violation during restore.

**Solution:**
1. The database state is unchanged (transaction rolled back automatically)
2. Check that you selected the correct backup file
3. Try a different, older backup
4. If all backups fail, check PostgreSQL logs: `docker logs bankapp-db`

---

## Data Volume & Full Restart

The PostgreSQL data lives in the named volume **`bankapp-pgdata`** (`PGDATA_VOLUME` in `.env`), mounted on
`/var/lib/postgresql`. The compose file declares it `external`, so:

- `docker-compose up` **refuses to start** if the volume is missing. It never
  silently creates an empty database (that is what happened on 2026-11-09).
- `docker-compose down` / `up` / `restart` keep the data. Only `down -v` removes
  volumes, and it must never be used on this stack.

**Create the volume once, on a new host** (it is created by hand, never by compose):
```bash
sudo docker volume create bankapp-pgdata
```

**Check before stopping anything** (status, data volume, data present):
```bash
sudo docker ps --format '{{.Names}} {{.Status}}'
sudo docker inspect bankapp-db --format '{{range .Mounts}}{{.Name}}:{{.Destination}} {{end}}'
sudo docker exec bankapp-db psql -U bankapp -d bankapp -At -c \
  "SELECT (SELECT count(*) FROM users), (SELECT count(*) FROM accounts), (SELECT count(*) FROM transactions);"
```

**Full stop / start** (only after a fresh, decrypted-and-tested backup):
```bash
cd /path/to/bankapp
sudo docker compose stop
sudo docker compose up -d
```

Then re-run the data check: the counts must match what they were before the stop.

---

## Preventing Restore Disasters

### Never:
- ❌ Run `scripts/restore.sh` in production without testing in local first
- ❌ Delete `$BACKUP_DIR/pre-restore/dump-before-*.sql.gz` files immediately after restore
- ❌ Delete or modify the `bankapp-pgdata` volume manually
- ❌ Ignore warnings about backup age in the logs

### Always:
- ✅ Test restore by hand after changes to backups or the schema
- ✅ Keep `ENCRYPTION_KEY` safe and backed up separately
- ✅ Verify row counts after restore before considering it successful
- ✅ Keep at least 3 days of backups before rotating old ones out

---

## See Also

- `scripts/restore.sh` — Main restoration script
- `scripts/decrypt-backup.mjs` — Decryption helper (called by restore.sh)
- `docs/WAL_MONITORING.md` — Data persistence monitoring
- `docs/api.md` → `GET /api/backup/wal-status` — WAL gap metric
- `backend/src/services/encryption.ts` — Encryption/decryption implementation
