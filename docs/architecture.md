# Architecture

BankApp is a self-hosted personal finance application: an Express API, a Svelte single-page app served by nginx,
and PostgreSQL. Four containers run from `docker-compose.yml`.

```
 Browser ──HTTPS──> DSM reverse proxy ──> web (nginx, port 8080 in container, WEB_PORT on host)
                                              │  serves the SPA; proxies /api
                                              ▼
                                         api (Node 26, Express 5)  ──>  db (PostgreSQL 18)
                                              │                              ▲
                                              │                              │ pg_dump (nightly)
                                              ▼                              │
                                   backup sidecar (postgres-backup-local) ───┘
                                   writes dumps to BACKUP_DIR; the API encrypts them within 15 minutes
```

## Containers

| Service | Image | Published | Notes |
|---|---|---|---|
| `db` | `postgres:18-alpine` | `127.0.0.1:DB_PORT` | Data on the external volume `PGDATA_VOLUME` |
| `backend` | built from `backend/Dockerfile`, target `prod` | `127.0.0.1:API_PORT` | Runs `node dist/index.js`; dev dependencies pruned |
| `frontend` | built from `frontend/Dockerfile.prod` | `WEB_PORT` → 8080 | nginx: static bundle, `/api` proxy, security headers |
| `backup` | `prodrigestivill/postgres-backup-local:18-alpine` | none | Scheduled `pg_dump` into `BACKUP_DIR` |

The compose file refuses to start without `POSTGRES_PASSWORD`, `ENCRYPTION_KEY` and the external volume.

## Backend

- `index.ts` builds the Express app: trust-proxy setting, CORS allowlist, security headers, the JSON body parsers
  (1 MB by default, 50 MB for the CSV import route), then the authentication middleware for `/api`.
  It also starts the cron jobs (monthly schedule generation, backup encryption sweep every 15 minutes, WAL gap
  monitoring every 15 minutes) and boots the database.
- `routes/` holds one router per domain. Routers that handle their own authentication (login, second factor,
  password change, health) are mounted before the global middleware, and say so in their code.
- `services/` holds business logic that is not HTTP: schedules, budgets, encryption, backup creation and
  restoration, second-factor primitives (`totp.ts`, `mfa.ts`), WAL monitoring.
- `lib/` holds shared helpers: rate limits, ownership checks, error messages, Zod schemas.
- `db.ts` declares the schema and applies additive migrations at each start. See `docs/database.md`.

Every request that touches account data checks that the requester owns the account first. Money is never hard
deleted: transactions get a `deleted_at` timestamp and are purged after 30 days.

## Authentication flow

1. `POST /api/auth/login` checks the password (bcrypt, always run, so timing does not reveal the username).
2. If the user has an active second factor and the request has no valid trusted-device cookie, the API returns a
   challenge (`mfa_token`, 5 minutes). No session exists yet.
3. `POST /api/auth/mfa/verify` checks a TOTP code (accepted once) or a recovery code, then creates the session.
4. Sessions are random 256-bit tokens sent as `Authorization: Bearer`. Only their SHA-256 hash is stored, with an
   8-hour expiry. The frontend keeps the token in `localStorage` (see the limitations in the README).

## Frontend

- `App.svelte` handles the authentication state, the lock screen after 15 minutes of inactivity, and the
  main layout. Views and modals live in `components/`. `lib/api.js` is the only HTTP client.
- Strings go through `$t()` and `lib/i18n.ts` (French and English).
- `theme-init.js` applies the theme before first paint. It is a separate file so the Content-Security-Policy can
  forbid inline scripts.
- Server-sent events (`/api/events`) push "transactions changed" notifications so lists refresh.

## Shared code

`shared/` holds the calendar rules (holidays, business-day shifts, occurrences) and budget schemas, used by the
backend and the frontend. It has its own tests.

## Production topology and configuration

See `docs/DEPLOYMENT.md` for the required variables and the deploy procedure. Configuration is read
from `.env` only; nothing secret is committed.
