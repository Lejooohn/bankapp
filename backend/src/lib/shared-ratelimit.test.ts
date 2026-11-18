import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../db.js', () => ({ default: { query: vi.fn() } }));

import { checkRateLimit, rateLimitMap } from './shared.js';

beforeEach(() => { rateLimitMap.clear(); });
afterEach(() => { vi.useRealTimers(); rateLimitMap.clear(); });

describe('checkRateLimit', () => {
  it('allows up to the limit within the window, then blocks', () => {
    for (let i = 0; i < 3; i++) expect(checkRateLimit('k', 3, 60_000)).toBe(true);
    expect(checkRateLimit('k', 3, 60_000)).toBe(false);
  });

  it('reopens once the window has elapsed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    expect(checkRateLimit('k', 1, 60_000)).toBe(true);
    expect(checkRateLimit('k', 1, 60_000)).toBe(false);
    vi.setSystemTime(new Date('2026-01-01T00:01:01Z'));
    expect(checkRateLimit('k', 1, 60_000)).toBe(true);
  });

  it('purges expired windows once many keys are tracked, so the map stays bounded', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    // 10 000 keys from a rotating attacker, all with windows that have now expired.
    for (let i = 0; i < 10_000; i++) checkRateLimit(`attacker-${i}`, 5, 1_000);
    vi.setSystemTime(new Date('2026-01-01T01:00:00Z'));

    expect(checkRateLimit('fresh', 5, 1_000)).toBe(true);
    expect(rateLimitMap.size).toBeLessThan(10_000);
    expect(rateLimitMap.has('fresh')).toBe(true);
  });
});

