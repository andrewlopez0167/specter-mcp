import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/e2e/**/*.test.ts'],
    testTimeout: 300000, // 5 minutes default (individual tests can override)
    hookTimeout: 180000, // 3 minutes for device launch
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // Sequential execution to prevent resource conflicts
      },
    },
  },
});
