# Database

PostgreSQL 18. The schema is declared and migrated in `backend/src/db.ts` (`initDB()`), at every backend start.
Migrations are additive only: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`.
Nothing is dropped automatically.

Extensions: `pg_trgm` (substring search on transaction tiers) and `unaccent` (accent-insensitive matching, wrapped
in an immutable function for indexes).

## Tables

| Table | Purpose | Owner key |
|---|---|---|
| `users` | Accounts: username, bcrypt hash, email (optional), role (`user` or `admin`), theme | — |
| `sessions` | Session tokens, stored as SHA-256 hashes, 8-hour expiry | `user_id` |
| `accounts` | Bank accounts (checking, savings, investment) | `user_id` |
| `transactions` | Operations. Soft-deleted through `deleted_at`, never hard-deleted by the app | `account_id`, `user_id` |
| `categories` | Categories per account | `account_id`, `user_id` |
| `categorization_rules` | Tier and detail patterns that assign categories | `account_id`, `user_id` |
| `schedules` | Recurring operations and their next occurrence | `account_id`, `user_id` |
| `budgets` | Monthly budgets per category | `account_id`, `user_id` |
| `backups` | Legacy. Nothing writes it any more; the admin route only deletes rows from it. The backup inventory is read from the files in `BACKUP_DIR` | — |
| `settings` | Legacy single row. Not used by the application since the user-based login; kept, not dropped | — |
| `user_totp` | Second factor per user: encrypted secret, enabled flag, last accepted TOTP step (anti-replay) | `user_id` |
| `user_recovery_codes` | Recovery codes, stored as SHA-256 hashes, marked used once | `user_id` |
| `mfa_challenges` | Pending second step after a correct password: hashed token, expiry, attempts. One per user | `user_id` |
| `trusted_devices` | Devices that passed the second step with "remember": hashed token, 20-day expiry | `user_id` |

Every table that holds a user's financial data carries `user_id`, and the routes filter by it.

## Indexes (selection)

- Transactions: `(account_id, deleted_at, date DESC)` for paging, `date`, `category`, `schedule_id`, `user_id`,
  and a trigram index on `tiers` for search.
- Owners: `user_id` on accounts, categories, rules, schedules, budgets, sessions and trusted devices.

## Operational notes

- The database volume is external to compose (`PGDATA_VOLUME`): compose refuses to start without it, so an
  empty database is never created by accident. See `docs/DEPLOYMENT.md` and `docs/RESTORE_RUNBOOK.md`.
- Reset of a second factor (admin) deletes the user's `user_totp`, `user_recovery_codes` and `trusted_devices`
  rows and open `mfa_challenges`.
