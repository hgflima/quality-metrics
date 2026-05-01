import { describe, it, expect } from 'vitest';
import plugin, { meta, rules, wmc, halstead, lcom } from '../src/index';
import type { ReportDescriptor, RuleContext } from '../src/types';

/* ──────────────────────────────────────────────────────────────────────── */
/* Plugin shape                                                              */
/* ──────────────────────────────────────────────────────────────────────── */

describe('plugin meta', () => {
  it("declares the plugin namespace as 'quality-metrics'", () => {
    expect(meta.name).toBe('quality-metrics');
  });

  it('exposes a string version', () => {
    expect(typeof meta.version).toBe('string');
    expect(meta.version.length).toBeGreaterThan(0);
  });
});

describe('default export', () => {
  it('bundles meta and rules', () => {
    expect(plugin.meta).toBe(meta);
    expect(plugin.rules).toBe(rules);
  });
});

/* ──────────────────────────────────────────────────────────────────────── */
/* Fast-tier rules wiring                                                    */
/* ──────────────────────────────────────────────────────────────────────── */

describe('fast-tier rule registry', () => {
  it('registers exactly the three fast-tier rules', () => {
    expect(Object.keys(rules).sort()).toEqual(['halstead', 'lcom', 'wmc']);
  });

  it('does NOT yet expose deep-tier rules (cbo, dit) — wired in TASK-024', () => {
    expect(rules).not.toHaveProperty('cbo');
    expect(rules).not.toHaveProperty('dit');
  });

  it('registers the same rule objects exported from the rules modules', () => {
    expect(rules.wmc).toBe(wmc);
    expect(rules.halstead).toBe(halstead);
    expect(rules.lcom).toBe(lcom);
  });
});

describe('every registered rule has the OXLint/ESLint shape', () => {
  it.each([
    ['wmc', rules.wmc],
    ['halstead', rules.halstead],
    ['lcom', rules.lcom],
  ])('rule %s exposes meta + create()', (_name, rule) => {
    expect(rule).toBeDefined();
    expect(typeof rule.create).toBe('function');
    expect(rule.meta).toBeDefined();
    expect(rule.meta.type).toBe('suggestion');
    expect(rule.meta.docs?.description).toMatch(/.+/);
    expect(Array.isArray(rule.meta.schema)).toBe(true);
  });
});

/* ──────────────────────────────────────────────────────────────────────── */
/* End-to-end smoke: each rule fires through the registry                    */
/* ──────────────────────────────────────────────────────────────────────── */

interface CapturedReport extends ReportDescriptor {}

function makeContext(options: unknown[] = []): {
  context: RuleContext;
  reports: CapturedReport[];
} {
  const reports: CapturedReport[] = [];
  const context: RuleContext = {
    report(descriptor) {
      reports.push(descriptor);
    },
    getFilename() {
      return '<test>';
    },
    options,
  };
  return { context, reports };
}

const id = (name: string) => ({ type: 'Identifier', name });
const lit = (value: unknown) => ({ type: 'Literal', value });
const block = (...body: unknown[]) => ({ type: 'BlockStatement', body });

function fnExpr(...body: unknown[]): unknown {
  return {
    type: 'FunctionExpression',
    id: null,
    params: [],
    body: block(...body),
  };
}

function methodDef(name: string, value: unknown): unknown {
  return {
    type: 'MethodDefinition',
    kind: 'method',
    key: id(name),
    computed: false,
    static: false,
    value,
  };
}

function ifWith(testNode: unknown): unknown {
  return {
    type: 'IfStatement',
    test: testNode,
    consequent: block(),
    alternate: null,
  };
}

describe('rules fire end-to-end via the registry', () => {
  it('wmc reports a class whose summed CC exceeds the configured max', () => {
    // Build a class with one method whose CC = 4 (3 ifs + 1) — over max=2.
    const method = methodDef(
      'tangled',
      fnExpr(ifWith(lit(true)), ifWith(lit(true)), ifWith(lit(true))),
    );
    const klass = {
      type: 'ClassDeclaration',
      id: id('Big'),
      body: { type: 'ClassBody', body: [method] },
    };

    const { context, reports } = makeContext([{ max: 2 }]);
    const visitors = rules.wmc.create(context);
    visitors.ClassDeclaration(klass);

    expect(reports).toHaveLength(1);
    expect(reports[0]!.message).toContain("Class 'Big' has WMC of 4 (max: 2)");
  });

  it('halstead reports a function whose volume exceeds a tiny configured max', () => {
    // Body: `a + b;` — a couple of operators/operands, enough to exceed maxVolume=0.
    const expression = {
      type: 'ExpressionStatement',
      expression: {
        type: 'BinaryExpression',
        operator: '+',
        left: id('a'),
        right: id('b'),
      },
    };
    const fn = {
      type: 'FunctionDeclaration',
      id: id('add'),
      params: [],
      body: block(expression),
    };

    const { context, reports } = makeContext([{ maxVolume: 0, maxEffort: 1e9 }]);
    const visitors = rules.halstead.create(context);
    visitors.FunctionDeclaration(fn);

    expect(reports).toHaveLength(1);
    expect(reports[0]!.message).toContain("Function 'add' exceeds Halstead thresholds");
  });

  it('lcom reports a class whose two methods touch disjoint instance state', () => {
    // Two methods, each touches a different `this.X` — one unrelated pair → LCOM=1.
    const memberAccess = (prop: string) => ({
      type: 'ExpressionStatement',
      expression: {
        type: 'MemberExpression',
        object: { type: 'ThisExpression' },
        property: id(prop),
        computed: false,
      },
    });
    const klass = {
      type: 'ClassDeclaration',
      id: id('Split'),
      body: {
        type: 'ClassBody',
        body: [
          methodDef('a', fnExpr(memberAccess('x'))),
          methodDef('b', fnExpr(memberAccess('y'))),
        ],
      },
    };

    const { context, reports } = makeContext([{ maxLcom: 0 }]);
    const visitors = rules.lcom.create(context);
    visitors.ClassDeclaration(klass);

    expect(reports).toHaveLength(1);
    expect(reports[0]!.message).toContain("Class 'Split' has LCOM of 1 (max: 0)");
    expect(reports[0]!.message).toContain('(a, b)');
  });
});
