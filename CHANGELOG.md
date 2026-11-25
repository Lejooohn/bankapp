# Changelog

All notable changes to BankApp. The format follows [Keep a Changelog](https://keepachangelog.com/)
and the version follows [SemVer](https://semver.org/) (see `docs/versioning.md`).

## [Unreleased]

### Upgrade notes
- `git pull`, then `docker compose up -d --build`. The database migration runs at startup and only adds a column
  (`categorization_rules.deleted_at`).
- Rules that were inactive before the upgrade stay hidden: up to 1.1.0, disabling a rule and deleting it were the
  same thing. Create the ones you still want again.
- If you had changed `SCHEDULE` or `BACKUP_KEEP_*` in `docker-compose.yml`, set your values in the `x-backup-policy`
  block at the top of the file.

### Added
- Backups: the dialog lists every level (daily, weekly, monthly, manual, before a server restore), each with the
  policy applied to it, the next scheduled backup, and a warning when a nightly backup was missed. Every level can
  be downloaded and restored; weekly and monthly dumps cannot be deleted by hand.
- Backups: delete all manual backups at once, with a typed confirmation
  (`POST /api/backup/manual/delete-bulk`). Only the backups listed when the dialog opened are deleted.
- `GET /api/accounts/:id/transactions` accepts `since` (`YYYY-MM-DD`): the page holds every operation from that day.
- Scheduler: a schedule with a known end shows its remaining amount and number of occurrences under its
  amount (occurrences not inserted in the operations yet).

### Changed
- Sidebar and Operations screen redesigned: neutral surfaces with a single blue accent, IBM Plex type, one
  icon set, equal row heights, readable secondary text. A pending operation keeps a light amber row with a
  dashed circle, a ticked one shows a pen tick. Debits are red and credits green; each balance wears
  the color of its state (blue ticked, amber pending, green or red final), the occurrence count (2/3) is
  blue. The trash button turns red when it holds operations.
- Operation amounts follow the interface language (2 647,73 € in French, €2,647.73 in English).
- Operations: the current month is open by default, even when operations of a later month exist; it used to
  be the newest month.
- Sidebar: each account is a block in the color of its type (blue checking, green savings, violet investment),
  and the menu of the open account hangs inside it.
- Operations list: third parties at full strength on every row, payment modes and categories in their color,
  the date at full strength while the operation is pending.
- Categories: a card per category with its color, number of operations and share of use; sort by name or by
  use. Deleting asks in the app's own dialog.
- Categorization rules: grouped by category, with the conditions spelled out (or / and), a search, errors shown
  on the page, and a confirmation before deleting a rule.
- Category labels follow the theme everywhere (scheduler, budgets, pickers, rule dialogs).
- Light theme: soft blue-grey and ink instead of white and black, calmer colors, also in the scheduler and charts.
- Small screens: the sidebar folds into a menu button.
- Wide screens: the content uses the whole window (up to 2400 px), operations fit on one line with their
  details beside the third party, and the statistics stand on one row.
- Statistics: one main chart (expenses in the accent, income in neutral); the two pie charts become ranked
  lists with thin bars, each with its share.
- Fonts are bundled with the app and the Content-Security-Policy allows no external host: pages no longer
  call Google Fonts.
- Operations: the whole current year is loaded, with only the current month open. Months hidden by a filter keep
  their folded state, and "select all" takes the unfolded rows (or every search result) only.
- Backups dialog redesigned: one tile per kind of backup with its color, retention shown as pips (filled: backups
  present, empty: places left), each backup led by its date. Account snapshots are called "go back before a
  restore" and only shown when there are some.
- The backup policy is set once (`x-backup-policy` in `docker-compose.yml`) and given to both the backup sidecar and
  the API.
- A schedule is switched to inactive when its last occurrence is inserted, or once its end date has
  passed (checked at startup and every night). Extending its end date switches it back on.

### Fixed
- Backups: delete, download and restore work on the dumps the dialog lists. The list read `daily/` and `manual/`,
  but the three actions only looked in `last/` and refused the names of the scheduled dumps.
- The restore dialog opened behind the Backups dialog, and its English version asked for RESTORE while only
  RESTAURER was accepted.
- Restoring an account snapshot no longer asks which data to restore: the choice was ignored.
- Disabling a categorization rule no longer deletes it: it stays in the list and can be enabled again. Deletion
  has its own `deleted_at` column; rules already inactive stay hidden, also when an older backup is restored.
- Creating a rule identical to a deleted one works again (it was refused as a duplicate).
- The statistics chart follows a theme or language change right away.
- The scheduler table no longer widens the page; below its minimum width it scrolls in its own frame.
- Toggling a schedule active/inactive no longer clears its details, category, end date and transfer
  target: `PATCH /api/schedules/:id` keeps the fields that are not sent, and validates its input.
- The next occurrence after an insertion follows the schedule's frequency, day and end date.
- Operations show their own rank in the schedule (1/3, 2/3, 3/3) instead of its overall progress.
- The scheduler totals no longer drop to zero when every next occurrence is in the following year: they
  cover the active, unfinished schedules due in the next month to come, within the current year.
- The Occurrences column counts the payments of quarterly, semi-annual and annual schedules from the day
  of the month, not from the start day, and end-of-month schedules no longer skip short months. The
  last-occurrence badge uses the same count.
- Creating a quarterly, semi-annual or annual schedule that already started sets its next occurrence from
  its frequency (it was always the next month).

### Removed
- `counts` in the response of `GET /api/backup/status` (replaced by `policy`, `nextRun` and `automatic`).

## [1.1.0] - 2026-11-16

### Added
- Second factor (TOTP, RFC 6238), opt-in per user: enrolment with QR code or manual key, ten one-time
  recovery codes (downloadable as a text file), challenge at login, "remember this device" for 20 days
  (HttpOnly, Secure, SameSite=Strict cookie). Admin can reset a user's factor.
- Security headers on the API (`nosniff`, `X-Frame-Options: DENY`, referrer policy, CORP) and a
  Content-Security-Policy on the web image (same-origin scripts only, no inline script).
- `TRUSTED_PROXY_CIDR` (web image) and `TRUST_PROXY_HOPS` (API): where the reverse proxy's
  `X-Forwarded-For` is trusted.
- Automated tests: 122 backend tests (Vitest), including route tests through the real app, RFC 6238
  vectors, and deployment configuration guards. Shared package: 27 tests.
- `docs/DEPLOYMENT.md`: how the NAS stack is deployed and checked.
- `docs/architecture.md`, `docs/features.md`, `docs/database.md`: reference documents for the current code.

### Changed
- Login: a failed password is counted per client address and username (5 per 30 minutes); successful
  logins are not. The per-IP limit of 5 logins per 30 minutes is unchanged. No account-wide lockout.
- Password checks made with a session (verify-password, change-password, second-factor enrolment,
  confirmation and disabling) share one budget of 5 per user per 30 minutes.
- Enrolling or confirming a second factor requires the account password. Confirming it ends the user's
  other sessions.
- A password change, an admin password reset and an admin factor reset end the user's trusted devices
  and any open second-factor challenge.
- Restoring from a full database dump is admin-only (it was open to any signed-in user). Each restore
  request stages its data in its own schema.
- Production compose: backend runs compiled output (`node dist/index.js`) with dev dependencies pruned;
  the web image is served by nginx and proxies `/api`; no source code is mounted.
- Postgres and the API are published on 127.0.0.1 only. The web port is unchanged (`WEB_PORT`, 5173 by
  default), it now maps to the nginx listener on 8080.
- nginx overwrites `X-Forwarded-For` with the connection address and takes the real client address only
  from `TRUSTED_PROXY_CIDR`.
- `ENCRYPTION_KEY` set to the all-zero placeholder is refused; `.env.example` no longer ships a key.
- NAS scripts (backup, health check, WAL check, restore, restore test) take their folder from their own location
  and their container names from `CONTAINER_PREFIX` in `.env` (default `bankapp`). `restore.sh` stops and
  starts the current API and web containers; it used to name containers that no longer exist.

### Removed
- `POST /api/settings/change-password` (legacy password check, not used by the app).
- `POST /api/dev/clear-categories` (cleared categories for every user).

### Fixed
- Error responses no longer include raw database error messages.
- Locked-transaction lookup on PATCH and DELETE is scoped to the requesting user (it leaked whether another
  user's transaction existed and was locked).
- The rate-limit map is bounded (expired windows are purged).
- CSV imports above 1 MB were refused with `413`: the global JSON parser ran before the import route's
  50 MB parser. The import route now gets the larger limit; every other route keeps 1 MB.
  The large parser runs after authentication only: an unauthenticated request is refused before its body is read.
- The WAL check reported CRITICAL on every run: it used `bc`, which the NAS does not have. It uses `awk` now.
- The health check could count a second `0` when the API did not answer, which broke its comparison.
- The health check queried port 3000 even when the stack publishes the API on `API_PORT` (3100 on the NAS).
- The WAL check alert text said "threshold: 10 MB"; the thresholds it applies are 1 MB and 50 MB.
- `backup.sh` wrote plain gzip dumps into the backup folder, against the encryption policy. It now encrypts the
  dump inside the backend image, before it reaches the disk, and writes `manual/` in the application's format.
- `restore.sh` called `node` on the host, which the NAS does not have: no dump could be validated. It decrypts in the
  backend image, like `restore-test.sh`.
- `restore-test.sh` restored into PostgreSQL 15, which cannot load a PostgreSQL 18 dump: the weekly test had been
  failing since the migration. It uses PostgreSQL 18 now and passed on 2026-11-16.

## [1.0.0] - 2026-11-16

First release of BankApp: the rewrite of BankApp on the current stack.

### Changed
- Backend on Node.js 26, Express 5, Zod 4, TypeScript 7, PostgreSQL 18 (was Node 20, PostgreSQL 15).
- Frontend on Svelte 5, Vite 8, Tailwind CSS 4, ApexCharts 8 (was Svelte 4).
- Backend split by domain (`routes/`, `services/`, `lib/`); schedule calendar and Zod schemas shared
  through `@bankapp/shared`.
- Scheduler and transaction list split into smaller components.
- Calendar: Easter (and therefore Easter Monday, Ascension and Pentecost Monday) computed correctly.
- User interface strings are translated (French and English).
- Production frontend image served by nginx; compose names, ports and volume are configurable.

### Fixed
- Budget updates returned 500; budget creation without a start date returned 500.
- Scheduled transfers could target another user's account; generated operations had no owner.
- Generated operations of `generate-month` were not visible in lists.
- Backup list and account snapshot failed on a fresh installation.
- PostgreSQL 18 volume layout.
