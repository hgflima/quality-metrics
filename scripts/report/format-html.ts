/**
 * HTML formatter — single self-contained file, no external assets.
 *
 * Renders five sortable tables (one per metric) plus a header strip with the
 * summary numbers. Sorting is done client-side by a small inline script that
 * toggles ascending/descending on header click. Coverage % is rendered as a
 * filled bar (CSS only); rows above the threshold get a `.violation` class
 * highlighted in red so violations stand out at a glance.
 */

import type { ClassEntity, FunctionEntity, Report, ReportThresholds } from './types.js';

export function formatHtml(report: Report): string {
  const allClasses: ClassEntity[] = report.files.flatMap((f) => f.classes);
  const allFunctions: FunctionEntity[] = report.files.flatMap((f) => f.functions);
  const t = report.thresholds;

  const sections: string[] = [];

  sections.push(
    classTable('WMC — Weighted Methods per Class', allClasses, t, 'wmc', (c) => [
      cell(c.name),
      cell(c.filePath),
      numCell(c.wmc.value, c.wmc.value > t.wmcMax),
      cell(String(c.wmc.methods.length)),
      coverageCell(c.coverage?.pct ?? null),
    ]),
  );
  sections.push(
    functionTable('Halstead — Volume / Effort per function', allFunctions, t, (f) => [
      cell(f.name),
      cell(f.filePath),
      numCell(f.halstead.volume, f.halstead.volume > t.halsteadMaxVolume),
      numCell(f.halstead.effort, f.halstead.effort > t.halsteadMaxEffort),
      cell(String(f.halstead.difficulty)),
      coverageCell(f.coverage?.pct ?? null),
    ]),
  );
  sections.push(
    classTable('LCOM — Lack of Cohesion of Methods', allClasses, t, 'lcom', (c) => [
      cell(c.name),
      cell(c.filePath),
      numCell(c.lcom.value, c.lcom.value > t.lcomMax),
      cell(String(c.lcom.pairs.different + c.lcom.pairs.same)),
      coverageCell(c.coverage?.pct ?? null),
    ]),
  );

  const cboClasses = allClasses.filter((c) => c.cbo !== null);
  if (cboClasses.length > 0) {
    sections.push(
      classTable('CBO — Coupling Between Objects', cboClasses, t, 'cbo', (c) => [
        cell(c.name),
        cell(c.filePath),
        numCell(c.cbo!.value, c.cbo!.value > t.cboMax),
        cell(String(c.cbo!.outgoing.length)),
        cell(String(c.cbo!.incoming.length)),
      ]),
    );
    sections.push(
      classTable('DIT — Depth of Inheritance Tree', cboClasses, t, 'dit', (c) => [
        cell(c.name),
        cell(c.filePath),
        numCell(c.dit?.value ?? 0, (c.dit?.value ?? 0) > t.ditMax),
        cell(c.dit?.chain.join(' → ') ?? '–'),
      ]),
    );
  }

  const avgCov =
    report.summary.avgCoveragePct !== null ? `${report.summary.avgCoveragePct.toFixed(1)}%` : 'n/a';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>quality-metrics report</title>
<style>
  :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
  body { margin: 0; padding: 2rem; max-width: 1400px; }
  h1 { font-size: 1.4rem; margin: 0 0 0.5rem; }
  .meta { color: #777; font-size: 0.85rem; margin-bottom: 1.5rem; }
  .summary { display: flex; gap: 1.5rem; flex-wrap: wrap; padding: 0.75rem 1rem; background: rgba(127,127,127,0.08); border-radius: 6px; font-size: 0.9rem; margin-bottom: 1.5rem; }
  .summary span strong { font-variant-numeric: tabular-nums; }
  details { margin-bottom: 1rem; }
  summary { font-size: 1.05rem; font-weight: 600; cursor: pointer; padding: 0.5rem 0; }
  table { border-collapse: collapse; width: 100%; font-size: 0.85rem; font-variant-numeric: tabular-nums; }
  th, td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid rgba(127,127,127,0.2); }
  th { cursor: pointer; user-select: none; background: rgba(127,127,127,0.06); position: sticky; top: 0; }
  th:hover { background: rgba(127,127,127,0.15); }
  th.sorted-asc::after { content: " ▲"; opacity: 0.6; }
  th.sorted-desc::after { content: " ▼"; opacity: 0.6; }
  td.num { text-align: right; }
  tr.violation td.num.violator { color: #c1121f; font-weight: 600; }
  .bar { display: inline-block; width: 80px; height: 0.7em; background: rgba(127,127,127,0.2); border-radius: 2px; vertical-align: middle; position: relative; overflow: hidden; }
  .bar-fill { display: block; height: 100%; background: #2a9d8f; }
  .bar-fill.low { background: #e76f51; }
  .pct { display: inline-block; min-width: 3em; text-align: right; margin-left: 0.4rem; font-size: 0.8rem; }
</style>
</head>
<body>
<h1>quality-metrics report</h1>
<div class="meta">Generated ${escape(report.generatedAt)} · ${escape(report.toolVersion)} · ${report.files.length} files</div>
<div class="summary">
  <span>Classes <strong>${report.summary.totalClasses}</strong></span>
  <span>Functions <strong>${report.summary.totalFunctions}</strong></span>
  <span>Avg coverage <strong>${avgCov}</strong></span>
  <span>WMC violations <strong>${report.summary.violations.wmc}</strong></span>
  <span>Halstead <strong>${report.summary.violations.halstead}</strong></span>
  <span>LCOM <strong>${report.summary.violations.lcom}</strong></span>
  <span>CBO <strong>${report.summary.violations.cbo}</strong></span>
  <span>DIT <strong>${report.summary.violations.dit}</strong></span>
</div>
${sections.join('\n')}
<script>
document.querySelectorAll('table').forEach((tbl) => {
  tbl.querySelectorAll('th').forEach((th, idx) => {
    th.addEventListener('click', () => {
      const tbody = tbl.querySelector('tbody');
      if (!tbody) return;
      const rows = Array.from(tbody.querySelectorAll('tr'));
      const asc = !th.classList.contains('sorted-asc');
      tbl.querySelectorAll('th').forEach((h) => h.classList.remove('sorted-asc', 'sorted-desc'));
      th.classList.add(asc ? 'sorted-asc' : 'sorted-desc');
      const numeric = rows.every((r) => /^[-]?[\\d.]+(\\s|$)/.test((r.children[idx]?.dataset.sort ?? r.children[idx]?.textContent ?? '').trim()));
      rows.sort((a, b) => {
        const av = (a.children[idx]?.dataset.sort ?? a.children[idx]?.textContent ?? '').trim();
        const bv = (b.children[idx]?.dataset.sort ?? b.children[idx]?.textContent ?? '').trim();
        if (numeric) return (asc ? 1 : -1) * (parseFloat(av) - parseFloat(bv));
        return (asc ? 1 : -1) * av.localeCompare(bv);
      });
      rows.forEach((r) => tbody.appendChild(r));
    });
  });
});
</script>
</body>
</html>
`;
}

function classTable<T extends ClassEntity>(
  title: string,
  rows: T[],
  thresholds: ReportThresholds,
  metric: 'wmc' | 'lcom' | 'cbo' | 'dit',
  rowFn: (c: T) => string[],
): string {
  const headers =
    metric === 'wmc'
      ? ['Class', 'File', 'WMC', 'Methods', 'Coverage']
      : metric === 'lcom'
        ? ['Class', 'File', 'LCOM', 'Pairs', 'Coverage']
        : metric === 'cbo'
          ? ['Class', 'File', 'CBO', 'Outgoing', 'Incoming']
          : ['Class', 'File', 'DIT', 'Chain'];

  return renderTable(title, headers, rows, rowFn, (c) => isViolation(c, thresholds, metric));
}

function functionTable(
  title: string,
  rows: FunctionEntity[],
  thresholds: ReportThresholds,
  rowFn: (f: FunctionEntity) => string[],
): string {
  const headers = ['Function', 'File', 'Volume', 'Effort', 'Difficulty', 'Coverage'];
  return renderTable(
    title,
    headers,
    rows,
    rowFn,
    (f) =>
      f.halstead.volume > thresholds.halsteadMaxVolume ||
      f.halstead.effort > thresholds.halsteadMaxEffort,
  );
}

function renderTable<T>(
  title: string,
  headers: string[],
  rows: T[],
  rowFn: (r: T) => string[],
  isViolation: (r: T) => boolean,
): string {
  const trs = rows
    .map((r) => {
      const cells = rowFn(r).join('');
      return `<tr${isViolation(r) ? ' class="violation"' : ''}>${cells}</tr>`;
    })
    .join('\n');
  const ths = headers.map((h) => `<th>${escape(h)}</th>`).join('');
  return `
<details open>
<summary>${escape(title)} (${rows.length})</summary>
<table>
<thead><tr>${ths}</tr></thead>
<tbody>
${trs || '<tr><td colspan="' + headers.length + '">(none)</td></tr>'}
</tbody>
</table>
</details>`;
}

function cell(s: string): string {
  return `<td>${escape(s)}</td>`;
}

function numCell(n: number, violator: boolean): string {
  return `<td class="num${violator ? ' violator' : ''}" data-sort="${n}">${n}</td>`;
}

function coverageCell(pct: number | null): string {
  if (pct === null) return `<td data-sort="-1">–</td>`;
  const lowClass = pct < 60 ? ' low' : '';
  return `<td data-sort="${pct}"><span class="bar"><span class="bar-fill${lowClass}" style="width:${pct}%"></span></span><span class="pct">${pct.toFixed(1)}%</span></td>`;
}

function isViolation(c: ClassEntity, t: ReportThresholds, metric: string): boolean {
  if (metric === 'wmc') return c.wmc.value > t.wmcMax;
  if (metric === 'lcom') return c.lcom.value > t.lcomMax;
  if (metric === 'cbo') return (c.cbo?.value ?? 0) > t.cboMax;
  if (metric === 'dit') return (c.dit?.value ?? 0) > t.ditMax;
  return false;
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
