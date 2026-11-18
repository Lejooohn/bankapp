// Non-regression guards for the first-start account handling in db.ts: no personal username is
// hard-coded, and the default development account is created only when explicitly requested.
import { describe, it, expect } from 'vitest';
import fs from 'fs';

const db = fs.readFileSync(new URL('../db.ts', import.meta.url), 'utf8');

describe('first-start accounts (db.ts)', () => {
  it('promotes the admin named by BOOTSTRAP_ADMIN_USERNAME, not a hard-coded username', () => {
    expect(db).toContain("process.env.BOOTSTRAP_ADMIN_USERNAME");
    expect(db).not.toMatch(/username = 'Jonathan'/);
  });

  it('creates the default dev admin only when SEED_DEV_ADMIN is explicitly "true"', () => {
    const seed = db.slice(db.indexOf("const userCount = await client.query"), db.indexOf("Created default dev admin"));
    expect(seed).toContain("process.env.SEED_DEV_ADMIN === 'true'");
  });
});
