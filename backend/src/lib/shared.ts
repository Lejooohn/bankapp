// Helpers shared by the route modules (auth, rate limiting, ownership checks, rule matching).

import express from 'express';
import crypto from 'crypto';
import pool from '../db.js';

// Rate limiting for auth endpoints (in-memory, per process)
export const rateLimitMap = new Map<string, { attempts: number; resetTime: number }>();

// Upper bound on tracked keys: past this, expired windows are purged so an attacker
// rotating IPs/usernames can't grow the map without limit.
const RATE_LIMIT_MAX_KEYS = 10_000;

function purgeExpiredRateLimits(now: number): void {
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetTime) rateLimitMap.delete(key);
  }
}

export function checkRateLimit(key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now();
  if (rateLimitMap.size >= RATE_LIMIT_MAX_KEYS) purgeExpiredRateLimits(now);
  const limit = rateLimitMap.get(key);
  if (!limit || now > limit.resetTime) {
    rateLimitMap.set(key, { attempts: 1, resetTime: now + windowMs });
    return true;
  }
  if (limit.attempts >= maxAttempts) return false;
  limit.attempts++;
  return true;
}

// Hash token with SHA256 for deterministic storage and verification
export function hashTokenForStorage(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Create a new session token (cryptographically secure)
export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// ── Admin: User management ──────────────────────────────────────────────────

export function requireAdmin(req: express.Request, res: express.Response): boolean {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Réservé aux administrateurs' });
    return false;
  }
  return true;
}

// Return err.message in dev, opaque message in production
export function errMsg(err: any): string {
  return process.env.NODE_ENV === 'production' ? 'Erreur interne' : err.message;
}

// Normalize string for accent-insensitive search
export function normalizeString(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Check if user owns an account
export async function checkAccountOwnership(accountId: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    'SELECT id FROM accounts WHERE id = $1 AND user_id = $2',
    [accountId, userId]
  );
  return result.rows.length > 0;
}

// Savings accounts can only be credited/debited through the transfer endpoint, never through
// manual entry or CSV import — their only legitimate source of movement is a transfer from a checking account.
export async function isSavingsAccount(accountId: string): Promise<boolean> {
  const result = await pool.query('SELECT account_type FROM accounts WHERE id = $1', [accountId]);
  return result.rows[0]?.account_type === 'savings';
}

// Build SQL condition for rule matching (tiers_pattern + optional details_pattern, both pipe-delimited)
export function buildRuleMatchCondition(
  tiersPattern: string | null | undefined,
  detailsPattern: string | null | undefined,
  paramOffset: number
): { sql: string; params: string[] } {
  const params: string[] = [];
  let paramIdx = paramOffset;

  let sql = '';

  // Process tiers pattern (pipe-delimited: multiple tiers with OR)
  if (tiersPattern) {
    const tiersParts = tiersPattern
      .split('|')
      .map((p: string) => normalizeString(p))
      .filter(Boolean);

    if (tiersParts.length > 0) {
      const tiersConditions = tiersParts
        .map((_, i: number) => `immutable_unaccent(LOWER(tiers)) LIKE '%' || $${paramIdx + i} || '%'`)
        .join(' OR ');
      sql = tiersParts.length > 1 ? `(${tiersConditions})` : tiersConditions;
      params.push(...tiersParts);
      paramIdx += tiersParts.length;
    }
  }

  // Process details pattern (pipe-delimited: multiple details with OR)
  if (detailsPattern) {
    const detailsParts = detailsPattern
      .split('|')
      .map((p: string) => normalizeString(p))
      .filter(Boolean);
    if (detailsParts.length > 0) {
      const detailsConditions = detailsParts
        .map((_, i: number) => `immutable_unaccent(LOWER(COALESCE(details,''))) LIKE '%' || $${paramIdx + i} || '%'`)
        .join(' OR ');
      sql += sql ? ` AND (${detailsConditions})` : `(${detailsConditions})`;
      params.push(...detailsParts);
    }
  }

  return { sql, params };
}

// Merge patterns with deduplication (pipe-delimited)
export function mergePatterns(existing: string | null, newValue: string | null): string | null {
  if (!existing && !newValue) return null;
  const parts = new Set<string>();
  if (existing) {
    existing.split('|').forEach(p => {
      const normalized = p.trim();
      if (normalized) parts.add(normalized);
    });
  }
  if (newValue) {
    newValue.split('|').forEach(p => {
      const normalized = p.trim();
      if (normalized) parts.add(normalized);
    });
  }
  return parts.size > 0 ? Array.from(parts).join('|') : null;
}

// Which of these account ids belong to the user. Used before writing into a transfer target:
// schedules created before the ownership check may still point at another user's account.
export async function ownedAccountIds(ids: (string | null | undefined)[], userId: string): Promise<Set<string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Set();
  const result = await pool.query(
    'SELECT id FROM accounts WHERE id = ANY($1::uuid[]) AND user_id = $2',
    [unique, userId]
  );
  return new Set(result.rows.map((r: any) => r.id));
}

// Failure-only counters: record a failed attempt, check the count without incrementing,
// and clear it on success. Used where successful logins must not count against the limit.
export function recordFailedAttempt(key: string, windowMs: number): void {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(key, { attempts: 1, resetTime: now + windowMs });
  } else {
    entry.attempts++;
  }
}

export function isRateLimited(key: string, maxFailures: number): boolean {
  const entry = rateLimitMap.get(key);
  return !!entry && Date.now() <= entry.resetTime && entry.attempts >= maxFailures;
}

export function clearRateLimit(key: string): void {
  rateLimitMap.delete(key);
}

