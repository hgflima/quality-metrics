/**
 * CLI entry — `npm run report` (or `tsx scripts/report/index.ts`).
 *
 * Walks `src/`, computes the five metrics for every class and top-level
 * function, optionally decorates with vitest coverage, and emits up to three
 * outputs:
 *
 * - report/metrics.json (default on)
 * - report/index.html (default on)
 * - console table (always printed)
 *
 * Flags:
 * --no-coverage        skip coverage decoration even if coverage-final.json exists
 * --fast-only          skip CBO/DIT (no ts-morph load — useful for sanity checks)
 * --out=<dir>          output directory (default: report/)
 * --no-json            skip metrics.json write
 * --no-html            skip index.html write
 */

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectAll } from './collect-metrics.js';
import { loadCoverage, decorateWithCoverage } from './collect-coverage.js';
import { formatConsole } from './format-console.js';
import { formatJson } from './format-json.js';
import { formatHtml } from './format-html.js';
import { DEFAULT_THRESHOLDS, type FileReport, type Report } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(__filename, '../../..');

interface CliOptions {
  outDir: string;
  withCoverage: boolean;
  fastOnly: boolean;
  emitJson: boolean;
  emitHtml: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    outDir: 'report',
    withCoverage: true,
    fastOnly: false,
    emitJson: true,
    emitHtml: true,
  };
  for (const arg of argv) {
    if (arg === '--no-coverage') opts.withCoverage = false;
    else if (arg === '--fast-only') opts.fastOnly = true;
    else if (arg === '--no-json') opts.emitJson = false;
    else if (arg === '--no-html') opts.emitHtml = false;
    else if (arg.startsWith('--out=')) opts.outDir = arg.slice('--out='.length);
    else console.warn(`[report] ignoring unknown flag: ${arg}`);
  }
  return opts;
}

function buildReport(files: FileReport[]): Report {
  let totalClasses = 0;
  let totalFunctions = 0;
  let coverageSum = 0;
  let coverageCount = 0;
  const violations = { wmc: 0, halstead: 0, lcom: 0, cbo: 0, dit: 0 };
  const t = DEFAULT_THRESHOLDS;

  for (const file of files) {
    totalClasses += file.classes.length;
    totalFunctions += file.functions.length;

    for (const c of file.classes) {
      if (c.wmc.value > t.wmcMax) violations.wmc++;
      if (c.lcom.value > t.lcomMax) violations.lcom++;
      if (c.cbo && c.cbo.value > t.cboMax) violations.cbo++;
      if (c.dit && c.dit.value > t.ditMax) violations.dit++;
      if (c.coverage?.pct !== undefined && c.coverage?.pct !== null) {
        coverageSum += c.coverage.pct;
        coverageCount++;
      }
    }
    for (const f of file.functions) {
      if (f.halstead.volume > t.halsteadMaxVolume || f.halstead.effort > t.halsteadMaxEffort)
        violations.halstead++;
      if (f.coverage?.pct !== undefined && f.coverage?.pct !== null) {
        coverageSum += f.coverage.pct;
        coverageCount++;
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    toolVersion: readToolVersion(),
    thresholds: t,
    files,
    summary: {
      totalClasses,
      totalFunctions,
      avgCoveragePct:
        coverageCount > 0 ? Math.round((coverageSum / coverageCount) * 10) / 10 : null,
      violations,
    },
  };
}

function readToolVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
      name?: string;
      version?: string;
    };
    return `${pkg.name ?? 'quality-metrics'}@${pkg.version ?? '0.0.0'}`;
  } catch {
    return 'quality-metrics@unknown';
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  const t0 = Date.now();
  const files = collectAll({ fastOnly: opts.fastOnly });
  const elapsedCollect = Date.now() - t0;

  if (opts.withCoverage) {
    const coverage = loadCoverage(join(REPO_ROOT, 'coverage', 'coverage-final.json'));
    if (coverage) {
      decorateWithCoverage(files, coverage, REPO_ROOT);
    } else {
      console.warn(
        '[report] coverage/coverage-final.json not found — run `npm run test:coverage` first to populate coverage fields.',
      );
    }
  }

  const report = buildReport(files);

  console.log(formatConsole(report));
  console.log(`\n[report] collected metrics in ${elapsedCollect}ms`);

  const outDir = resolve(REPO_ROOT, opts.outDir);
  mkdirSync(outDir, { recursive: true });

  if (opts.emitJson) {
    const jsonPath = join(outDir, 'metrics.json');
    writeFileSync(jsonPath, formatJson(report));
    console.log(`[report] wrote ${jsonPath}`);
  }
  if (opts.emitHtml) {
    const htmlPath = join(outDir, 'index.html');
    writeFileSync(htmlPath, formatHtml(report));
    console.log(`[report] wrote ${htmlPath}`);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
