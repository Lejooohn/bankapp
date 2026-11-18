// End-to-end second-factor flow through the real app. The database is an in-memory stand-in
// that honours the SQL shapes used by routes/auth.ts (conditional updates, expiry, uniqueness).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

vi.mock('../db.js', async () => {
  const h = await import('../../test/harness.js');
  return { default: h.fakeDb.pool, initDB: async () => {} };
});

import { app } from '../index.js';
import { fakeDb, withServer, jsonRequest } from '../../test/harness.js';
import { base32Decode, hotp, timeStep } from '../services/totp.js';
import { normalizeRecoveryCode, sha256Hex } from '../services/mfa.js';

const PASSWORD = 'Correct-Password-123';
const hashed = bcrypt.hashSync(PASSWORD, 4);

type Row = Record<string, any>;
let users: Map<string, Row>;
let sessions: Map<string, string>;       // token_hash -> user_id
let totp: Map<string, Row>;              // user_id -> {secret_enc, enabled, last_step}
let recovery: Array<{ user_id: string; code_hash: string; used_at: Date | null }>;
let challenges: Map<string, Row>;        // token_hash -> {user_id, expires_at, attempts}
let devices: Map<string, Row>;           // token_hash -> {user_id, expires_at}

function reset() {
  users = new Map(); sessions = new Map(); totp = new Map(); recovery = []; challenges = new Map(); devices = new Map();
}

function addUser(name: string, role = 'user'): string {
  const id = `id-${name}-${crypto.randomBytes(4).toString('hex')}`;
  users.set(id, { id, username: name, email: null, password_hash: hashed, theme: 'light', theme_schedule: null, role });
  return id;
}

// Emulates the SQL the MFA routes issue. Returns undefined for anything else (falls back to defaults).
function emulate(sql: string, p: any[]): { rows: Row[] } | undefined {
  const now = Date.now();
  if (sql.includes('FROM users WHERE username')) {
    const u = [...users.values()].find(x => x.username === p[0]);
    return { rows: u ? [u] : [] };
  }
  if (sql.includes('FROM users WHERE id')) {
    const u = users.get(p[0]);
    return { rows: u ? [u] : [] };
  }
  if (sql.includes('UPDATE users SET password_hash')) {
    const u = users.get(p[p.length - 1]);
    if (!u) return { rows: [] };
    u.password_hash = p[0];
    return { rows: [{ id: u.id }] };
  }
  if (sql.includes('DELETE FROM sessions WHERE user_id = $1 AND token_hash != $2')) {
    for (const [hash, user] of sessions) if (user === p[0] && hash !== p[1]) sessions.delete(hash);
    return { rows: [] };
  }
  if (sql.includes('INSERT INTO sessions')) {
    sessions.set(p[1], p[0]);
    return { rows: [] };
  }
  if (sql.includes('FROM sessions WHERE token_hash')) {
    const user = sessions.get(p[0]);
    return { rows: user ? [{ user_id: user }] : [] };
  }
  // Second factor state
  if (sql.includes('SELECT 1 FROM user_totp WHERE user_id = $1 AND enabled = TRUE')) {
    return { rows: totp.get(p[0])?.enabled ? [{ '?column?': 1 }] : [] };
  }
  if (sql.includes('UPDATE trusted_devices SET last_used')) {
    const d = devices.get(p[0]);
    return d && d.user_id === p[1] && d.expires_at > now ? { rows: [{ '?column?': 1 }] } : { rows: [] };
  }
  if (sql.includes('INSERT INTO mfa_challenges')) {
    challenges.set(p[0], { user_id: p[1], expires_at: p[2].getTime(), attempts: 0 });
    return { rows: [] };
  }
  if (sql.includes('SELECT user_id FROM mfa_challenges')) {
    const c = challenges.get(p[0]);
    return c && c.expires_at > now ? { rows: [{ user_id: c.user_id }] } : { rows: [] };
  }
  if (sql.includes('UPDATE mfa_challenges SET attempts')) {
    const c = challenges.get(p[0]);
    if (c && c.attempts < p[1]) { c.attempts++; return { rows: [{ '?column?': 1 }] }; }
    return { rows: [] };
  }
  if (sql.includes('DELETE FROM mfa_challenges WHERE user_id')) {
    for (const [k, c] of challenges) if (c.user_id === p[0]) challenges.delete(k);
    return { rows: [] };
  }
  if (sql.includes('DELETE FROM mfa_challenges')) { challenges.delete(p[0]); return { rows: [] }; }
  if (sql.includes('INSERT INTO trusted_devices')) {
    devices.set(p[0], { user_id: p[1], expires_at: p[2].getTime() });
    return { rows: [] };
  }
  if (sql.includes('DELETE FROM trusted_devices')) {
    for (const [k, d] of devices) if (d.user_id === p[0]) devices.delete(k);
    return { rows: [] };
  }
  if (sql.includes('INSERT INTO user_totp')) {
    const existing = totp.get(p[0]);
    if (existing?.enabled) return { rows: [] }; // ON CONFLICT ... WHERE enabled = FALSE
    totp.set(p[0], { secret_enc: p[1], enabled: false, last_step: null });
    return { rows: [{ '?column?': 1 }] };
  }
  if (sql.includes('SELECT secret_enc FROM user_totp WHERE user_id = $1 AND enabled = FALSE')) {
    const row = totp.get(p[0]);
    return row && !row.enabled ? { rows: [{ secret_enc: row.secret_enc }] } : { rows: [] };
  }
  if (sql.includes('SELECT secret_enc, last_step FROM user_totp')) {
    const row = totp.get(p[0]);
    return row?.enabled ? { rows: [{ secret_enc: row.secret_enc, last_step: row.last_step }] } : { rows: [] };
  }
  if (sql.includes('UPDATE user_totp SET last_step = $2')) {
    const row = totp.get(p[0]);
    if (row?.enabled && (row.last_step === null || row.last_step < p[1])) {
      row.last_step = p[1];
      return { rows: [{ '?column?': 1 }] };
    }
    return { rows: [] };
  }
  if (sql.includes('UPDATE user_totp SET enabled = TRUE')) {
    const row = totp.get(p[0]);
    if (row && !row.enabled) { row.enabled = true; row.last_step = p[1]; return { rows: [{ '?column?': 1 }] }; }
    return { rows: [] };
  }
  if (sql.includes('DELETE FROM user_totp')) { totp.delete(p[0]); return { rows: [] }; }
  if (sql.includes('DELETE FROM user_recovery_codes')) {
    recovery = recovery.filter(r => r.user_id !== p[0]);
    return { rows: [] };
  }
  if (sql.includes('INSERT INTO user_recovery_codes')) {
    for (const h of p[1] as string[]) recovery.push({ user_id: p[0], code_hash: h, used_at: null });
    return { rows: [] };
  }
  if (sql.includes('UPDATE user_recovery_codes SET used_at')) {
    const r = recovery.find(x => x.user_id === p[0] && x.code_hash === p[1] && x.used_at === null);
    if (r) { r.used_at = new Date(); return { rows: [{ '?column?': 1 }] }; }
    return { rows: [] };
  }
  if (sql.includes('COUNT(*)::int AS n FROM user_recovery_codes')) {
    return { rows: [{ n: recovery.filter(r => r.user_id === p[0] && r.used_at === null).length }] };
  }
  return undefined;
}

beforeEach(() => {
  reset();
  fakeDb.reset();
  fakeDb.setHandler(emulate);
});
afterEach(() => { vi.unstubAllEnvs(); });

// Each call gets its own client address: the per-IP login limit would otherwise be shared
// by every test in this file.
function randomIp(): string {
  const b = crypto.randomBytes(3);
  return `10.${b[0]}.${b[1]}.${b[2]}`;
}

async function login(base: string, username: string, headers: Record<string, string> = {}) {
  const h = { 'X-Forwarded-For': randomIp(), ...headers };
  return jsonRequest(base, '/api/auth/login', { method: 'POST', headers: h, body: { username, password: PASSWORD } });
}

// The code for the next 30-second step. Enrolment consumes the current step, and a real user
// logs in later, so the second-factor tests use the step after it.
function nextCode(secret: Buffer): string {
  return hotp(secret, timeStep(Date.now()) + 1);
}

// Enrols a user through the API and returns their session token and recovery codes.
async function enrol(base: string, username: string) {
  const session = (await (await login(base, username)).json()) as any;
  const auth = { Authorization: `Bearer ${session.token}` };
  const enr = (await (await jsonRequest(base, '/api/auth/mfa/enroll', { method: 'POST', headers: auth, body: { password: PASSWORD } })).json()) as any;
  const secret = base32Decode(enr.secret);
  const code = hotp(secret, timeStep(Date.now()));
  const conf = await jsonRequest(base, '/api/auth/mfa/confirm', { method: 'POST', headers: auth, body: { password: PASSWORD, code } });
  const confJson = (await conf.json()) as any;
  return { token: session.token as string, auth, secret, recoveryCodes: confJson.recovery_codes as string[], confirmStatus: conf.status };
}

describe('second factor: enrolment is voluntary', () => {
  it('a user who never enrolled gets a session straight from the password', async () => {
    addUser('plain');
    await withServer(app, async (base) => {
      const res = await login(base, 'plain');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.token).toBeTruthy();
      expect(body.mfa_required).toBeUndefined();
    });
  });

  it('enrolment returns the secret, confirmation enables it and issues ten recovery codes', async () => {
    addUser('enrol1');
    await withServer(app, async (base) => {
      const e = await enrol(base, 'enrol1');
      expect(e.confirmStatus).toBe(200);
      expect(e.recoveryCodes).toHaveLength(10);
      const status = (await (await jsonRequest(base, '/api/auth/mfa', { headers: e.auth })).json()) as any;
      expect(status).toEqual({ enabled: true, recovery_codes_remaining: 10 });
    });
  });

  it('refuses to start a second enrolment once the factor is enabled', async () => {
    addUser('enrol2');
    await withServer(app, async (base) => {
      const e = await enrol(base, 'enrol2');
      const again = await jsonRequest(base, '/api/auth/mfa/enroll', { method: 'POST', headers: e.auth, body: { password: PASSWORD } });
      expect(again.status).toBe(409);
    });
  });
});

describe('one password budget per user', () => {
  it('password checks on different endpoints draw from the same budget', async () => {
    addUser('budget1');
    await withServer(app, async (base) => {
      const token = ((await (await login(base, 'budget1')).json()) as any).token;
      const auth = { Authorization: `Bearer ${token}` };
      const statuses: number[] = [];
      for (let i = 0; i < 3; i++) {
        statuses.push((await jsonRequest(base, '/api/auth/change-password', { method: 'POST', headers: auth, body: { current_password: 'wrong-password-123', new_password: 'New-Password-456' } })).status);
        statuses.push((await jsonRequest(base, '/api/auth/mfa/enroll', { method: 'POST', headers: auth, body: { password: 'wrong-password-123' } })).status);
      }
      expect(statuses.slice(0, 5).every(x => x === 401)).toBe(true);
      expect(statuses[5]).toBe(429);
    });
  });
});

describe('re-authentication for enrolment', () => {
  it('enrolment needs the password, not just a session', async () => {
    addUser('re1');
    await withServer(app, async (base) => {
      const token = ((await (await login(base, 're1')).json()) as any).token;
      const auth = { Authorization: `Bearer ${token}` };
      const none = await jsonRequest(base, '/api/auth/mfa/enroll', { method: 'POST', headers: auth, body: {} });
      expect(none.status).toBe(400);
      const wrong = await jsonRequest(base, '/api/auth/mfa/enroll', { method: 'POST', headers: auth, body: { password: 'wrong-password-123' } });
      expect(wrong.status).toBe(401);
      const ok = await jsonRequest(base, '/api/auth/mfa/enroll', { method: 'POST', headers: auth, body: { password: PASSWORD } });
      expect(ok.status).toBe(200);
    });
  });

  it('password re-checks are capped per user', async () => {
    addUser('re2');
    await withServer(app, async (base) => {
      const token = ((await (await login(base, 're2')).json()) as any).token;
      const auth = { Authorization: `Bearer ${token}` };
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) {
        statuses.push((await jsonRequest(base, '/api/auth/mfa/enroll', { method: 'POST', headers: auth, body: { password: 'wrong-password-123' } })).status);
      }
      expect(statuses.slice(0, 5).every(x => x === 401)).toBe(true);
      expect(statuses[5]).toBe(429);
    });
  });

  it('confirming the factor ends other sessions of that user', async () => {
    addUser('re3');
    await withServer(app, async (base) => {
      const other = ((await (await login(base, 're3')).json()) as any).token;
      const e = await enrol(base, 're3');
      const otherStatus = await jsonRequest(base, '/api/auth/mfa', { headers: { Authorization: `Bearer ${other}` } });
      expect(otherStatus.status).toBe(401);
      const current = await jsonRequest(base, '/api/auth/mfa', { headers: e.auth });
      expect(current.status).toBe(200);
    });
  });

  it('confirmation with the wrong password is refused', async () => {
    addUser('re4');
    await withServer(app, async (base) => {
      const token = ((await (await login(base, 're4')).json()) as any).token;
      const auth = { Authorization: `Bearer ${token}` };
      const enr = (await (await jsonRequest(base, '/api/auth/mfa/enroll', { method: 'POST', headers: auth, body: { password: PASSWORD } })).json()) as any;
      const code = hotp(base32Decode(enr.secret), timeStep(Date.now()));
      const res = await jsonRequest(base, '/api/auth/mfa/confirm', { method: 'POST', headers: auth, body: { password: 'wrong-password-123', code } });
      expect(res.status).toBe(401);
    });
  });
});

describe('second factor at login', () => {
  it('with the factor enabled, the password alone returns a challenge and no session', async () => {
    addUser('step1');
    await withServer(app, async (base) => {
      await enrol(base, 'step1');
      const sessionsBefore = sessions.size;
      const res = await login(base, 'step1', { 'X-Forwarded-For': '10.70.0.1' });
      const body = (await res.json()) as any;
      expect(res.status).toBe(200);
      expect(body.mfa_required).toBe(true);
      expect(body.mfa_token).toMatch(/^[a-f0-9]{64}$/);
      expect(body.token).toBeUndefined();
      expect(sessions.size).toBe(sessionsBefore);
    });
  });

  it('a correct code completes the login and a repeat of that same code is refused', async () => {
    addUser('step2');
    await withServer(app, async (base) => {
      const e = await enrol(base, 'step2');
      const first = (await (await login(base, 'step2', { 'X-Forwarded-For': '10.71.0.1' })).json()) as any;
      const code = nextCode(e.secret);
      const ok = await jsonRequest(base, '/api/auth/mfa/verify', { method: 'POST', body: { mfa_token: first.mfa_token, code } });
      expect(ok.status).toBe(200);
      expect(((await ok.json()) as any).token).toBeTruthy();

      // The same code on a fresh challenge: already used, so refused.
      const second = (await (await login(base, 'step2', { 'X-Forwarded-For': '10.71.0.2' })).json()) as any;
      const replay = await jsonRequest(base, '/api/auth/mfa/verify', { method: 'POST', body: { mfa_token: second.mfa_token, code } });
      expect(replay.status).toBe(401);
    });
  });

  it('a challenge allows five attempts, then it is gone', async () => {
    addUser('step3');
    await withServer(app, async (base) => {
      const e = await enrol(base, 'step3');
      const c = (await (await login(base, 'step3', { 'X-Forwarded-For': '10.72.0.1' })).json()) as any;
      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) {
        statuses.push((await jsonRequest(base, '/api/auth/mfa/verify', { method: 'POST', body: { mfa_token: c.mfa_token, code: '000000' } })).status);
      }
      expect(statuses).toEqual([401, 401, 401, 401, 401]);
      // The correct code no longer helps: the challenge has run out of attempts.
      const right = await jsonRequest(base, '/api/auth/mfa/verify', { method: 'POST', body: { mfa_token: c.mfa_token, code: nextCode(e.secret) } });
      expect(right.status).toBe(401);
    });
  });

  it('an unknown or expired challenge is refused', async () => {
    addUser('step4');
    await withServer(app, async (base) => {
      const res = await jsonRequest(base, '/api/auth/mfa/verify', { method: 'POST', body: { mfa_token: 'f'.repeat(64), code: '123456' } });
      expect(res.status).toBe(401);
    });
  });

  it('a recovery code works once', async () => {
    addUser('step5');
    await withServer(app, async (base) => {
      const e = await enrol(base, 'step5');
      const c1 = (await (await login(base, 'step5', { 'X-Forwarded-For': '10.73.0.1' })).json()) as any;
      const ok = await jsonRequest(base, '/api/auth/mfa/verify', { method: 'POST', body: { mfa_token: c1.mfa_token, code: e.recoveryCodes[0].toLowerCase() } });
      expect(ok.status).toBe(200);
      const c2 = (await (await login(base, 'step5', { 'X-Forwarded-For': '10.73.0.2' })).json()) as any;
      const again = await jsonRequest(base, '/api/auth/mfa/verify', { method: 'POST', body: { mfa_token: c2.mfa_token, code: e.recoveryCodes[0] } });
      expect(again.status).toBe(401);
      const status = (await (await jsonRequest(base, '/api/auth/mfa', { headers: e.auth })).json()) as any;
      expect(status.recovery_codes_remaining).toBe(9);
    });
  });
});

describe('trusted device', () => {
  it('"remember this device" sets an HttpOnly cookie and skips the second step next time', async () => {
    addUser('dev1');
    await withServer(app, async (base) => {
      const e = await enrol(base, 'dev1');
      const c = (await (await login(base, 'dev1', { 'X-Forwarded-For': '10.74.0.1' })).json()) as any;
      const ok = await jsonRequest(base, '/api/auth/mfa/verify', {
        method: 'POST', body: { mfa_token: c.mfa_token, code: nextCode(e.secret), remember: true },
      });
      expect(ok.status).toBe(200);
      const setCookie = ok.headers.get('set-cookie') ?? '';
      expect(setCookie).toMatch(/^bk_device=[a-f0-9]{64};/);
      for (const attr of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/api/auth', 'Max-Age=1728000']) {
        expect(setCookie).toContain(attr);
      }
      const cookie = setCookie.split(';')[0];

      // Same device: straight to a session.
      const next = await login(base, 'dev1', { Cookie: cookie, 'X-Forwarded-For': '10.74.0.9' });
      const body = (await next.json()) as any;
      expect(body.token).toBeTruthy();
      expect(body.mfa_required).toBeUndefined();

      // Another client without the cookie still gets the challenge.
      const other = (await (await login(base, 'dev1', { 'X-Forwarded-For': '10.74.0.10' })).json()) as any;
      expect(other.mfa_required).toBe(true);
    });
  });

  it('without "remember" no device cookie is set', async () => {
    addUser('dev2');
    await withServer(app, async (base) => {
      const e = await enrol(base, 'dev2');
      const c = (await (await login(base, 'dev2', { 'X-Forwarded-For': '10.75.0.1' })).json()) as any;
      const ok = await jsonRequest(base, '/api/auth/mfa/verify', { method: 'POST', body: { mfa_token: c.mfa_token, code: nextCode(e.secret) } });
      expect(ok.headers.get('set-cookie')).toBeNull();
    });
  });

  it('a device cookie issued to one user does not skip the factor of another user', async () => {
    addUser('dev3a');
    addUser('dev3b');
    await withServer(app, async (base) => {
      const ea = await enrol(base, 'dev3a');
      const eb = await enrol(base, 'dev3b');
      const c = (await (await login(base, 'dev3a', { 'X-Forwarded-For': '10.76.0.1' })).json()) as any;
      const ok = await jsonRequest(base, '/api/auth/mfa/verify', { method: 'POST', body: { mfa_token: c.mfa_token, code: nextCode(ea.secret), remember: true } });
      const cookie = (ok.headers.get('set-cookie') ?? '').split(';')[0];
      expect(cookie).toMatch(/^bk_device=/);

      // dev3b presents dev3a's cookie: the device is not theirs, so the challenge is still required.
      const res = (await (await login(base, 'dev3b', { Cookie: cookie })).json()) as any;
      expect(res.mfa_required).toBe(true);
      expect(res.token).toBeUndefined();
      expect(eb.secret).toBeTruthy();
    });
  });
});

describe('pending challenges end with a reset', () => {
  it('an admin reset ends a challenge that was already issued', async () => {
    const targetId = addUser('ch1');
    addUser('boss3', 'admin');
    await withServer(app, async (base) => {
      const e = await enrol(base, 'ch1');
      const pending = ((await (await login(base, 'ch1')).json()) as any).mfa_token;
      const adminToken = ((await (await login(base, 'boss3')).json()) as any).token;
      const reset = await jsonRequest(base, `/api/admin/users/${targetId}/mfa/reset`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` } });
      expect(reset.status).toBe(200);
      const late = await jsonRequest(base, '/api/auth/mfa/verify', { method: 'POST', body: { mfa_token: pending, code: nextCode(e.secret) } });
      expect(late.status).toBe(401);
    });
  });
});

describe('disabling and resetting the factor', () => {
  it('disabling needs the password and a current code', async () => {
    addUser('off1');
    await withServer(app, async (base) => {
      const e = await enrol(base, 'off1');
      const wrong = await jsonRequest(base, '/api/auth/mfa', { method: 'DELETE', headers: e.auth, body: { password: 'nope-nope-nope', code: '000000' } });
      expect(wrong.status).toBe(401);
      const far = await jsonRequest(base, '/api/auth/mfa', { method: 'DELETE', headers: e.auth, body: { password: PASSWORD, code: hotp(e.secret, timeStep(Date.now()) + 2) } });
      expect(far.status).toBe(401); // two steps ahead is outside the window
      const ok = await jsonRequest(base, '/api/auth/mfa', { method: 'DELETE', headers: e.auth, body: { password: PASSWORD, code: nextCode(e.secret) } });
      expect(ok.status).toBe(200);
      const next = (await (await login(base, 'off1')).json()) as any;
      expect(next.token).toBeTruthy();
      expect(next.mfa_required).toBeUndefined();
    });
  });

  it('an admin reset removes the factor; a non-admin cannot reset anyone', async () => {
    const lostId = addUser('lost1');
    addUser('boss', 'admin');
    await withServer(app, async (base) => {
      await enrol(base, 'lost1');
      const adminToken = ((await (await login(base, 'boss')).json()) as any).token;
      const lostToken = ((await (await login(base, 'lost1')).json()) as any).token;
      expect(lostToken).toBeFalsy(); // the factor is enabled, so this is a challenge, not a session

      const asUser = await jsonRequest(base, `/api/admin/users/${lostId}/mfa/reset`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` } });
      expect(asUser.status).toBe(200);

      const after = (await (await login(base, 'lost1')).json()) as any;
      expect(after.token).toBeTruthy();
      expect(after.mfa_required).toBeUndefined();
    });
  });

  it('a non-admin session gets 403 on the reset route', async () => {
    const targetId = addUser('target1');
    addUser('plainuser');
    await withServer(app, async (base) => {
      const token = ((await (await login(base, 'plainuser')).json()) as any).token;
      const res = await jsonRequest(base, `/api/admin/users/${targetId}/mfa/reset`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      expect(res.status).toBe(403);
    });
  });
});

describe('trusted devices end with a password change', () => {
  const NEW_PASSWORD = 'New-Password-456';

  it('a self-service password change revokes trusted devices', async () => {
    addUser('pw1');
    await withServer(app, async (base) => {
      const e = await enrol(base, 'pw1');
      const c = (await (await login(base, 'pw1')).json()) as any;
      const ok = await jsonRequest(base, '/api/auth/mfa/verify', { method: 'POST', body: { mfa_token: c.mfa_token, code: nextCode(e.secret), remember: true } });
      const cookie = (ok.headers.get('set-cookie') ?? '').split(';')[0];
      expect(cookie).toMatch(/^bk_device=/);

      const change = await jsonRequest(base, '/api/auth/change-password', {
        method: 'POST', headers: e.auth, body: { current_password: PASSWORD, new_password: NEW_PASSWORD },
      });
      expect(change.status).toBe(200);

      const again = (await (await jsonRequest(base, '/api/auth/login', {
        method: 'POST', headers: { Cookie: cookie, 'X-Forwarded-For': randomIp() }, body: { username: 'pw1', password: NEW_PASSWORD },
      })).json()) as any;
      expect(again.mfa_required).toBe(true);
    });
  });

  it('an admin password reset revokes trusted devices', async () => {
    const targetId = addUser('pw2');
    addUser('boss2', 'admin');
    await withServer(app, async (base) => {
      const e = await enrol(base, 'pw2');
      const c = (await (await login(base, 'pw2')).json()) as any;
      const ok = await jsonRequest(base, '/api/auth/mfa/verify', { method: 'POST', body: { mfa_token: c.mfa_token, code: nextCode(e.secret), remember: true } });
      const cookie = (ok.headers.get('set-cookie') ?? '').split(';')[0];

      const adminToken = ((await (await login(base, 'boss2')).json()) as any).token;
      const reset = await jsonRequest(base, `/api/admin/users/${targetId}/password`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}` }, body: { password: NEW_PASSWORD },
      });
      expect(reset.status).toBe(200);

      const after = (await (await jsonRequest(base, '/api/auth/login', {
        method: 'POST', headers: { Cookie: cookie, 'X-Forwarded-For': randomIp() }, body: { username: 'pw2', password: NEW_PASSWORD },
      })).json()) as any;
      expect(after.mfa_required).toBe(true);
    });
  });
});

describe('second-factor guessing limit per user', () => {
  it('a new login replaces the open challenge, so challenges cannot be stockpiled', async () => {
    addUser('one1');
    await withServer(app, async (base) => {
      const e = await enrol(base, 'one1');
      const first = (await (await login(base, 'one1')).json()) as any;
      const second = (await (await login(base, 'one1')).json()) as any;
      expect(first.mfa_token).not.toBe(second.mfa_token);
      const stale = await jsonRequest(base, '/api/auth/mfa/verify', { method: 'POST', body: { mfa_token: first.mfa_token, code: nextCode(e.secret) } });
      expect(stale.status).toBe(401);
      const fresh = await jsonRequest(base, '/api/auth/mfa/verify', { method: 'POST', body: { mfa_token: second.mfa_token, code: nextCode(e.secret) } });
      expect(fresh.status).toBe(200);
    });
  });

  it('after ten wrong codes across challenges, checks for that user pause', async () => {
    addUser('guess1');
    await withServer(app, async (base) => {
      await enrol(base, 'guess1');
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) {
        const c = (await (await login(base, 'guess1')).json()) as any;
        const res = await jsonRequest(base, '/api/auth/mfa/verify', { method: 'POST', body: { mfa_token: c.mfa_token, code: '000000' } });
        statuses.push(res.status);
      }
      expect(statuses.slice(0, 10).every(s => s === 401)).toBe(true);
      expect(statuses[10]).toBe(429);
    });
  });
});

describe('second-factor secrets at rest', () => {
  it('the stored secret is encrypted, not the base32 secret', async () => {
    addUser('rest1');
    await withServer(app, async (base) => {
      const e = await enrol(base, 'rest1');
      const row = [...totp.values()][0];
      expect(row.secret_enc).not.toContain(e.secret.toString('base64'));
      expect(row.secret_enc).not.toContain(e.secret.toString('hex'));
    });
  });

  it('recovery codes are stored only as hashes of their normalised form', async () => {
    addUser('rest2');
    await withServer(app, async (base) => {
      const e = await enrol(base, 'rest2');
      const stored = recovery.map(r => r.code_hash);
      expect(stored).toHaveLength(10);
      for (const plain of e.recoveryCodes) {
        expect(stored).not.toContain(plain);
        expect(stored).toContain(sha256Hex(normalizeRecoveryCode(plain)!));
      }
    });
  });
});
