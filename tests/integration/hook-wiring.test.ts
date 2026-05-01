/**
 * Integration tests — hook wiring fixtures (US-007 + US-008).
 *
 * Validates the two shipping fixtures users wire into their projects:
 *   - `fixtures/lintstagedrc.example.js`  (US-008: pre-commit gate)
 *   - `fixtures/claude-md-hook.md`        (US-007: Claude Code PostToolUse)
 *
 * E2E-014 (full `git commit` shell integration with the real `oxlint` binary)
 * is intentionally out of scope here — it requires an `oxlint` install plus a
 * scratch git repo and lives in CI. These tests instead verify the contract
 * the fixtures encode: the lint-staged config exports a valid module shape
 * that targets `*.{ts,tsx}` and references both shipping presets, and the
 * Claude Code snippet declares a PostToolUse hook running the fast preset.
 *
 * Source of truth for the expected shape:
 *   docs/mvp/03-technical-architecture.md §"Claude Code Hook Snippet"
 *   docs/mvp/03-technical-architecture.md §"lint-staged Configuration"
 *   docs/mvp/02-user-stories.md           §"US-007", §"US-008"
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const LINTSTAGED_PATH = resolve(ROOT, 'fixtures/lintstagedrc.example.js');
const CLAUDE_MD_HOOK_PATH = resolve(ROOT, 'fixtures/claude-md-hook.md');
const FAST_CONFIG_PATH = resolve(ROOT, 'configs/oxlint.fast.json');
const DEEP_CONFIG_PATH = resolve(ROOT, 'configs/oxlint.deep.json');

interface LintStagedConfig {
  [glob: string]: string[] | string;
}

async function loadLintStaged(): Promise<LintStagedConfig> {
  // Dynamic import via file:// URL so the test works under both ESM and CJS
  // Vitest runtimes regardless of the package's "type" field.
  const mod = (await import(pathToFileURL(LINTSTAGED_PATH).href)) as {
    default: LintStagedConfig;
  };
  return mod.default;
}

describe('integration: fixtures/lintstagedrc.example.js (US-008)', () => {
  it('exists at the documented fixture path', () => {
    expect(existsSync(LINTSTAGED_PATH)).toBe(true);
  });

  it('imports as a valid ES module with a default export object', async () => {
    const cfg = await loadLintStaged();
    expect(cfg).toBeDefined();
    expect(typeof cfg).toBe('object');
    expect(cfg).not.toBeNull();
  });

  it('targets TypeScript files via the *.{ts,tsx} glob', async () => {
    const cfg = await loadLintStaged();
    expect(Object.keys(cfg)).toContain('*.{ts,tsx}');
  });

  it('binds the *.{ts,tsx} glob to an array of shell commands', async () => {
    const cfg = await loadLintStaged();
    const cmds = cfg['*.{ts,tsx}'];
    expect(Array.isArray(cmds)).toBe(true);
    expect((cmds as string[]).length).toBeGreaterThan(0);
    for (const cmd of cmds as string[]) {
      expect(typeof cmd).toBe('string');
      expect(cmd.length).toBeGreaterThan(0);
    }
  });

  it('runs both the fast and deep oxlint presets in sequence', async () => {
    const cfg = await loadLintStaged();
    const cmds = cfg['*.{ts,tsx}'] as string[];
    const fastIdx = cmds.findIndex((c) => /oxlint\.fast\.json/.test(c));
    const deepIdx = cmds.findIndex((c) => /oxlint\.deep\.json/.test(c));
    expect(fastIdx).toBeGreaterThanOrEqual(0);
    expect(deepIdx).toBeGreaterThanOrEqual(0);
    // Fast tier (cheap) before deep tier (expensive) — fail fast on local
    // violations before paying ts-morph project-singleton cost.
    expect(fastIdx).toBeLessThan(deepIdx);
  });

  it('every command invokes the oxlint CLI with --config', async () => {
    const cfg = await loadLintStaged();
    const cmds = cfg['*.{ts,tsx}'] as string[];
    for (const cmd of cmds) {
      expect(cmd).toMatch(/^oxlint\b/);
      expect(cmd).toMatch(/--config\s+\S+/);
    }
  });

  it('the referenced preset filenames resolve to real files in this package', () => {
    expect(existsSync(FAST_CONFIG_PATH)).toBe(true);
    expect(existsSync(DEEP_CONFIG_PATH)).toBe(true);
  });
});

describe('integration: fixtures/claude-md-hook.md (US-007)', () => {
  let body = '';

  beforeAll(() => {
    body = readFileSync(CLAUDE_MD_HOOK_PATH, 'utf8');
  });

  it('exists at the documented fixture path', () => {
    expect(existsSync(CLAUDE_MD_HOOK_PATH)).toBe(true);
  });

  it('declares a PostToolUse hook trigger', () => {
    expect(body).toMatch(/PostToolUse/);
  });

  it('mentions the Write/Edit/MultiEdit tools that fire the hook', () => {
    // The triggers are documented in the inline comment so users know which
    // Claude Code tool calls drive the hook. All three should be referenced.
    expect(body).toMatch(/\bWrite\b/);
    expect(body).toMatch(/\bEdit\b/);
    expect(body).toMatch(/\bMultiEdit\b/);
  });

  it('runs the fast quality-metrics tier (oxlint.fast.json)', () => {
    expect(body).toMatch(/oxlint[^\n]*--config[^\n]*oxlint\.fast\.json/);
  });

  it('does NOT run the deep tier on PostToolUse (deep gates at pre-commit only)', () => {
    // Deep tier (CBO/DIT) is too expensive to run on every file write — it
    // belongs in lint-staged. The Claude Code hook must reference only the
    // fast preset, otherwise per-write latency blows past the spec budget.
    expect(body).not.toMatch(/oxlint[^\n]*--config[^\n]*oxlint\.deep\.json/);
  });

  it('targets TypeScript file extensions (.ts / .tsx)', () => {
    expect(body).toMatch(/\.tsx?\b/);
  });

  it('includes a fenced bash code block with the hook command', () => {
    expect(body).toMatch(/```bash[\s\S]*?oxlint[\s\S]*?```/);
  });
});

describe('integration: presets referenced by hook fixtures', () => {
  it('configs/oxlint.fast.json parses as valid JSON', () => {
    expect(() => JSON.parse(readFileSync(FAST_CONFIG_PATH, 'utf8'))).not.toThrow();
  });

  it('configs/oxlint.deep.json parses as valid JSON', () => {
    expect(() => JSON.parse(readFileSync(DEEP_CONFIG_PATH, 'utf8'))).not.toThrow();
  });

  it('configs/oxlint.fast.json registers the quality-metrics jsPlugin', () => {
    const cfg = JSON.parse(readFileSync(FAST_CONFIG_PATH, 'utf8')) as {
      jsPlugins: string[];
    };
    expect(cfg.jsPlugins).toContain('quality-metrics');
  });

  it('configs/oxlint.deep.json registers the quality-metrics jsPlugin', () => {
    const cfg = JSON.parse(readFileSync(DEEP_CONFIG_PATH, 'utf8')) as {
      jsPlugins: string[];
    };
    expect(cfg.jsPlugins).toContain('quality-metrics');
  });
});
