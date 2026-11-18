# Changelog

All notable changes to BankApp. The format follows [Keep a Changelog](https://keepachangelog.com/)
and the version follows [SemVer](https://semver.org/) (see `docs/versioning.md`).

## [Unreleased]

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
