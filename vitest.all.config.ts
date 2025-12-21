import { defineConfig } from 'vitest/config';

/**
 * Combined config for running ALL tests (unit + integration)
 * Use this for comprehensive coverage on machines with real devices/emulators
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Include integration tests
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/**/*.d.ts'],
    },
    testTimeout: 600000, // 10 minutes for build operations
    hookTimeout: 120000, // 2 minutes for hooks
  },
});
