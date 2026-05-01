import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/oxlint-cli/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    passWithNoTests: false,
  },
});
