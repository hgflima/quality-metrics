import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/integration/oxlint-cli/**', 'node_modules/**'],
    benchmark: {
      include: ['tests/benchmarks/**/*.bench.ts'],
    },
    environment: 'node',
    passWithNoTests: true,
  },
});
