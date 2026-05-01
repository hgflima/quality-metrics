import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { rules } from '../../src/index';

/**
 * Validates the shape of the published `configs/oxlint.fast.json` preset.
 *
 * The preset is consumed by OXLint (and ESLint as fallback) at runtime — its
 * schema correctness is a public contract. These tests guard against typos
 * in rule keys, severity values, and option fields that would silently
 * disable rules on consumer projects.
 *
 * Source of truth for the expected shape:
 * docs/mvp/03-technical-architecture.md §"oxlint.fast.json"
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(HERE, '../../configs/oxlint.fast.json');

interface FastConfig {
  $schema: string;
  jsPlugins: string[];
  rules: Record<string, unknown>;
}

function loadConfig(): FastConfig {
  const raw = readFileSync(CONFIG_PATH, 'utf8');
  return JSON.parse(raw) as FastConfig;
}

describe('configs/oxlint.fast.json — file', () => {
  it('exists and parses as JSON', () => {
    expect(() => loadConfig()).not.toThrow();
  });

  it('declares the OXLint configuration $schema reference', () => {
    const cfg = loadConfig();
    expect(typeof cfg.$schema).toBe('string');
    expect(cfg.$schema).toMatch(/oxlint/);
  });

  it("registers the plugin under jsPlugins as 'quality-metrics'", () => {
    const cfg = loadConfig();
    expect(Array.isArray(cfg.jsPlugins)).toBe(true);
    expect(cfg.jsPlugins).toContain('quality-metrics');
  });
});

describe('configs/oxlint.fast.json — rules registry', () => {
  it('contains exactly the three fast-tier rules', () => {
    const cfg = loadConfig();
    const ruleKeys = Object.keys(cfg.rules).sort();
    expect(ruleKeys).toEqual([
      'quality-metrics/halstead',
      'quality-metrics/lcom',
      'quality-metrics/wmc',
    ]);
  });

  it('does not include any deep-tier rules (cbo, dit) — that is the deep preset', () => {
    const cfg = loadConfig();
    expect(cfg.rules).not.toHaveProperty('quality-metrics/cbo');
    expect(cfg.rules).not.toHaveProperty('quality-metrics/dit');
  });

  it('every entry is a [severity, options] tuple', () => {
    const cfg = loadConfig();
    for (const [key, value] of Object.entries(cfg.rules)) {
      expect(Array.isArray(value), `rule ${key} must be an array tuple`).toBe(true);
      const tuple = value as unknown[];
      expect(tuple, `rule ${key} must have length 2`).toHaveLength(2);
      expect(typeof tuple[0], `rule ${key} severity must be a string`).toBe('string');
      expect(['error', 'warn', 'off']).toContain(tuple[0] as string);
      expect(typeof tuple[1], `rule ${key} options must be an object`).toBe('object');
    }
  });
});

/* ──────────────────────────────────────────────────────────────────────── */
/* Per-rule severity + options expectations                                  */
/* ──────────────────────────────────────────────────────────────────────── */

describe('configs/oxlint.fast.json — wmc entry', () => {
  it('uses error severity and the documented max threshold (20)', () => {
    const cfg = loadConfig();
    const entry = cfg.rules['quality-metrics/wmc'] as [string, { max: number }];
    expect(entry[0]).toBe('error');
    expect(entry[1]).toEqual({ max: 20 });
  });

  it('options keys are accepted by the rule schema', () => {
    const cfg = loadConfig();
    const entry = cfg.rules['quality-metrics/wmc'] as [string, Record<string, unknown>];
    const allowed = Object.keys(
      (rules.wmc.meta.schema[0] as { properties: Record<string, unknown> }).properties,
    );
    for (const key of Object.keys(entry[1])) {
      expect(allowed, `wmc option '${key}' must be defined in rule schema`).toContain(key);
    }
  });
});

describe('configs/oxlint.fast.json — halstead entry', () => {
  it('uses warn severity and the documented Volume/Effort thresholds', () => {
    const cfg = loadConfig();
    const entry = cfg.rules['quality-metrics/halstead'] as [
      string,
      { maxVolume: number; maxEffort: number },
    ];
    expect(entry[0]).toBe('warn');
    expect(entry[1]).toEqual({ maxVolume: 1000, maxEffort: 400 });
  });

  it('options keys are accepted by the rule schema', () => {
    const cfg = loadConfig();
    const entry = cfg.rules['quality-metrics/halstead'] as [string, Record<string, unknown>];
    const allowed = Object.keys(
      (rules.halstead.meta.schema[0] as { properties: Record<string, unknown> }).properties,
    );
    for (const key of Object.keys(entry[1])) {
      expect(allowed, `halstead option '${key}' must be defined in rule schema`).toContain(key);
    }
  });
});

describe('configs/oxlint.fast.json — lcom entry', () => {
  it('uses warn severity and a small non-zero maxLcom (2) per the architecture doc', () => {
    const cfg = loadConfig();
    const entry = cfg.rules['quality-metrics/lcom'] as [string, { maxLcom: number }];
    expect(entry[0]).toBe('warn');
    expect(entry[1]).toEqual({ maxLcom: 2 });
  });

  it('options keys are accepted by the rule schema', () => {
    const cfg = loadConfig();
    const entry = cfg.rules['quality-metrics/lcom'] as [string, Record<string, unknown>];
    const allowed = Object.keys(
      (rules.lcom.meta.schema[0] as { properties: Record<string, unknown> }).properties,
    );
    for (const key of Object.keys(entry[1])) {
      expect(allowed, `lcom option '${key}' must be defined in rule schema`).toContain(key);
    }
  });
});
