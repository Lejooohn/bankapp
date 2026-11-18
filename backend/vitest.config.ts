import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Only the sources: dist/ holds stale compiled copies of the tests.
    include: ['src/**/*.test.ts'],
    env: {
      // Throwaway key, test-only — never used for real data.
      ENCRYPTION_KEY: '1f'.repeat(32),
    },
  },
});
