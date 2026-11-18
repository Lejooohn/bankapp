// auth API routes (mounted from index.ts).
import express from 'express';

import { z } from 'zod';
import bcrypt from 'bcryptjs';
import pool from '../db.js';
import { checkRateLimit, isRateLimited, recordFailedAttempt, clearRateLimit, hashTokenForStorage, generateToken, errMsg } from '../lib/shared.js';
import { loginSchema, passwordSchema, registerSchema, themeScheduleSchema, mfaVerifySchema, mfaDisableSchema, mfaSetupSchema } from '../lib/schemas.js';
import { generateSecret, verifyTotp, base32Encode, otpauthUri } from '../services/totp.js';
import {
  encryptSecret, decryptSecret, normalizeRecoveryCode, generateRecoveryCodes, randomToken, sha256Hex,
  readCookie, deviceCookieHeader, clearDeviceCookieHeader,
  DEVICE_COOKIE, MFA_CHALLENGE_TTL_MS, MFA_MAX_ATTEMPTS, TRUSTED_DEVICE_TTL_MS,
} from '../services/mfa.js';

const router = express.Router();

// Hash compared when the username is unknown, so a failed login takes the same bcrypt
// time whether or not the account exists (no username enumeration by timing).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('bankapp-timing-dummy', 10);

const LOGIN_WINDOW_MS = 30 * 60 * 1000;
// Failed passwords allowed per (client IP, username) pair. The key includes the IP, so a
// client can only lock itself out; it never locks the account for other clients.
const LOGIN_PAIR_MAX_FAILURES = 5;
// Failed second-factor codes per user (across challenges) before that user's checks pause.
const MFA_USER_MAX_FAILURES = 10;

// POST /api/auth/register - Register new user (admin-only, except initial bootstrap when no users exist)
router.post('/api/auth/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });

  try {
    const countResult = await pool.query('SELECT COUNT(*)::int AS count FROM users');
    const hasUsers = countResult.rows[0].count > 0;

    if (hasUsers) {
      const header = req.headers.authorization;
      if (!header) return res.status(401).json({ error: 'Non autorisé' });

      const token = header.replace('Bearer ', '');
      const tokenHash = hashTokenForStorage(token);
      const sessionResult = await pool.query(
        'SELECT user_id FROM sessions WHERE token_hash = $1 AND (expires_at IS NULL OR expires_at > NOW())',
        [tokenHash]
      );
      if (sessionResult.rows.length === 0) return res.status(401).json({ error: 'Non autorisé' });

      const requesterResult = await pool.query('SELECT role FROM users WHERE id = $1', [sessionResult.rows[0].user_id]);
      if (requesterResult.rows.length === 0 || requesterResult.rows[0].role !== 'admin') {
        return res.status(403).json({ error: 'Seul un administrateur peut créer un compte' });
      }
    }
  } catch (err: any) {
    return res.status(500).json({ error: errMsg(err) });
  }

  const { username, password, email } = parsed.data;
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash, email) VALUES ($1, $2, $3) RETURNING id, username, email',
      [username, passwordHash, email || null]
    );

    if (result.rows.length === 0) {
      return res.status(500).json({ error: 'Failed to create user' });
    }

    const user = result.rows[0];
    const token = generateToken();
    const tokenHash = hashTokenForStorage(token);

    await pool.query(
      'INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, tokenHash, new Date(Date.now() + 8 * 60 * 60 * 1000)] // 8 hours
    );

    res.json({ user, token });
  } catch (err: any) {
    if (err.code === '23505') { // Unique constraint violation
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: errMsg(err) });
  }
});

// ── Login and second factor ──────────────────────────────────────────────────

const USER_PUBLIC_COLUMNS = 'id, username, email, theme, theme_schedule, role';

function themeScheduleOrDefault(value: any) {
  return value || { enabled: false, darkHours: Array.from({ length: 24 }, (_, h) => h >= 20 || h < 7) };
}

async function createSession(userId: string): Promise<string> {
  const token = generateToken();
  await pool.query(
    'INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, hashTokenForStorage(token), new Date(Date.now() + 8 * 60 * 60 * 1000)] // 8 hours
  );
  return token;
}

function sessionPayload(user: any, token: string) {
  return {
    user: { id: user.id, username: user.username, email: user.email, role: user.role },
    theme: user.theme || 'light',
    themeSchedule: themeScheduleOrDefault(user.theme_schedule),
    token,
  };
}

// The authenticated user for the /api/auth routes below (they sit before the global auth middleware).
async function sessionUserId(req: express.Request): Promise<string | null> {
  const header = req.headers.authorization;
  if (!header) return null;
  const result = await pool.query(
    'SELECT user_id FROM sessions WHERE token_hash = $1 AND (expires_at IS NULL OR expires_at > NOW())',
    [hashTokenForStorage(header.replace('Bearer ', ''))]
  );
  return result.rows[0]?.user_id ?? null;
}

// One budget for every password check that a signed-in user makes (verify-password, change-password,
// second-factor enrolment and disabling), so one session cannot split guesses across endpoints.
const passwordCheckKey = (userId: string) => `pwcheck:${userId}`;
const PASSWORD_CHECKS_PER_WINDOW = 5;

// Password re-check for enrolment and confirmation.
async function passwordOk(userId: string, password: string): Promise<boolean | 'limited'> {
  if (!checkRateLimit(passwordCheckKey(userId), PASSWORD_CHECKS_PER_WINDOW, LOGIN_WINDOW_MS)) return 'limited';
  const hash = (await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId])).rows[0]?.password_hash;
  return !!hash && (await bcrypt.compare(password, hash));
}

async function totpEnabled(userId: string): Promise<boolean> {
  const r = await pool.query('SELECT 1 FROM user_totp WHERE user_id = $1 AND enabled = TRUE', [userId]);
  return r.rows.length > 0;
}

async function hasTrustedDevice(userId: string, cookieHeader: string | undefined): Promise<boolean> {
  const device = readCookie(cookieHeader, DEVICE_COOKIE);
  if (!device) return false;
  const r = await pool.query(
    'UPDATE trusted_devices SET last_used = NOW() WHERE token_hash = $1 AND user_id = $2 AND expires_at > NOW() RETURNING 1',
    [sha256Hex(device), userId]
  );
  return r.rows.length > 0;
}

// Checks a TOTP code (single use: the step is recorded) or a recovery code (single use).
async function checkSecondFactor(userId: string, rawCode: string): Promise<boolean> {
  const code = rawCode.trim();
  if (/^\d{6}$/.test(code)) {
    const row = (await pool.query(
      'SELECT secret_enc, last_step FROM user_totp WHERE user_id = $1 AND enabled = TRUE', [userId]
    )).rows[0];
    if (!row) return false;
    const lastStep = row.last_step === null ? null : Number(row.last_step);
    const step = verifyTotp(decryptSecret(row.secret_enc), code, Date.now(), lastStep);
    if (step === null) return false;
    // Conditional update: two concurrent requests with the same code cannot both succeed.
    const used = await pool.query(
      'UPDATE user_totp SET last_step = $2 WHERE user_id = $1 AND (last_step IS NULL OR last_step < $2) RETURNING 1',
      [userId, step]
    );
    return used.rows.length === 1;
  }
  const recovery = normalizeRecoveryCode(code);
  if (!recovery) return false;
  const used = await pool.query(
    'UPDATE user_recovery_codes SET used_at = NOW() WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL RETURNING 1',
    [userId, sha256Hex(recovery)]
  );
  return used.rows.length === 1;
}

// POST /api/auth/login - Password check. With a second factor enabled and no trusted device,
// returns a challenge instead of a session.
router.post('/api/auth/login', async (req, res) => {
  const ip = req.ip || 'unknown';
  if (!checkRateLimit(`login:${ip}`, 5, LOGIN_WINDOW_MS)) {
    return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 30 minutes.' });
  }

  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });

  // Usernames are matched exactly (the lookup is case-sensitive), so the counter uses the same name.
  const { username, password } = parsed.data;
  const pairKey = `login-pair:${ip}:${username}`;
  if (isRateLimited(pairKey, LOGIN_PAIR_MAX_FAILURES)) {
    return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 30 minutes.' });
  }
  try {
    const result = await pool.query(
      'SELECT id, username, email, password_hash, theme, theme_schedule, role FROM users WHERE username = $1',
      [username]
    );
    const user = result.rows[0];
    // Always compared, so the response time does not reveal whether the username exists.
    const passwordMatch = await bcrypt.compare(password, user ? user.password_hash : DUMMY_PASSWORD_HASH);

    if (!user || !passwordMatch) {
      recordFailedAttempt(pairKey, LOGIN_WINDOW_MS);
      return res.status(401).json({ error: 'Username or password incorrect' });
    }
    clearRateLimit(pairKey);

    if (await totpEnabled(user.id) && !(await hasTrustedDevice(user.id, req.headers.cookie))) {
      const challenge = randomToken();
      // One open challenge per user: a new login replaces the previous one, so challenges cannot be
      // stockpiled to multiply the guesses allowed.
      await pool.query('DELETE FROM mfa_challenges WHERE user_id = $1', [user.id]);
      await pool.query(
        'INSERT INTO mfa_challenges (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
        [sha256Hex(challenge), user.id, new Date(Date.now() + MFA_CHALLENGE_TTL_MS)]
      );
      return res.json({ mfa_required: true, mfa_token: challenge });
    }

    res.json(sessionPayload(user, await createSession(user.id)));
  } catch (err: any) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// POST /api/auth/mfa/verify - Second step after a correct password. Accepts a TOTP code or a
// recovery code. The challenge allows MFA_MAX_ATTEMPTS tries; failures are also counted per user.
router.post('/api/auth/mfa/verify', async (req, res) => {
  const ip = req.ip || 'unknown';
  if (!checkRateLimit(`mfa-verify:${ip}`, 30, LOGIN_WINDOW_MS)) {
    return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 30 minutes.' });
  }
  const parsed = mfaVerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  const { mfa_token, code, remember } = parsed.data;

  try {
    const tokenHash = sha256Hex(mfa_token);
    const challenge = (await pool.query(
      'SELECT user_id FROM mfa_challenges WHERE token_hash = $1 AND expires_at > NOW()', [tokenHash]
    )).rows[0];
    if (!challenge) return res.status(401).json({ error: 'Vérification expirée, reconnectez-vous' });

    // Check and count in one synchronous step, before any await, so parallel requests cannot all
    // pass the check. A successful code clears the count below.
    const userKey = `mfa-user:${challenge.user_id}`;
    if (isRateLimited(userKey, MFA_USER_MAX_FAILURES)) {
      return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 30 minutes.' });
    }
    recordFailedAttempt(userKey, LOGIN_WINDOW_MS);

    // Count the attempt before checking it, so parallel guesses are counted too.
    const bumped = await pool.query(
      'UPDATE mfa_challenges SET attempts = attempts + 1 WHERE token_hash = $1 AND attempts < $2 RETURNING 1',
      [tokenHash, MFA_MAX_ATTEMPTS]
    );
    if (bumped.rows.length === 0) {
      await pool.query('DELETE FROM mfa_challenges WHERE token_hash = $1', [tokenHash]);
      return res.status(401).json({ error: 'Trop de tentatives, reconnectez-vous' });
    }

    if (!(await checkSecondFactor(challenge.user_id, code))) {
      return res.status(401).json({ error: 'Code incorrect' });
    }
    clearRateLimit(userKey);
    await pool.query('DELETE FROM mfa_challenges WHERE token_hash = $1', [tokenHash]);

    const user = (await pool.query(`SELECT ${USER_PUBLIC_COLUMNS} FROM users WHERE id = $1`, [challenge.user_id])).rows[0];
    const token = await createSession(challenge.user_id);
    const payload = sessionPayload(user, token);

    if (remember) {
      const device = randomToken();
      await pool.query(
        'INSERT INTO trusted_devices (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
        [sha256Hex(device), challenge.user_id, new Date(Date.now() + TRUSTED_DEVICE_TTL_MS)]
      );
      res.setHeader('Set-Cookie', deviceCookieHeader(device, Math.floor(TRUSTED_DEVICE_TTL_MS / 1000)));
    }
    res.json(payload);
  } catch (err: any) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// GET /api/auth/mfa - Status for the settings screen.
router.get('/api/auth/mfa', async (req, res) => {
  const userId = await sessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Non autorisé' });
  try {
    const enabled = await totpEnabled(userId);
    const left = enabled
      ? Number((await pool.query('SELECT COUNT(*)::int AS n FROM user_recovery_codes WHERE user_id = $1 AND used_at IS NULL', [userId])).rows[0].n)
      : 0;
    res.json({ enabled, recovery_codes_remaining: left });
  } catch (err: any) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// POST /api/auth/mfa/enroll - Starts an activation: a secret is stored, not yet enabled.
router.post('/api/auth/mfa/enroll', async (req, res) => {
  const userId = await sessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Non autorisé' });
  const parsed = mfaSetupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  const ok = await passwordOk(userId, parsed.data.password);
  if (ok === 'limited') return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 30 minutes.' });
  if (!ok) return res.status(401).json({ error: 'Mot de passe incorrect' });
  try {
    const username = (await pool.query('SELECT username FROM users WHERE id = $1', [userId])).rows[0]?.username;
    if (!username) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const secret = generateSecret();
    // Replaces a pending activation only; an enabled factor is never overwritten here.
    const r = await pool.query(
      `INSERT INTO user_totp (user_id, secret_enc, enabled, last_step) VALUES ($1, $2, FALSE, NULL)
       ON CONFLICT (user_id) DO UPDATE SET secret_enc = EXCLUDED.secret_enc, last_step = NULL
       WHERE user_totp.enabled = FALSE
       RETURNING 1`,
      [userId, encryptSecret(secret)]
    );
    if (r.rows.length === 0) return res.status(409).json({ error: 'Le second facteur est déjà activé' });
    res.json({ secret: base32Encode(secret), otpauth: otpauthUri(secret, username) });
  } catch (err: any) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// POST /api/auth/mfa/confirm - Proves the authenticator works, enables the factor and returns
// the recovery codes. They are shown once; only their hashes are stored.
router.post('/api/auth/mfa/confirm', async (req, res) => {
  const userId = await sessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Non autorisé' });
  const parsed = mfaSetupSchema.safeParse(req.body);
  if (!parsed.success || !parsed.data.code) return res.status(400).json({ error: 'Mot de passe et code requis' });
  const ok = await passwordOk(userId, parsed.data.password);
  if (ok === 'limited') return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 30 minutes.' });
  if (!ok) return res.status(401).json({ error: 'Mot de passe incorrect' });
  try {
    const pending = (await pool.query(
      'SELECT secret_enc FROM user_totp WHERE user_id = $1 AND enabled = FALSE', [userId]
    )).rows[0];
    if (!pending) return res.status(404).json({ error: 'Aucune activation en cours' });

    const step = verifyTotp(decryptSecret(pending.secret_enc), parsed.data.code.trim(), Date.now(), null);
    if (step === null) return res.status(401).json({ error: 'Code incorrect' });

    const enabled = await pool.query(
      'UPDATE user_totp SET enabled = TRUE, last_step = $2 WHERE user_id = $1 AND enabled = FALSE RETURNING 1',
      [userId, step]
    );
    if (enabled.rows.length === 0) return res.status(409).json({ error: 'Le second facteur est déjà activé' });
    // Sessions opened before the factor existed end now; the current one stays.
    await pool.query(
      'DELETE FROM sessions WHERE user_id = $1 AND token_hash != $2',
      [userId, hashTokenForStorage(req.headers.authorization!.replace('Bearer ', ''))]
    );

    const codes = generateRecoveryCodes();
    await pool.query('DELETE FROM user_recovery_codes WHERE user_id = $1', [userId]);
    await pool.query(
      'INSERT INTO user_recovery_codes (user_id, code_hash) SELECT $1, unnest($2::text[])',
      [userId, codes.hashes]
    );
    res.json({ recovery_codes: codes.display });
  } catch (err: any) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// DELETE /api/auth/mfa - Turns the second factor off. Needs the password and a current code.
router.delete('/api/auth/mfa', async (req, res) => {
  const userId = await sessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Non autorisé' });
  if (!checkRateLimit(passwordCheckKey(userId), PASSWORD_CHECKS_PER_WINDOW, LOGIN_WINDOW_MS)) {
    return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 30 minutes.' });
  }
  const parsed = mfaDisableSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  try {
    const hash = (await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId])).rows[0]?.password_hash;
    if (!hash || !(await bcrypt.compare(parsed.data.password, hash))) {
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }
    if (!(await totpEnabled(userId)) || !(await checkSecondFactor(userId, parsed.data.code))) {
      return res.status(401).json({ error: 'Code incorrect' });
    }
    await pool.query('DELETE FROM user_totp WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM user_recovery_codes WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM trusted_devices WHERE user_id = $1', [userId]);
    res.setHeader('Set-Cookie', clearDeviceCookieHeader());
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// POST /api/auth/logout - Logout (invalidate session)
router.post('/api/auth/logout', async (req, res) => {
  const header = req.headers.authorization;
  if (!header) return res.json({ message: 'Logged out' });

  const token = header.replace('Bearer ', '');
  try {
    const tokenHash = hashTokenForStorage(token);
    await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
    res.json({ message: 'Logged out' });
  } catch (err: any) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// POST /api/auth/verify-password - Verify password for lock screen
router.post('/api/auth/verify-password', async (req, res) => {
  const ip = req.ip || 'unknown';
  if (!checkRateLimit(`verify-password:${ip}`, 5, 30 * 60 * 1000)) {
    return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 30 minutes.' });
  }

  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token' });

  const token = header.replace('Bearer ', '');
  const parsed = z.object({ username: z.string().min(1), password: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Missing username or password' });

  try {
    // Get user from current session token
    const tokenHash = hashTokenForStorage(token);
    const sessionResult = await pool.query(
      'SELECT user_id FROM sessions WHERE token_hash = $1 AND (expires_at IS NULL OR expires_at > NOW())',
      [tokenHash]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(401).json({ error: 'Session expired' });
    }

    if (!checkRateLimit(passwordCheckKey(sessionResult.rows[0].user_id), PASSWORD_CHECKS_PER_WINDOW, LOGIN_WINDOW_MS)) {
      return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 30 minutes.' });
    }
    // Verify username and password matches user's stored credentials
    const userResult = await pool.query(
      'SELECT id, password_hash FROM users WHERE id = $1 AND username = $2',
      [sessionResult.rows[0].user_id, parsed.data.username]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Incorrect credentials' });
    }

    const passwordMatch = await bcrypt.compare(parsed.data.password, userResult.rows[0].password_hash);
    if (passwordMatch) {
      res.json({ success: true, message: 'Password verified' });
    } else {
      res.status(401).json({ error: 'Incorrect credentials' });
    }
  } catch (err: any) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// POST /api/auth/change-password - Change password for authenticated user
router.post('/api/auth/change-password', async (req, res) => {
  const ip = req.ip || 'unknown';
  if (!checkRateLimit(`change-password:${ip}`, 5, 30 * 60 * 1000)) {
    return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 30 minutes.' });
  }

  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Not authenticated' });

  const token = header.replace('Bearer ', '');
  const parsed = z.object({
    current_password: z.string().min(1),
    new_password: passwordSchema,
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });

  try {
    // Get user from current session token
    const tokenHash = hashTokenForStorage(token);
    const sessionResult = await pool.query(
      'SELECT user_id FROM sessions WHERE token_hash = $1 AND (expires_at IS NULL OR expires_at > NOW())',
      [tokenHash]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(401).json({ error: 'Session expired' });
    }

    const userId = sessionResult.rows[0].user_id;
    if (!checkRateLimit(passwordCheckKey(userId), PASSWORD_CHECKS_PER_WINDOW, LOGIN_WINDOW_MS)) {
      return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 30 minutes.' });
    }

    // Get current password hash
    const userResult = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Verify current password
    const isValid = await bcrypt.compare(parsed.data.current_password, userResult.rows[0].password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash and store new password
    const newHash = await bcrypt.hash(parsed.data.new_password, 10);
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [newHash, userId]
    );

    // Invalidate all sessions for this user except the current one
    await pool.query(
      'DELETE FROM sessions WHERE user_id = $1 AND token_hash != $2',
      [userId, tokenHash]
    );
    // A new password also ends every trusted device and any pending second-factor challenge.
    await pool.query('DELETE FROM trusted_devices WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM mfa_challenges WHERE user_id = $1', [userId]);

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err: any) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// GET /api/auth/theme - Get user theme preferences
router.get('/api/auth/theme', async (req, res) => {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token' });

  const token = header.replace('Bearer ', '');
  try {
    const tokenHash = hashTokenForStorage(token);
    const sessionResult = await pool.query(
      'SELECT user_id FROM sessions WHERE token_hash = $1 AND (expires_at IS NULL OR expires_at > NOW())',
      [tokenHash]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(401).json({ error: 'Session expired' });
    }

    const userId = sessionResult.rows[0].user_id;
    const userResult = await pool.query(
      'SELECT theme, theme_schedule FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    res.json({
      theme: user.theme || 'light',
      themeSchedule: user.theme_schedule || { enabled: false, darkHours: Array.from({ length: 24 }, (_, h) => h >= 20 || h < 7) }
    });
  } catch (err: any) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// PATCH /api/auth/theme - Update user theme preferences
router.patch('/api/auth/theme', async (req, res) => {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token' });

  const themeSchema = z.object({
    theme: z.enum(['light', 'dark']).optional(),
    themeSchedule: themeScheduleSchema.optional(),
  });

  const parsed = themeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });

  const token = header.replace('Bearer ', '');
  try {
    const tokenHash = hashTokenForStorage(token);
    const sessionResult = await pool.query(
      'SELECT user_id FROM sessions WHERE token_hash = $1 AND (expires_at IS NULL OR expires_at > NOW())',
      [tokenHash]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(401).json({ error: 'Session expired' });
    }

    const userId = sessionResult.rows[0].user_id;
    const { theme, themeSchedule } = parsed.data;

    let updateQuery = 'UPDATE users SET';
    const updateParams: any[] = [];
    const updateFields: string[] = [];

    if (theme !== undefined) {
      updateFields.push(`theme = $${updateFields.length + 1}`);
      updateParams.push(theme);
    }

    if (themeSchedule !== undefined) {
      updateFields.push(`theme_schedule = $${updateFields.length + 1}`);
      updateParams.push(JSON.stringify(themeSchedule));
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateQuery += ' ' + updateFields.join(', ') + ` WHERE id = $${updateFields.length + 1}`;
    updateParams.push(userId);

    await pool.query(updateQuery, updateParams);

    res.json({ success: true, theme, themeSchedule });
  } catch (err: any) {
    res.status(500).json({ error: errMsg(err) });
  }
});

export default router;
