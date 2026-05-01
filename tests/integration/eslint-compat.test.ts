/**
 * Integration tests — ESLint v9/v10 flat-config compatibility.
 *
 * Covers:
 *   - E2E-015: ESLint flat config loads the plugin and fires `quality-metrics/wmc`
 *     and `quality-metrics/lcom` against TypeScript-compatible source code.
 *   - E2E-016: The plugin's rule namespace prevents double-firing with
 *     `eslint-plugin-oxlint`. Since `quality-metrics/*` is plugin-only on both
 *     OXLint and ESLint sides (not a native OXLint rule), each rule fires
 *     exactly once per linter.
 *
 * The end-to-end fixture coverage for individual rules lives in
 * `tests/rules/*.test.ts`. These integration tests verify the wiring through
 * a real `Linter` instance — they're a smoke test that the plugin object shape,
 * rule schemas, and `context.report()` semantics are compatible with the
 * upstream ESLint runtime.
 */
import { describe, it, expect } from 'vitest';
import { Linter } from 'eslint';
import plugin, { meta, rules } from '../../src/index';

const FLAT_CONFIG_BASE = {
  // ESLint v9+ flat config matches files against this pattern; without it,
  // `Linter.verify()` skips the file with "No matching configuration found".
  files: ['**/*.ts', '**/*.js'],
  plugins: { 'quality-metrics': plugin },
  languageOptions: {
    ecmaVersion: 2022 as const,
    sourceType: 'module' as const,
  },
} as const;

describe('integration: ESLint flat config compatibility (E2E-015)', () => {
  it('plugin loads through ESLint without fatal errors', () => {
    const linter = new Linter();
    const messages = linter.verify(
      '// empty source',
      {
        ...FLAT_CONFIG_BASE,
        rules: { 'quality-metrics/wmc': ['error', { max: 20 }] },
      } as never,
      'empty.ts',
    );
    expect(messages.filter((m) => m.fatal)).toEqual([]);
  });

  it('fires quality-metrics/wmc when WMC exceeds threshold', () => {
    const linter = new Linter();
    // OrderService source mirrors `tests/fixtures/wmc/high-wmc.ts` (E2E-001).
    // Hand-computed WMC = 17 (validate=3, create=5, update=4, delete=2, list=3).
    const source = `
class OrderService {
  validate(x) {
    if (x > 0) {
      if (x < 100) return true;
    }
    return false;
  }
  create(type) {
    switch(type) {
      case 'a': break;
      case 'b': break;
      case 'c': break;
      case 'd': break;
    }
  }
  update(id, data) {
    if (!id) return;
    if (!data) return;
    if (data.locked) return;
    return data;
  }
  delete(id) {
    if (!id) throw new Error();
  }
  list(page) {
    if (page < 1) page = 1;
    if (page > 100) page = 100;
    return page;
  }
}
`;
    const messages = linter.verify(
      source,
      {
        ...FLAT_CONFIG_BASE,
        rules: { 'quality-metrics/wmc': ['error', { max: 15 }] },
      } as never,
      'order-service.ts',
    );
    const wmcMessages = messages.filter((m) => m.ruleId === 'quality-metrics/wmc');
    expect(wmcMessages).toHaveLength(1);
    expect(wmcMessages[0]?.message).toContain("Class 'OrderService' has WMC of 17 (max: 15)");
    expect(wmcMessages[0]?.severity).toBe(2);
    expect(wmcMessages[0]?.fatal).not.toBe(true);
  });

  it('does not fire quality-metrics/wmc when WMC is below threshold (E2E-002)', () => {
    const linter = new Linter();
    const source = `
class OrderService {
  validate(x) {
    if (x > 0) {
      if (x < 100) return true;
    }
    return false;
  }
  create(type) {
    switch(type) {
      case 'a': break;
      case 'b': break;
      case 'c': break;
      case 'd': break;
    }
  }
  update(id, data) {
    if (!id) return;
    if (!data) return;
    if (data.locked) return;
    return data;
  }
  delete(id) {
    if (!id) throw new Error();
  }
  list(page) {
    if (page < 1) page = 1;
    if (page > 100) page = 100;
    return page;
  }
}
`;
    const messages = linter.verify(
      source,
      {
        ...FLAT_CONFIG_BASE,
        rules: { 'quality-metrics/wmc': ['error', { max: 20 }] },
      } as never,
      'order-service.ts',
    );
    const wmcMessages = messages.filter((m) => m.ruleId === 'quality-metrics/wmc');
    expect(wmcMessages).toEqual([]);
  });

  it('fires quality-metrics/lcom on a class with three disjoint method groups (E2E-005)', () => {
    const linter = new Linter();
    // MixedService source mirrors `tests/fixtures/lcom/low-cohesion.ts`.
    // Each method touches one distinct `this.X` → P=3, Q=0 → LCOM = 3.
    const source = `
class MixedService {
  saveUser(user) {
    this.db.save(user);
  }
  sendWelcome(email) {
    this.mailer.send(email);
  }
  invalidateSession(id) {
    this.cache.delete(id);
  }
}
`;
    const messages = linter.verify(
      source,
      {
        ...FLAT_CONFIG_BASE,
        rules: { 'quality-metrics/lcom': ['warn', { maxLcom: 0 }] },
      } as never,
      'mixed-service.ts',
    );
    const lcomMessages = messages.filter((m) => m.ruleId === 'quality-metrics/lcom');
    expect(lcomMessages).toHaveLength(1);
    expect(lcomMessages[0]?.message).toContain("Class 'MixedService' has LCOM of 3 (max: 0)");
    expect(lcomMessages[0]?.severity).toBe(1);
    expect(lcomMessages[0]?.fatal).not.toBe(true);
  });

  it('fires both WMC and LCOM in a single verify pass on the same source', () => {
    const linter = new Linter();
    // Three disjoint methods (LCOM = 3) — pump one over WMC threshold.
    const source = `
class MixedService {
  saveUser(user) {
    this.db.save(user);
    if (user.id) {
      if (user.email) {
        if (user.age) return true;
      }
    }
  }
  sendWelcome(email) {
    this.mailer.send(email);
    if (!email) return;
    if (email.length > 100) return;
  }
  invalidateSession(id) {
    this.cache.delete(id);
    if (!id) return;
  }
}
`;
    const messages = linter.verify(
      source,
      {
        ...FLAT_CONFIG_BASE,
        rules: {
          'quality-metrics/wmc': ['error', { max: 5 }],
          'quality-metrics/lcom': ['warn', { maxLcom: 0 }],
        },
      } as never,
      'mixed.ts',
    );
    const wmc = messages.filter((m) => m.ruleId === 'quality-metrics/wmc');
    const lcom = messages.filter((m) => m.ruleId === 'quality-metrics/lcom');
    expect(wmc).toHaveLength(1);
    expect(lcom).toHaveLength(1);
    expect(wmc[0]?.message).toContain("Class 'MixedService' has WMC of");
    expect(lcom[0]?.message).toContain("Class 'MixedService' has LCOM of 3");
  });

  it('emits zero diagnostics when no thresholds are breached (E2E-004)', () => {
    const linter = new Linter();
    const source = 'function add(a, b) { return a + b; }';
    const messages = linter.verify(
      source,
      {
        ...FLAT_CONFIG_BASE,
        rules: {
          'quality-metrics/wmc': ['error', { max: 20 }],
          'quality-metrics/halstead': ['warn', { maxVolume: 1000, maxEffort: 400 }],
          'quality-metrics/lcom': ['warn', { maxLcom: 2 }],
        },
      } as never,
      'add.ts',
    );
    expect(messages.filter((m) => !m.fatal)).toEqual([]);
  });

  it('passes structured options through ESLint to the rule (schema validation succeeds)', () => {
    const linter = new Linter();
    // Each fast-tier rule accepts its option schema.
    const source = 'function noop() {}';
    const messages = linter.verify(
      source,
      {
        ...FLAT_CONFIG_BASE,
        rules: {
          'quality-metrics/wmc': ['error', { max: 25 }],
          'quality-metrics/halstead': ['warn', { maxVolume: 2000, maxEffort: 800 }],
          'quality-metrics/lcom': ['warn', { maxLcom: 3 }],
        },
      } as never,
      'noop.ts',
    );
    expect(messages.filter((m) => m.fatal)).toEqual([]);
  });
});

describe('integration: plugin namespace prevents OXLint double-fire (E2E-016)', () => {
  it('plugin meta declares "quality-metrics" namespace — distinct from native OXLint rules', () => {
    expect(meta.name).toBe('quality-metrics');
    // Native OXLint rule namespaces (eslint, typescript, unicorn, react, etc.)
    // never collide with our prefix. eslint-plugin-oxlint disables ESLint-side
    // rules whose names match OXLint's native categories — `quality-metrics/*`
    // is plugin-only and not on that list, so each rule fires exactly once.
    expect(meta.name).not.toMatch(
      /^(eslint|typescript|oxc|unicorn|jsx-a11y|react|react-hooks|n|node|import|promise|jest|vitest|nextjs)$/,
    );
  });

  it('every rule key is the bare short name (no namespace prefix in the registry)', () => {
    for (const key of Object.keys(rules)) {
      // Keys are looked up as `<plugin-name>/<key>`. The key itself must be
      // bare — namespacing is provided by the plugin object key, not the rule
      // identifier inside it.
      expect(key).not.toMatch(/\//);
      expect(key).not.toMatch(/^quality-metrics-/);
    }
  });

  it('rule namespace yields a single diagnostic per violation through ESLint (no duplicates)', () => {
    const linter = new Linter();
    // If the namespace were ambiguous, the same rule would register twice
    // and fire twice on the same node. Verify exactly one diagnostic per
    // violating class.
    const source = `
class TooBig {
  m1() { if (1) {} if (1) {} if (1) {} }
  m2() { if (1) {} if (1) {} if (1) {} }
  m3() { if (1) {} if (1) {} if (1) {} }
}
`;
    const messages = linter.verify(
      source,
      {
        ...FLAT_CONFIG_BASE,
        rules: { 'quality-metrics/wmc': ['error', { max: 5 }] },
      } as never,
      'too-big.ts',
    );
    const wmcMessages = messages.filter((m) => m.ruleId === 'quality-metrics/wmc');
    expect(wmcMessages).toHaveLength(1);
  });
});
