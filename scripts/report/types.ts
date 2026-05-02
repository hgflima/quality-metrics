/**
 * Internal report schema. The JSON formatter dumps this shape verbatim; the
 * console and HTML formatters render projections of it. Stable enough that
 * a downstream diff between two runs is meaningful, but not a public API —
 * this module is shipped neither in `dist/` nor in `files`.
 */

export interface CoverageSummary {
  totalStatements: number;
  coveredStatements: number;
  pct: number | null;
}

export interface ClassEntity {
  name: string;
  filePath: string;
  loc: { start: number; end: number };
  wmc: { value: number; methods: Array<{ name: string; cc: number }> };
  lcom: {
    value: number;
    pairs: { same: number; different: number };
    unrelated: Array<[string, string]>;
  };
  cbo: { value: number; outgoing: string[]; incoming: string[] } | null;
  dit: { value: number; chain: string[] } | null;
  coverage: CoverageSummary | null;
}

export interface FunctionEntity {
  name: string;
  filePath: string;
  loc: { start: number; end: number };
  halstead: { volume: number; effort: number; difficulty: number };
  coverage: CoverageSummary | null;
}

export interface FileReport {
  path: string;
  coverage: CoverageSummary | null;
  classes: ClassEntity[];
  functions: FunctionEntity[];
}

export interface ReportThresholds {
  wmcMax: number;
  halsteadMaxVolume: number;
  halsteadMaxEffort: number;
  lcomMax: number;
  cboMax: number;
  ditMax: number;
}

export interface Report {
  generatedAt: string;
  toolVersion: string;
  thresholds: ReportThresholds;
  files: FileReport[];
  summary: {
    totalClasses: number;
    totalFunctions: number;
    avgCoveragePct: number | null;
    violations: {
      wmc: number;
      halstead: number;
      lcom: number;
      cbo: number;
      dit: number;
    };
  };
}

export const DEFAULT_THRESHOLDS: ReportThresholds = {
  wmcMax: 20,
  halsteadMaxVolume: 1000,
  halsteadMaxEffort: 400,
  lcomMax: 0,
  cboMax: 10,
  ditMax: 5,
};
