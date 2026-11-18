import './zod-config.js';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import pool, { initDB } from './db.js';
import importRoute from './routes/import.js';
import eventsRoute from './routes/events.js';
import backupRestoreRoute from './routes/backup-restore.js';
import budgetsRoute from './routes/budgets.js';
import { sweepAndEncryptAutoBackups } from './services/backup-auto-encrypt.js';
import { getWalGap } from './services/wal-monitor.js';
import { retryUntilSuccess } from './services/retry.js';
import { getParisDateParts, computeTriggerDate } from '@bankapp/shared';
import { hashTokenForStorage, errMsg } from './lib/shared.js';
import { securityHeaders, parseTrustProxyHops } from './lib/security-headers.js';
import { generateNextMonthForAccount } from './services/schedule-generate.js';
import backupStatusRouter from './routes/backup-status.js';
import authRouter from './routes/auth.js';
import meRouter from './routes/me.js';
import aboutRouter from './routes/about.js';
import adminRouter from './routes/admin.js';
import accountsRouter from './routes/accounts.js';
import transactionsRouter from './routes/transactions.js';
import schedulesRouter from './routes/schedules.js';
import categoriesRouter from './routes/categories.js';
import rulesRouter from './routes/rules.js';
import exportRouter from './routes/export.js';
import statsRouter from './routes/stats.js';

const app = express();

// Trust one hop (the DSM reverse proxy in front of the app) so req.ip reflects the
// real client address instead of the internal frontend/proxy container — otherwise
// rate limiting below would bucket every visitor under the same IP.
app.set('trust proxy', parseTrustProxyHops(process.env.TRUST_PROXY_HOPS));
app.disable('x-powered-by');
app.use(securityHeaders());

// Restrict cross-origin browser access to known frontend origins (comma-separated
// in CORS_ORIGINS). Requests with no Origin header (curl, server-to-server, mobile
// apps) aren't browser-mediated, so CORS doesn't apply to them either way.
const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
}));

// Without this, Express's default error handler would forward the "Not allowed by
// CORS" error to the client as an HTML page with a full stack trace.
app.use((err: Error, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.message === 'Not allowed by CORS') return res.status(403).json({ error: 'Not allowed by CORS' });
  next(err);
});

// The CSV import route reads its own 50 MB body with a parser mounted after authentication
// (routes/import.ts). Here the global 1 MB parser skips that one path, so an unauthenticated
// request can never make the server read a 50 MB body. Everything else keeps 1 MB.
const jsonDefault = express.json({ limit: '1mb' });
const IMPORT_PATH = /^\/api\/accounts\/[^/]+\/import$/;
app.use((req, res, next) => (IMPORT_PATH.test(req.path) ? next() : jsonDefault(req, res, next)));

// ── Auth middleware ───────────────────────────────────────────────────────────

// Extend Express Request type to include user info
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; username: string; role: string };
    }
  }
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.use(backupStatusRouter);

app.use(authRouter);

// Auth middleware for protected routes
app.use('/api', async (req, res, next) => {
  // Public routes bypass auth
  if (req.path === '/auth/login' || req.path === '/auth/register' || req.path === '/auth/logout' || req.path === '/health') {
    return next();
  }

  // All other routes require authentication
  const header = req.headers.authorization;
  if (!header) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const token = header.replace('Bearer ', '');

  // Session-based auth (multi-profile)
  try {
    const tokenHash = hashTokenForStorage(token);
    const sessionResult = await pool.query(
      'SELECT user_id FROM sessions WHERE token_hash = $1 AND (expires_at IS NULL OR expires_at > NOW())',
      [tokenHash]
    );

    if (sessionResult.rows.length > 0) {
      const userResult = await pool.query(
        'SELECT id, username, role FROM users WHERE id = $1',
        [sessionResult.rows[0].user_id]
      );
      if (userResult.rows.length > 0) {
        req.user = userResult.rows[0];
        return next();
      }
    }
  } catch (err: any) {
    console.error('Auth error:', err);
  }

  // No valid token found
  return res.status(401).json({ error: 'Non autorisé' });
});

app.use(meRouter);
app.use(aboutRouter);

app.use(adminRouter);

app.use('/api', importRoute);

app.use('/api', eventsRoute);

app.use('/api', backupRestoreRoute);

app.use('/api', budgetsRoute);

app.use(accountsRouter);

app.use(transactionsRouter);

app.use(schedulesRouter);

app.use(categoriesRouter);

app.use(rulesRouter);

app.use(exportRouter);

app.use(statsRouter);


export { app };

// ── Cron jobs ─────────────────────────────────────────────────────────────────

if (process.env.NODE_ENV !== 'test') {
  cron.schedule('0 0 * * *', async () => {
    const { year, month, day } = getParisDateParts(new Date());
    const triggerDate = computeTriggerDate(year, month);

    const isTriggerDay =
      year === triggerDate.getFullYear() &&
      month === triggerDate.getMonth() &&
      day === triggerDate.getDate();

    if (!isTriggerDay) return;

    const { rows: accounts } = await pool.query('SELECT id, user_id FROM accounts');
    for (const acc of accounts) {
      try {
        await generateNextMonthForAccount(acc.id, acc.user_id);
      } catch (err) {
        console.error(`[cron] auto-generate failed for account ${acc.id}:`, errMsg(err));
      }
    }
  }, { timezone: 'Europe/Paris' });

  // Encrypts at rest any plaintext dump the postgres-backup-local sidecar has written
  // since the last sweep. Runs independently of that container's own SCHEDULE.
  cron.schedule('*/15 * * * *', async () => {
    try {
      const { encrypted } = await sweepAndEncryptAutoBackups(process.env.BACKUP_DIR || '/backups');
      if (encrypted.length > 0) {
        console.log(`[backup-auto-encrypt] encrypted ${encrypted.length} file(s): ${encrypted.join(', ')}`);
      }
    } catch (err) {
      console.error('[backup-auto-encrypt] sweep failed:', errMsg(err));
    }
  });

  // Monitor WAL gap every 15 minutes — critical metric for data persistence
  cron.schedule('*/15 * * * *', async () => {
    try {
      const { gapMB, level } = await getWalGap(pool);
      if (level === 'ok') {
        console.debug(`[wal-gap-monitor] OK: ${gapMB} MB`);
      } else if (level === 'warning') {
        console.warn(`[wal-gap-monitor] WARNING: WAL gap ${gapMB} MB (threshold: 10 MB)`);
      } else if (level === 'critical') {
        console.error(`[wal-gap-monitor] CRITICAL: WAL gap ${gapMB} MB (data may be in cache!)`);
      }
    } catch (err) {
      console.error('[wal-gap-monitor] failed:', errMsg(err));
    }
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 3000;

if (process.env.NODE_ENV !== 'test') {
  // Keep retrying: the database may still be starting, or be restarted later on.
  retryUntilSuccess(initDB, 5000, (err, attempt) => {
    console.error(`[boot] database not ready (attempt ${attempt}):`, errMsg(err));
  })
    .then(() => {
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Server running on port ${PORT}`);

      });
    });
}

