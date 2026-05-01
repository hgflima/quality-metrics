import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

const execFileAsync = promisify(execFile);

export interface OxlintDiagnostic {
  message: string;
  code: string;
  severity: 'error' | 'warning' | string;
  filename: string;
  labels?: unknown[];
}

export interface OxlintResult {
  exitCode: number;
  diagnostics: OxlintDiagnostic[];
  raw: string;
}

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const OXLINT_BIN = resolve(REPO_ROOT, 'node_modules', '.bin', 'oxlint');

function parseOxlintJson(stdout: string): OxlintDiagnostic[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed) as { diagnostics?: OxlintDiagnostic[] };
  return parsed.diagnostics ?? [];
}

export async function runOxlint(configPath: string, ...targets: string[]): Promise<OxlintResult> {
  const args = ['--config', configPath, '-f', 'json', ...targets];
  try {
    const { stdout } = await execFileAsync(OXLINT_BIN, args, {
      cwd: REPO_ROOT,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { exitCode: 0, diagnostics: parseOxlintJson(stdout), raw: stdout };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { code?: number | string; stdout?: string };
    const stdout = e.stdout ?? '';
    return {
      exitCode: typeof e.code === 'number' ? e.code : 1,
      diagnostics: parseOxlintJson(stdout),
      raw: stdout,
    };
  }
}

export function diagnosticsForRule(
  diagnostics: OxlintDiagnostic[],
  ruleShortName: 'wmc' | 'halstead' | 'lcom' | 'cbo' | 'dit',
): OxlintDiagnostic[] {
  return diagnostics.filter((d) => d.code === `quality-metrics(${ruleShortName})`);
}
