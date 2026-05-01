/**
 * Integration tests — hook wiring fixtures.
 *
 * Validates the three shipping fixtures users wire into their projects:
 *
 * - `fixtures/lintstagedrc.example.js` — pre-commit gate
 * - `fixtures/claude-settings.example.json` — Claude Code PostToolUse hook
 * - `fixtures/post-edit.example.sh` — script the hook invokes
 *
 * Full `git commit` shell integration with the real `oxlint` binary is
 * intentionally out of scope here — it requires an `oxlint` install plus a
 * scratch git repo and lives in CI. These tests instead verify the contract
 * the fixtures encode: the lint-staged config exports a valid module shape
 * that targets `*.{ts,tsx}` and references both shipping presets, the
 * `.claude/settings.json` snippet declares a PostToolUse hook on
 * Write/Edit/MultiEdit pointing at a `.sh` script, and the script itself
 * runs the fast preset (and only the fast preset).
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const LINTSTAGED_PATH = resolve(ROOT, 'fixtures/lintstagedrc.example.js');
const CLAUDE_SETTINGS_PATH = resolve(ROOT, 'fixtures/claude-settings.example.json');
const POST_EDIT_SCRIPT_PATH = resolve(ROOT, 'fixtures/post-edit.example.sh');
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

interface ClaudeHookEntry {
  matcher?: string;
  hooks?: { type?: string; command?: string }[];
}
interface ClaudeSettings {
  hooks?: { PostToolUse?: ClaudeHookEntry[] };
}

describe('integration: fixtures/claude-settings.example.json + post-edit.example.sh', () => {
  let settings: ClaudeSettings = {};
  let script = '';

  beforeAll(() => {
    settings = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, 'utf8')) as ClaudeSettings;
    script = readFileSync(POST_EDIT_SCRIPT_PATH, 'utf8');
  });

  it('both fixtures exist at the documented paths', () => {
    expect(existsSync(CLAUDE_SETTINGS_PATH)).toBe(true);
    expect(existsSync(POST_EDIT_SCRIPT_PATH)).toBe(true);
  });

  it('claude-settings.example.json parses as valid JSON', () => {
    expect(() => JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, 'utf8'))).not.toThrow();
  });

  it('declares at least one PostToolUse hook entry', () => {
    const entries = settings.hooks?.PostToolUse;
    expect(Array.isArray(entries)).toBe(true);
    expect((entries ?? []).length).toBeGreaterThan(0);
  });

  it('matcher covers Write, Edit, and MultiEdit tool calls', () => {
    // Claude Code matches the tool name against the regex in `matcher`. The
    // hook must fire on all three write-class tools or agents using one of
    // the missing ones bypass the lint gate silently.
    const entries = settings.hooks?.PostToolUse ?? [];
    const matches = (tool: string) =>
      entries.some((e) => e.matcher !== undefined && new RegExp(e.matcher).test(tool));
    expect(matches('Write')).toBe(true);
    expect(matches('Edit')).toBe(true);
    expect(matches('MultiEdit')).toBe(true);
  });

  it('wires at least one entry to a .sh command', () => {
    const entries = settings.hooks?.PostToolUse ?? [];
    const cmds = entries.flatMap((e) => (e.hooks ?? []).map((h) => h.command ?? ''));
    expect(cmds.some((c) => /\.sh\b/.test(c))).toBe(true);
  });

  it('post-edit.example.sh starts with a bash shebang', () => {
    expect(script).toMatch(/^#!\/(usr\/bin\/env bash|bin\/bash)\b/);
  });

  it('script runs the fast quality-metrics tier (oxlint.fast.json)', () => {
    expect(script).toMatch(/oxlint[^\n]*--config[^\n]*oxlint\.fast\.json/);
  });

  it('script does NOT run the deep tier on PostToolUse (deep gates at pre-commit only)', () => {
    // Deep tier (CBO/DIT) is too expensive to run on every file write — it
    // belongs in lint-staged. The Claude Code hook must reference only the
    // fast preset, otherwise per-write latency blows past the spec budget.
    expect(script).not.toMatch(/oxlint[^\n]*--config[^\n]*oxlint\.deep\.json/);
  });

  it('script filters by TypeScript file extensions (.ts / .tsx)', () => {
    expect(script).toMatch(/\.tsx?\b/);
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
