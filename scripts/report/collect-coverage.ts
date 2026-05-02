/**
 * Read `coverage/coverage-final.json` (vitest v8 reporter output, istanbul
 * shape) and decorate the file/entity records with line-level coverage.
 *
 * Mapping rule: for an entity covering AST lines [start, end] in file F,
 * count statements in F's `statementMap` whose `start.line` falls in
 * [start, end]. `pct` = covered / total. When zero statements fall in the
 * range, `pct` is `null` (not 0% — distinguishes "no executable code" from
 * "all uncovered").
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { CoverageSummary, FileReport } from './types.js';

interface IstanbulFileEntry {
  path: string;
  statementMap: Record<string, { start: { line: number }; end: { line: number } }>;
  s: Record<string, number>;
}

type IstanbulReport = Record<string, IstanbulFileEntry>;

export function loadCoverage(coveragePath: string): IstanbulReport | null {
  if (!existsSync(coveragePath)) return null;
  try {
    const raw = readFileSync(coveragePath, 'utf8');
    return JSON.parse(raw) as IstanbulReport;
  } catch (err) {
    console.warn(
      `[report] failed to read ${coveragePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

export function decorateWithCoverage(
  files: FileReport[],
  coverage: IstanbulReport,
  repoRoot: string,
): void {
  // Build lookup by absolute path — istanbul uses absolute paths as keys.
  const byPath = new Map<string, IstanbulFileEntry>();
  for (const entry of Object.values(coverage)) {
    byPath.set(entry.path, entry);
  }

  for (const file of files) {
    const abs = resolve(repoRoot, file.path);
    const entry = byPath.get(abs);
    if (!entry) continue;

    file.coverage = summarize(entry, 1, Number.MAX_SAFE_INTEGER);

    for (const cls of file.classes) {
      cls.coverage = summarize(entry, cls.loc.start, cls.loc.end);
    }
    for (const fn of file.functions) {
      fn.coverage = summarize(entry, fn.loc.start, fn.loc.end);
    }
  }
}

function summarize(
  entry: IstanbulFileEntry,
  startLine: number,
  endLine: number,
): CoverageSummary | null {
  let total = 0;
  let covered = 0;
  for (const [id, range] of Object.entries(entry.statementMap)) {
    const line = range.start.line;
    if (line < startLine || line > endLine) continue;
    total++;
    const hits = entry.s[id] ?? 0;
    if (hits > 0) covered++;
  }
  if (total === 0) return null;
  return {
    totalStatements: total,
    coveredStatements: covered,
    pct: Math.round((covered / total) * 1000) / 10,
  };
}
