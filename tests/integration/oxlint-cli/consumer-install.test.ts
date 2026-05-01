import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const exec = promisify(execFile);
const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

interface OxlintDiagnostic {
  message: string;
  code: string;
}

let consumerDir: string;
let tarballPath: string;

beforeAll(async () => {
  // 1. Pack the local plugin into a tarball.
  const { stdout } = await exec('npm', ['pack', '--silent'], { cwd: REPO_ROOT });
  const tarballName = stdout.trim().split('\n').pop()!;
  tarballPath = join(REPO_ROOT, tarballName);

  // 2. Spin up a throwaway consumer project.
  consumerDir = mkdtempSync(join(tmpdir(), 'quality-metrics-consumer-'));

  writeFileSync(
    join(consumerDir, 'package.json'),
    JSON.stringify(
      { name: 'consumer-smoke', version: '0.0.0', private: true, type: 'module' },
      null,
      2,
    ),
  );

  // 3. Install the packed plugin + oxlint as a real consumer would.
  await exec(
    'npm',
    ['install', '--no-audit', '--no-fund', '--silent', tarballPath, 'oxlint@1.62.0'],
    { cwd: consumerDir, env: { ...process.env, npm_config_loglevel: 'error' } },
  );

  // 4. Drop a violating fixture and a config that resolves the plugin BY PACKAGE NAME
  //    (mirrors the published presets in configs/oxlint.fast.json).
  writeFileSync(
    join(consumerDir, 'oxlint.fast.json'),
    JSON.stringify(
      {
        jsPlugins: ['quality-metrics'],
        rules: { 'quality-metrics/wmc': ['error', { max: 15 }] },
      },
      null,
      2,
    ),
  );

  writeFileSync(
    join(consumerDir, 'high-wmc.ts'),
    [
      'export class OrderService {',
      '  validate(x: number): boolean { if (x > 0) { if (x < 100) return true; } return false; }',
      '  create(t: string): void { switch (t) { case "a": break; case "b": break; case "c": break; case "d": break; } }',
      '  update(id: string, data: { locked?: boolean } | null): unknown { if (!id) return; if (!data) return; if (data.locked) return; return data; }',
      '  delete(id: string): void { if (!id) throw new Error("id required"); }',
      '  list(p: number): number { if (p < 1) p = 1; if (p > 100) p = 100; return p; }',
      '}',
      '',
    ].join('\n'),
  );
}, 120_000);

afterAll(() => {
  if (consumerDir) {
    try {
      rmSync(consumerDir, { recursive: true, force: true });
    } catch {
      /* swallow */
    }
  }
  if (tarballPath) {
    try {
      unlinkSync(tarballPath);
    } catch {
      /* swallow */
    }
  }
  // Stray tarballs from earlier runs would cause `npm pack` ambiguity; sweep them.
  for (const f of readdirSync(REPO_ROOT)) {
    if (f.startsWith('quality-metrics-') && f.endsWith('.tgz')) {
      try {
        unlinkSync(join(REPO_ROOT, f));
      } catch {
        /* swallow */
      }
    }
  }
});

describe('consumer install smoke — published preset path resolution', () => {
  it('jsPlugins resolves "quality-metrics" by package name and WMC fires', async () => {
    const oxlintBin = join(consumerDir, 'node_modules', '.bin', 'oxlint');
    let stdout = '';
    let exitCode = 0;
    try {
      const r = await exec(
        oxlintBin,
        ['--config', 'oxlint.fast.json', '-f', 'json', 'high-wmc.ts'],
        {
          cwd: consumerDir,
          maxBuffer: 16 * 1024 * 1024,
        },
      );
      stdout = r.stdout;
    } catch (err) {
      const e = err as { code?: number; stdout?: string };
      exitCode = typeof e.code === 'number' ? e.code : 1;
      stdout = e.stdout ?? '';
    }

    expect(exitCode).not.toBe(0);
    const parsed = JSON.parse(stdout) as { diagnostics: OxlintDiagnostic[] };
    const wmc = parsed.diagnostics.filter((d) => d.code === 'quality-metrics(wmc)');
    expect(wmc).toHaveLength(1);
    expect(wmc[0].message).toMatch(/Class 'OrderService' has WMC of 17 \(max: 15\)/);
  }, 60_000);
});
