/**
 * Console formatter — five tables (one per metric) sorted descending by the
 * primary value, plus a one-line summary. Uses fixed-width columns; no color
 * (the script is intended to run in CI logs as well as local terminals).
 */

import type { ClassEntity, FunctionEntity, Report } from './types.js';

export function formatConsole(report: Report): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(banner('Quality metrics report'));
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push(
    `Files: ${report.files.length}  Classes: ${report.summary.totalClasses}  Functions: ${report.summary.totalFunctions}`,
  );
  if (report.summary.avgCoveragePct !== null) {
    lines.push(`Avg coverage (all entities): ${report.summary.avgCoveragePct.toFixed(1)}%`);
  } else {
    lines.push('Avg coverage: n/a (no coverage-final.json)');
  }
  lines.push(
    `Violations  WMC=${report.summary.violations.wmc}  Halstead=${report.summary.violations.halstead}  ` +
      `LCOM=${report.summary.violations.lcom}  CBO=${report.summary.violations.cbo}  DIT=${report.summary.violations.dit}`,
  );

  const allClasses: ClassEntity[] = report.files.flatMap((f) => f.classes);
  const allFunctions: FunctionEntity[] = report.files.flatMap((f) => f.functions);

  lines.push('');
  lines.push(
    table(
      'WMC — sum of cyclomatic complexity per class',
      ['Class', 'File', 'WMC', 'Methods', 'Cov%'],
      allClasses
        .slice()
        .sort((a, b) => b.wmc.value - a.wmc.value)
        .slice(0, 20)
        .map((c) => [
          c.name,
          c.filePath,
          String(c.wmc.value),
          String(c.wmc.methods.length),
          formatPct(c.coverage?.pct ?? null),
        ]),
    ),
  );

  lines.push(
    table(
      'Halstead — top functions by Effort',
      ['Function', 'File', 'Volume', 'Effort', 'Difficulty', 'Cov%'],
      allFunctions
        .slice()
        .sort((a, b) => b.halstead.effort - a.halstead.effort)
        .slice(0, 20)
        .map((f) => [
          f.name,
          f.filePath,
          String(f.halstead.volume),
          String(f.halstead.effort),
          String(f.halstead.difficulty),
          formatPct(f.coverage?.pct ?? null),
        ]),
    ),
  );

  lines.push(
    table(
      'LCOM — lack of cohesion per class',
      ['Class', 'File', 'LCOM', 'Cov%'],
      allClasses
        .slice()
        .sort((a, b) => b.lcom.value - a.lcom.value)
        .slice(0, 20)
        .map((c) => [c.name, c.filePath, String(c.lcom.value), formatPct(c.coverage?.pct ?? null)]),
    ),
  );

  const cboClasses = allClasses.filter((c) => c.cbo !== null);
  if (allClasses.length === 0) {
    lines.push('');
    lines.push('No classes found in src/. WMC/LCOM/CBO/DIT tables are empty.');
  } else if (cboClasses.length === 0) {
    lines.push('');
    lines.push('CBO/DIT not computed (ts-morph unavailable or fast-only mode).');
  } else {
    lines.push(
      table(
        'CBO — outgoing + incoming distinct classes',
        ['Class', 'File', 'CBO', 'Out', 'In'],
        cboClasses
          .slice()
          .sort((a, b) => (b.cbo?.value ?? 0) - (a.cbo?.value ?? 0))
          .slice(0, 20)
          .map((c) => [
            c.name,
            c.filePath,
            String(c.cbo!.value),
            String(c.cbo!.outgoing.length),
            String(c.cbo!.incoming.length),
          ]),
      ),
    );

    lines.push(
      table(
        'DIT — depth of inheritance tree',
        ['Class', 'File', 'DIT', 'Chain'],
        cboClasses
          .slice()
          .filter((c) => c.dit && c.dit.value > 0)
          .sort((a, b) => (b.dit?.value ?? 0) - (a.dit?.value ?? 0))
          .slice(0, 20)
          .map((c) => [c.name, c.filePath, String(c.dit!.value), c.dit!.chain.join(' → ')]),
      ),
    );
  }

  return lines.join('\n');
}

function banner(text: string): string {
  const bar = '─'.repeat(text.length + 4);
  return `${bar}\n  ${text}\n${bar}`;
}

function formatPct(pct: number | null): string {
  return pct === null ? '–' : `${pct.toFixed(1)}%`;
}

function table(title: string, headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
  const sep = widths.map((w) => '─'.repeat(w)).join('  ');
  const renderRow = (cells: string[]): string =>
    cells.map((c, i) => (c ?? '').padEnd(widths[i] ?? 0)).join('  ');

  const out: string[] = ['', title, sep, renderRow(headers), sep];
  if (rows.length === 0) {
    out.push('(none)');
  } else {
    for (const row of rows) out.push(renderRow(row));
  }
  out.push(sep);
  return out.join('\n');
}
