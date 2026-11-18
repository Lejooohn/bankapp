# BankApp API Documentation

## Monitoring Endpoints

### GET /api/backup/wal-status

Monitor PostgreSQL Write-Ahead Log (WAL) gap — critical for data persistence health.

**Authentication:** Bearer token (admin only)

**Response:**
```json
{
  "gapBytes": 524288,
  "gapMB": 0.5,
  "level": "ok",
  "checkedAt": "2026-10-02T18:30:45.123Z"
}
```

**Fields:**
- `gapBytes` — WAL gap in bytes (difference between current LSN and redo LSN)
- `gapMB` — WAL gap in megabytes (rounded to 2 decimals)
- `level` — Classification: `"ok"` (< 1 MB), `"warning"` (1-50 MB), `"critical"` (≥ 50 MB)
- `checkedAt` — ISO 8601 timestamp when the check was performed

**Thresholds:**
- **OK:** < 1 MB — Data is being flushed to disk normally
- **Warning:** 1-50 MB — Data accumulating in cache; monitor closely
- **Critical:** ≥ 50 MB — **Data stuck in RAM**, at risk of loss on crash

**Example:** Sep 2026 incident had WAL gap of 77.5 MB due to `vm.dirty_ratio=20` on Synology NAS.

**Background:** PostgreSQL's `fsync=on` setting writes to the OS buffer cache, not directly to disk. The kernel then decides when to physically write to storage based on system parameters like `vm.dirty_ratio`. If the WAL gap grows large, data may be lost if the system crashes before it reaches disk.

---

## Admin Endpoints

### GET /api/admin/users

List all user accounts (admin only).

### PATCH /api/admin/users/:id

Rename a user account (admin only).

---

## Backup Endpoints

### GET /api/backup/status

Retrieve backup inventory and safety snapshots (admin sees full database backups, users see only their own account snapshots).

---

## See Also
- `backend/src/services/wal-monitor.ts` — WAL gap monitoring implementation
- `backend/src/index.ts` (~3680) — Cron job that monitors WAL gap every 15 minutes

## Authentication: second factor (TOTP)

Opt-in per user. Without an enabled factor the login is unchanged: the password returns a session.

### POST /api/auth/login

Returns a session `{ user, theme, themeSchedule, token }`, **or**, when the factor is enabled and
the request has no valid device cookie, `{ mfa_required: true, mfa_token }` with no session.
`mfa_token` is valid for 5 minutes.

### POST /api/auth/mfa/verify

Body: `{ mfa_token, code, remember? }`. `code` is a 6-digit TOTP or a recovery code (case and
dashes are ignored). Returns the session on success. A challenge allows 5 attempts. Each TOTP
step is accepted once. With `remember: true` the response sets an `HttpOnly; Secure; SameSite=Strict`
cookie `bk_device` (path `/api/auth`, 20 days) that skips the second step on that browser.

### Settings (signed-in user)

| Method | Path | Body | Result |
|---|---|---|---|
| GET | `/api/auth/mfa` | — | `{ enabled, recovery_codes_remaining }` |
| POST | `/api/auth/mfa/enroll` | `{ password }` | `{ secret, otpauth }` (not yet enabled) |
| POST | `/api/auth/mfa/confirm` | `{ password, code }` | enables the factor, ends the user's other sessions; `{ recovery_codes }` shown once |
| DELETE | `/api/auth/mfa` | `{ password, code }` | disables it and clears trusted devices |

### Admin

`POST /api/admin/users/:id/mfa/reset` removes a user's factor, recovery codes and trusted devices.

Changing a password (self-service or admin reset) also removes the user's trusted devices.

### Rate limits (authentication)

All in memory, per backend process: they reset when the backend restarts.

| Limit | Applies to | Window |
|---|---|---|
| 5 login requests per client address | `POST /api/auth/login` (every attempt counts) | 30 min |
| 5 failed passwords per client address and exact username | `POST /api/auth/login` | 30 min, cleared on success |
| 5 password checks per user | verify-password, change-password, second-factor enrolment, confirmation, disabling | 30 min |
| 30 second-factor verifications per client address | `POST /api/auth/mfa/verify` | 30 min |
| 10 wrong second-factor codes per user | `POST /api/auth/mfa/verify` | 30 min |
| 5 attempts per challenge; a challenge lasts 5 minutes; one open challenge per user | `POST /api/auth/mfa/verify` | — |

Rate-limited responses are `429`. Wrong passwords and wrong codes are `401` with the same message whether
or not the account exists. There is no account-wide lockout: a failure from one client never blocks another
client's correct login. Accounts without a second factor have no account-wide cap on password guessing.

### Response headers

- API: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Cross-Origin-Resource-Policy: same-origin`. No `X-Powered-By`.
- Web (nginx): the same headers plus a Content-Security-Policy that allows same-origin scripts only, no
  inline script, and Google Fonts for styles and fonts.

---

## Admin Endpoints (second factor and passwords)

### POST /api/admin/users/:id/mfa/reset

Removes the user's second factor, recovery codes and trusted devices, and ends their open challenges.
Admin only. `404` if the user does not exist.

### PATCH /api/admin/users/:id/password

Sets a new password (admin only). Ends the user's sessions, trusted devices and open challenges.

---

## Account Backup Restore

### POST /api/accounts/:id/backup/restore

Restores selected data (`tables`) of a backup file into the account (`destination`: `current` or `new`).

- A **safety snapshot** (`bankapp-safety-…`) can be restored by its owner.
- A **full database dump** (`bankapp-YYYYMMDD-HHMMSS.sql.gz`) is **admin only** (`403` otherwise), because it
  holds every user's data. Only the requester's own rows are written.
- Each request stages the dump in its own schema, dropped at the end of the request.

---

## Removed endpoints

- `POST /api/settings/change-password` — removed. Use `POST /api/auth/change-password`.
- `POST /api/dev/clear-categories` — removed.
