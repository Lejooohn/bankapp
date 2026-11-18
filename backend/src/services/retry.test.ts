import { describe, it, expect } from 'vitest';
import { retryUntilSuccess } from './retry.js';

describe('retryUntilSuccess', () => {
  it('retries a failing step until it succeeds and reports each failure', async () => {
    let calls = 0;
    const errors: number[] = [];

    const result = await retryUntilSuccess(
      async () => {
        calls++;
        if (calls < 3) throw new Error('db not ready');
        return 'ok';
      },
      1,
      (_err, attempt) => errors.push(attempt)
    );

    expect(result).toBe('ok');
    expect(calls).toBe(3);
    expect(errors).toEqual([1, 2]);
  });

  it('returns immediately when the first attempt succeeds', async () => {
    const result = await retryUntilSuccess(async () => 42, 1, () => {
      throw new Error('should not be called');
    });
    expect(result).toBe(42);
  });
});
