/**
 * Performance CI gate (TASK-041).
 *
 * Asserts that the plugin's two tiers stay within the architectural budget
 * declared in `docs/mvp/04-security-and-performance.md`:
 *
 *   - Fast tier (WMC + Halstead + LCOM):              < 1s on 500 files
 *   - Deep tier (CBO + DIT, after createOnce warmup): < 10s on 500 files
 *
 *   "CI fails if either benchmark exceeds its target by > 20%."
 *
 * The 20% tolerance is applied here:
 *   - Fast budget = 1.0s + 20% = 1.2s
 *   - Deep budget = 10.0s + 20% = 12.0s
 *
 * Tolerance escape hatch: set `QM_PERF_TOLERANCE=<float>` (e.g. `2.0` to allow
 * 2x the architectural target) to relax the gate for slow CI runners. The
 * default of 1.2 enforces the spec.
 *
 * Skip switch: set `QM_SKIP_PERF_GATE=1` to bypass these tests entirely (for
 * local iteration or unrelated CI jobs that should not pay the bench cost).
 *
 * The gate is intentionally a regular `*.test.ts` (not a `*.bench.ts`) so it
 * runs as part of `npm test` and propagates failures through standard CI exit
 * codes — vitest bench has no built-in fail-on-threshold semantics.
 *
 * Note on runtime choice: this gate runs through ESLint's `Linter` rather than
 * the OXLint binary. OXLint's Rust runtime is faster than ESLint's Node
 * runtime, so an ESLint-side budget is a conservative *upper bound* — if the
 * rules pass the budget here they will comfortably pass under OXLint. This
 * matches how the rule code is shared between runtimes (the plugin object is
 * identical; only the host runtime differs).
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { Linter } from 'eslint';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import plugin from '../../src/index.js';
import { resetProjectSingleton } from '../../src/project-singleton.js';
import {
  cleanupFixtureProject,
  generateFixtureProject,
  type GeneratedFixtureSet,
} from './fixture-generator.js';

const FIXTURE_FILE_COUNT = 500;
const FAST_BUDGET_MS = 1000;
const DEEP_BUDGET_MS = 10_000;
const DEFAULT_TOLERANCE = 1.2;

const tolerance = (() => {
  const raw = process.env['QM_PERF_TOLERANCE'];
  if (!raw) return DEFAULT_TOLERANCE;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TOLERANCE;
})();

const skip = process.env['QM_SKIP_PERF_GATE'] === '1';

const FAST_BUDGET_WITH_TOLERANCE_MS = FAST_BUDGET_MS * tolerance;
const DEEP_BUDGET_WITH_TOLERANCE_MS = DEEP_BUDGET_MS * tolerance;

const FLAT_CONFIG_BASE = {
  files: ['**/*.ts', '**/*.js'],
  plugins: { 'quality-metrics': plugin },
  languageOptions: {
    ecmaVersion: 2022 as const,
    sourceType: 'module' as const,
  },
} as const;

let fixtures: GeneratedFixtureSet;

describe.skipIf(skip)('performance gate — 500-file fixture project', () => {
  beforeAll(() => {
    const root = mkdtempSync(path.join(tmpdir(), 'qm-perf-gate-'));
    fixtures = generateFixtureProject(root, FIXTURE_FILE_COUNT);
    resetProjectSingleton();
  }, 60_000);

  afterAll(() => {
    if (fixtures) cleanupFixtureProject(fixtures.rootDir);
    resetProjectSingleton();
  });

  it('fixture project materializes the expected file count', () => {
    expect(fixtures).toBeDefined();
    expect(fixtures.files).toHaveLength(FIXTURE_FILE_COUNT);
  });

  it(
    `fast tier (WMC + Halstead + LCOM) completes within ${FAST_BUDGET_WITH_TOLERANCE_MS}ms (target ${FAST_BUDGET_MS}ms × ${tolerance}x)`,
    () => {
      // ESLint flat-config `files` globs are resolved relative to the Linter's
      // cwd. The fixture lives under a tmpdir() outside the project root, so we
      // anchor cwd to the fixture root — otherwise every verify() returns a
      // single "No matching configuration found" diagnostic and silently skips
      // every rule.
      const linter = new Linter({ cwd: fixtures.rootDir });
      const config = {
        ...FLAT_CONFIG_BASE,
        rules: {
          'quality-metrics/wmc': ['error', { max: 20 }],
          'quality-metrics/halstead': [
            'warn',
            { maxVolume: 1000, maxEffort: 400 },
          ],
          'quality-metrics/lcom': ['warn', { maxLcom: 2 }],
        },
      } as never;

      const start = performance.now();
      let fatalCount = 0;
      let processedFiles = 0;
      for (const f of fixtures.files) {
        const messages = linter.verify(f.source, config, f.filePath);
        for (const m of messages) {
          if (m.fatal) fatalCount++;
        }
        processedFiles++;
      }
      const elapsed = performance.now() - start;

      expect(processedFiles).toBe(FIXTURE_FILE_COUNT);
      expect(fatalCount).toBe(0);
      // eslint-disable-next-line no-console
      console.log(`[perf-gate] fast tier elapsed: ${elapsed.toFixed(1)}ms (budget ${FAST_BUDGET_WITH_TOLERANCE_MS}ms)`);
      expect(elapsed).toBeLessThan(FAST_BUDGET_WITH_TOLERANCE_MS);
    },
    60_000,
  );

  it(
    `deep tier (CBO + DIT) completes within ${DEEP_BUDGET_WITH_TOLERANCE_MS}ms (target ${DEEP_BUDGET_MS}ms × ${tolerance}x)`,
    () => {
      const linter = new Linter({ cwd: fixtures.rootDir });
      const config = {
        ...FLAT_CONFIG_BASE,
        rules: {
          'quality-metrics/cbo': [
            'error',
            { max: 10, tsconfigPath: fixtures.tsconfigPath },
          ],
          'quality-metrics/dit': [
            'warn',
            { max: 5, tsconfigPath: fixtures.tsconfigPath },
          ],
        },
      } as never;

      const start = performance.now();
      let fatalCount = 0;
      let processedFiles = 0;
      for (const f of fixtures.files) {
        const messages = linter.verify(f.source, config, f.filePath);
        for (const m of messages) {
          if (m.fatal) fatalCount++;
        }
        processedFiles++;
      }
      const elapsed = performance.now() - start;

      expect(processedFiles).toBe(FIXTURE_FILE_COUNT);
      expect(fatalCount).toBe(0);
      // eslint-disable-next-line no-console
      console.log(`[perf-gate] deep tier elapsed: ${elapsed.toFixed(1)}ms (budget ${DEEP_BUDGET_WITH_TOLERANCE_MS}ms)`);
      expect(elapsed).toBeLessThan(DEEP_BUDGET_WITH_TOLERANCE_MS);
    },
    120_000,
  );
});
