// Source-level guards for patterns that are easy to reintroduce in new routes.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROUTES = path.resolve(__dirname, '../routes');

describe('route error handling', () => {
  it('never returns raw err.message to clients; route files use errMsg(err)', () => {
    const offenders = fs
      .readdirSync(ROUTES)
      .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .filter(f => /error:\s*err\.message/.test(fs.readFileSync(path.join(ROUTES, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
