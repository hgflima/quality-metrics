/**
 * Performance benchmarks (TASK-041) — vitest bench API.
 *
 * Tracks wall-clock cost of running the plugin's two tiers against a
 * representative 500-file TypeScript project. The architectural targets from
 * `docs/mvp/04-security-and-performance.md` §"Execution Time Targets":
 *
 * - Fast tier (WMC + Halstead + LCOM): < 1s on 500 files
 * - Deep tier (CBO + DIT, after createOnce warmup): < 10s on 500 files
 *
 * Note: this `.bench.ts` file is informational — it surfaces timings but does
 * not fail the build on regressions. The hard CI gate lives in
 * `tests/benchmarks/perf-gate.test.ts`, which runs as part of `npm test` and
 * asserts upper-bound elapsed time.
 *
 * The bench harness uses ESLint's `Linter` class — the plugin code itself is
 * runtime-agnostic (the same rule object plugs into OXLint and ESLint), so
 * a bench through ESLint is a valid stand-in for measuring the rule cost
 * minus the OXLint-specific overhead. OXLint's Rust runtime is faster, so
 * an ESLint-side benchmark is a conservative upper bound on rule cost.
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Linter } from 'eslint';
import { afterAll, bench, beforeAll, describe } from 'vitest';

import plugin from '../../src/index.js';
import { resetProjectSingleton } from '../../src/project-singleton.js';
import {
  cleanupFixtureProject,
  generateFixtureProject,
  type GeneratedFixtureSet,
} from './fixture-generator.js';

const FIXTURE_FILE_COUNT = 500;

const FAST_CONFIG_BASE = {
  files: ['**/*.ts', '**/*.js'],
  plugins: { 'quality-metrics': plugin },
  languageOptions: {
    ecmaVersion: 2022 as const,
    sourceType: 'module' as const,
  },
} as const;

let fixtures: GeneratedFixtureSet;

beforeAll(() => {
  const root = mkdtempSync(path.join(tmpdir(), 'qm-bench-'));
  fixtures = generateFixtureProject(root, FIXTURE_FILE_COUNT);
  resetProjectSingleton();
});

afterAll(() => {
  if (fixtures) cleanupFixtureProject(fixtures.rootDir);
  resetProjectSingleton();
});

describe('fast tier — 500 files', () => {
  bench(
    'WMC + Halstead + LCOM via ESLint Linter',
    () => {
      // cwd anchors flat-config `files` globs at the fixture root so the rules
      // actually fire on the temp-dir paths (otherwise ESLint emits a single
      // "No matching configuration found" warning and silently skips).
      const linter = new Linter({ cwd: fixtures.rootDir });
      const config = {
        ...FAST_CONFIG_BASE,
        rules: {
          'quality-metrics/wmc': ['error', { max: 20 }],
          'quality-metrics/halstead': ['warn', { maxVolume: 1000, maxEffort: 400 }],
          'quality-metrics/lcom': ['warn', { maxLcom: 2 }],
        },
      } as never;
      for (const f of fixtures.files) {
        linter.verify(f.source, config, f.filePath);
      }
    },
    { time: 5000 },
  );
});

describe('deep tier — 500 files', () => {
  bench(
    'CBO + DIT via ESLint Linter (createOnce warmup amortized)',
    () => {
      const linter = new Linter({ cwd: fixtures.rootDir });
      const config = {
        ...FAST_CONFIG_BASE,
        rules: {
          'quality-metrics/cbo': ['error', { max: 10, tsconfigPath: fixtures.tsconfigPath }],
          'quality-metrics/dit': ['warn', { max: 5, tsconfigPath: fixtures.tsconfigPath }],
        },
      } as never;
      for (const f of fixtures.files) {
        linter.verify(f.source, config, f.filePath);
      }
    },
    { time: 30000 },
  );
});
