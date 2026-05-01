import { describe, it, expect } from 'vitest';
import { halstead } from '../../src/rules/halstead';
import { computeHalstead } from '../../src/utils/halstead';
import type { ReportDescriptor, RuleContext } from '../../src/types';

/* ──────────────────────────────────────────────────────────────────────── */
/* Test scaffolding                                                          */
/* ──────────────────────────────────────────────────────────────────────── */

interface CapturedReport extends ReportDescriptor {}

function makeContext(options: unknown[] = []): {
  context: RuleContext;
  reports: CapturedReport[];
} {
  const reports: CapturedReport[] = [];
  const context: RuleContext = {
    report(descriptor: ReportDescriptor): void {
      reports.push(descriptor);
    },
    getFilename(): string {
      return '<test>';
    },
    options,
  };
  return { context, reports };
}

/**
 * Dispatch a single AST node into the rule's matching visitor. Mirrors the
 * scaffold from `tests/rules/wmc.test.ts` so test setup stays consistent
 * across rule suites.
 */
function runOn(node: unknown, options: unknown[] = []): CapturedReport[] {
  const { context, reports } = makeContext(options);
  const visitors = halstead.create(context);
  if (!node || typeof node !== 'object') return reports;
  const t = (node as { type?: string }).type;
  if (t === 'FunctionDeclaration') visitors.FunctionDeclaration(node);
  else if (t === 'FunctionExpression') visitors.FunctionExpression(node);
  else if (t === 'ArrowFunctionExpression') visitors.ArrowFunctionExpression(node);
  return reports;
}

/* ──────────────────────────────────────────────────────────────────────── */
/* AST construction helpers                                                  */
/* ──────────────────────────────────────────────────────────────────────── */

const id = (name: string) => ({ type: 'Identifier', name });
const lit = (value: unknown) => ({ type: 'Literal', value });
const block = (...body: unknown[]) => ({ type: 'BlockStatement', body });

function fnDecl(name: string | null, params: unknown[], ...body: unknown[]): unknown {
  return {
    type: 'FunctionDeclaration',
    id: name == null ? null : id(name),
    params,
    body: block(...body),
  };
}

function fnExpr(name: string | null, params: unknown[], ...body: unknown[]): unknown {
  return {
    type: 'FunctionExpression',
    id: name == null ? null : id(name),
    params,
    body: block(...body),
  };
}

function arrow(params: unknown[], body: unknown): unknown {
  return {
    type: 'ArrowFunctionExpression',
    params,
    body,
  };
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Reusable bodies                                                           */
/* ──────────────────────────────────────────────────────────────────────── */

/** `return a + b` — operands a, b and the `+` operator. */
function returnSum(): unknown {
  return {
    type: 'ReturnStatement',
    argument: {
      type: 'BinaryExpression',
      operator: '+',
      left: id('a'),
      right: id('b'),
    },
  };
}

/**
 * Build a function declaration with synthetic high Halstead Effort, big
 * enough to clear the default `maxEffort = 400` threshold. The body chains
 * many distinct identifiers and binary operators so η₁/η₂/N₁/N₂ all grow.
 */
function highEffortFn(name = 'f'): unknown {
  // Build (((((a + b) * c) - d) / e) % g)
  const ids = ['a', 'b', 'c', 'd', 'e', 'g'];
  const ops = ['+', '*', '-', '/', '%'];
  let expr: unknown = id(ids[0]!);
  for (let i = 0; i < ops.length; i++) {
    expr = {
      type: 'BinaryExpression',
      operator: ops[i],
      left: expr,
      right: id(ids[i + 1]!),
    };
  }
  // Repeat the chain a few times so N₁/N₂ grow without inflating distinct counts.
  const stmts: unknown[] = [];
  for (let i = 0; i < 8; i++) {
    stmts.push({ type: 'ExpressionStatement', expression: expr });
  }
  return fnDecl(name, ids.map(id), ...stmts);
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Tests                                                                     */
/* ──────────────────────────────────────────────────────────────────────── */

describe('rules/halstead — basic threshold behavior', () => {
  it('does not report when both Volume and Effort are below thresholds', () => {
    // Tiny add function — V≈20.68, E≈51.71 (well below defaults).
    const node = fnDecl('add', [id('a'), id('b')], returnSum());
    expect(runOn(node)).toEqual([]);
  });

  it('reports when Effort exceeds the default maxEffort=400', () => {
    const node = highEffortFn('compute');
    const reports = runOn(node);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toContain("Function 'compute' exceeds Halstead thresholds.");
    expect(reports[0]?.message).toMatch(/Volume: \d+ \(max: 1000\)/);
    expect(reports[0]?.message).toMatch(/Effort: \d+ \(max: 400\)/);
    expect(reports[0]?.message).toMatch(/Difficulty: \d+(\.\d+)?/);
  });

  it('reports when Volume exceeds threshold but Effort does not', () => {
    // Trigger purely on Volume by setting an absurdly low maxVolume.
    const node = fnDecl('add', [id('a'), id('b')], returnSum());
    const reports = runOn(node, [{ maxVolume: 1, maxEffort: 1_000_000 }]);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toContain('Volume:');
    expect(reports[0]?.message).toContain('(max: 1)');
  });

  it('reports when Effort exceeds threshold but Volume does not', () => {
    const node = fnDecl('add', [id('a'), id('b')], returnSum());
    const reports = runOn(node, [{ maxVolume: 1_000_000, maxEffort: 1 }]);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toContain('Effort:');
    expect(reports[0]?.message).toContain('(max: 1)');
  });

  it('emits a single report when both thresholds are breached simultaneously', () => {
    const node = highEffortFn('beast');
    const reports = runOn(node, [{ maxVolume: 1, maxEffort: 1 }]);
    expect(reports).toHaveLength(1);
  });

  it('does not report when metrics exactly equal the thresholds (strict >)', () => {
    // Compute the function's exact V/E and use them as thresholds. With strict
    // greater-than comparison the rule must stay silent at equality.
    const node = fnDecl('add', [id('a'), id('b')], returnSum());
    const m = computeHalstead(node);
    expect(runOn(node, [{ maxVolume: m.volume, maxEffort: m.effort }])).toEqual([]);
  });
});

describe('rules/halstead — defaults and options', () => {
  it('uses default thresholds when no options are provided', () => {
    const node = highEffortFn('h');
    expect(runOn(node)).toHaveLength(1);
  });

  it('falls back to defaults when options[0] is malformed', () => {
    const node = highEffortFn('h');
    expect(runOn(node, [null])).toHaveLength(1);
    expect(runOn(node, [42])).toHaveLength(1);
    expect(runOn(node, ['nope'])).toHaveLength(1);
  });

  it('respects custom maxVolume / maxEffort values', () => {
    const node = highEffortFn('h');
    // Raise both above the synthetic measurement → no report.
    expect(runOn(node, [{ maxVolume: 100_000, maxEffort: 1_000_000 }])).toEqual([]);
    // Lower them → reports.
    expect(runOn(node, [{ maxVolume: 1, maxEffort: 1 }])).toHaveLength(1);
  });

  it('partial options merge with defaults (missing key keeps default)', () => {
    // Only override maxEffort — maxVolume should keep default of 1000, so a
    // function with V≈20 doesn't trip the volume threshold even though
    // maxEffort was explicitly set.
    const node = fnDecl('add', [id('a'), id('b')], returnSum());
    expect(runOn(node, [{ maxEffort: 1_000_000 }])).toEqual([]);
  });
});

describe('rules/halstead — diagnostic shape', () => {
  it('attaches a structured data payload alongside the formatted message', () => {
    const node = fnDecl('add', [id('a'), id('b')], returnSum());
    const reports = runOn(node, [{ maxVolume: 1, maxEffort: 1 }]);
    expect(reports).toHaveLength(1);
    const data = reports[0]?.data;
    expect(data).toBeDefined();
    expect(data?.['functionName']).toBe('add');
    expect(data?.['maxVolume']).toBe(1);
    expect(data?.['maxEffort']).toBe(1);
    expect(typeof data?.['volume']).toBe('number');
    expect(typeof data?.['effort']).toBe('number');
    expect(typeof data?.['difficulty']).toBe('number');
  });

  it('rounds Volume and Effort to integers and Difficulty to one decimal', () => {
    // simple add: V≈20.68, E≈51.71, D≈2.50 → rounded V=21, E=52, D=2.5
    const node = fnDecl('add', [id('a'), id('b')], returnSum());
    const reports = runOn(node, [{ maxVolume: 1, maxEffort: 1 }]);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.data?.['volume']).toBe(21);
    expect(reports[0]?.data?.['effort']).toBe(52);
    expect(reports[0]?.data?.['difficulty']).toBe(2.5);
    expect(reports[0]?.message).toContain('Volume: 21');
    expect(reports[0]?.message).toContain('Effort: 52');
    expect(reports[0]?.message).toContain('Difficulty: 2.5');
  });

  it('attaches the function node to the report', () => {
    const node = fnDecl('add', [id('a'), id('b')], returnSum());
    const reports = runOn(node, [{ maxVolume: 1, maxEffort: 1 }]);
    expect(reports[0]?.node).toBe(node);
  });
});

describe('rules/halstead — function name resolution', () => {
  it("uses the FunctionDeclaration's own id", () => {
    const node = fnDecl('myFn', [id('a'), id('b')], returnSum());
    const reports = runOn(node, [{ maxVolume: 1, maxEffort: 1 }]);
    expect(reports[0]?.message).toContain("Function 'myFn'");
  });

  it("uses a named FunctionExpression's own id over its parent context", () => {
    const fe = fnExpr('namedFE', [id('a'), id('b')], returnSum()) as Record<string, unknown>;
    // Pretend it's the init of a `const wrong = function namedFE() {}`.
    fe['parent'] = {
      type: 'VariableDeclarator',
      id: id('wrong'),
      init: fe,
    };
    const reports = runOn(fe, [{ maxVolume: 1, maxEffort: 1 }]);
    expect(reports[0]?.message).toContain("Function 'namedFE'");
  });

  it('derives name from a VariableDeclarator parent for an anonymous arrow', () => {
    const a = arrow([id('a'), id('b')], returnSum()) as Record<string, unknown>;
    a['parent'] = {
      type: 'VariableDeclarator',
      id: id('addArrow'),
      init: a,
    };
    const reports = runOn(a, [{ maxVolume: 1, maxEffort: 1 }]);
    expect(reports[0]?.message).toContain("Function 'addArrow'");
  });

  it('derives name from a MethodDefinition parent', () => {
    const fe = fnExpr(null, [id('a'), id('b')], returnSum()) as Record<string, unknown>;
    fe['parent'] = {
      type: 'MethodDefinition',
      key: id('greet'),
      value: fe,
      kind: 'method',
      computed: false,
      static: false,
    };
    const reports = runOn(fe, [{ maxVolume: 1, maxEffort: 1 }]);
    expect(reports[0]?.message).toContain("Function 'greet'");
  });

  it('derives name from a PropertyDefinition parent (class field arrow)', () => {
    const a = arrow([id('a'), id('b')], returnSum()) as Record<string, unknown>;
    a['parent'] = {
      type: 'PropertyDefinition',
      key: id('handle'),
      value: a,
      computed: false,
      static: false,
    };
    const reports = runOn(a, [{ maxVolume: 1, maxEffort: 1 }]);
    expect(reports[0]?.message).toContain("Function 'handle'");
  });

  it('derives name from a Property parent (object literal)', () => {
    const fe = fnExpr(null, [id('a'), id('b')], returnSum()) as Record<string, unknown>;
    fe['parent'] = {
      type: 'Property',
      kind: 'init',
      key: id('helper'),
      value: fe,
      shorthand: false,
      computed: false,
      method: false,
    };
    const reports = runOn(fe, [{ maxVolume: 1, maxEffort: 1 }]);
    expect(reports[0]?.message).toContain("Function 'helper'");
  });

  it('derives name from an AssignmentExpression to an Identifier', () => {
    const a = arrow([id('a'), id('b')], returnSum()) as Record<string, unknown>;
    a['parent'] = {
      type: 'AssignmentExpression',
      operator: '=',
      left: id('reassigned'),
      right: a,
    };
    const reports = runOn(a, [{ maxVolume: 1, maxEffort: 1 }]);
    expect(reports[0]?.message).toContain("Function 'reassigned'");
  });

  it('derives name from an AssignmentExpression to a MemberExpression', () => {
    const a = arrow([id('a'), id('b')], returnSum()) as Record<string, unknown>;
    a['parent'] = {
      type: 'AssignmentExpression',
      operator: '=',
      left: {
        type: 'MemberExpression',
        object: id('module'),
        property: id('exports'),
        computed: false,
        optional: false,
      },
      right: a,
    };
    const reports = runOn(a, [{ maxVolume: 1, maxEffort: 1 }]);
    expect(reports[0]?.message).toContain("Function 'exports'");
  });

  it('uses # prefix for PrivateIdentifier method names', () => {
    const fe = fnExpr(null, [id('a'), id('b')], returnSum()) as Record<string, unknown>;
    fe['parent'] = {
      type: 'MethodDefinition',
      key: { type: 'PrivateIdentifier', name: 'secret' },
      value: fe,
      kind: 'method',
      computed: false,
      static: false,
    };
    const reports = runOn(fe, [{ maxVolume: 1, maxEffort: 1 }]);
    expect(reports[0]?.message).toContain("Function '#secret'");
  });

  it('uses string-literal value for computed string keys on MethodDefinition', () => {
    const fe = fnExpr(null, [id('a'), id('b')], returnSum()) as Record<string, unknown>;
    fe['parent'] = {
      type: 'MethodDefinition',
      key: lit('weird-name'),
      value: fe,
      kind: 'method',
      computed: true,
      static: false,
    };
    const reports = runOn(fe, [{ maxVolume: 1, maxEffort: 1 }]);
    expect(reports[0]?.message).toContain("Function 'weird-name'");
  });

  it('falls back to <anonymous> for an arrow with no parent context', () => {
    const a = arrow([id('a'), id('b')], returnSum());
    const reports = runOn(a, [{ maxVolume: 1, maxEffort: 1 }]);
    expect(reports[0]?.message).toContain("Function '<anonymous>'");
  });

  it('falls back to <anonymous> for unknown parent shapes', () => {
    const a = arrow([id('a'), id('b')], returnSum()) as Record<string, unknown>;
    a['parent'] = { type: 'CallExpression' };
    const reports = runOn(a, [{ maxVolume: 1, maxEffort: 1 }]);
    expect(reports[0]?.message).toContain("Function '<anonymous>'");
  });
});

describe('rules/halstead — visitor wiring', () => {
  it('exposes visitors for all three function-like types', () => {
    const { context } = makeContext();
    const visitors = halstead.create(context);
    expect(typeof visitors.FunctionDeclaration).toBe('function');
    expect(typeof visitors.FunctionExpression).toBe('function');
    expect(typeof visitors.ArrowFunctionExpression).toBe('function');
  });

  it('measures FunctionExpression independently', () => {
    const fe = fnExpr('inner', [id('a'), id('b')], returnSum());
    expect(runOn(fe, [{ maxVolume: 1, maxEffort: 1 }])).toHaveLength(1);
  });

  it('measures ArrowFunctionExpression independently', () => {
    const a = arrow([id('a'), id('b')], returnSum());
    expect(runOn(a, [{ maxVolume: 1, maxEffort: 1 }])).toHaveLength(1);
  });

  it('does not include nested function tokens in the outer measurement', () => {
    // Outer fn returns nothing notable; inner arrow has the heavy chain.
    // When the rule visits the outer, the helper stops at the nested boundary,
    // so the outer Volume/Effort comes only from the outer skeleton.
    const inner = highEffortFn('inner');
    const outer = fnDecl(
      'outer',
      [],
      {
        type: 'VariableDeclaration',
        kind: 'const',
        declarations: [
          { type: 'VariableDeclarator', id: id('cb'), init: inner },
        ],
      },
    );
    // Outer should NOT exceed the default thresholds — its own tokens are
    // tiny; the inner is skipped by the helper boundary.
    expect(runOn(outer)).toEqual([]);
  });
});

describe('rules/halstead — fixture parity', () => {
  it('simple-fn fixture: function add(a, b) { return a + b } stays silent at defaults', () => {
    // Exact AST mirror of tests/fixtures/halstead/simple-fn.ts (types stripped).
    const node = fnDecl('add', [id('a'), id('b')], returnSum());
    expect(runOn(node)).toEqual([]);
  });

  it('arrow-fn fixture (arrow alone): stays silent at defaults', () => {
    // The arrow on its own: V≈9.5, E≈small — no report.
    const a = arrow([id('a'), id('b')], {
      type: 'BinaryExpression',
      operator: '+',
      left: id('a'),
      right: id('b'),
    });
    expect(runOn(a)).toEqual([]);
  });

  it('high-effort function exceeds default Effort threshold and reports', () => {
    // Stand-in for the complex-fn fixture's qualitative behaviour: a
    // function whose Effort breaches the default maxEffort=400 threshold.
    const node = highEffortFn('processPayment');
    const reports = runOn(node);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toContain("Function 'processPayment'");
    // Confirm the message reports the rounded effort vs. the max.
    expect(reports[0]?.message).toMatch(/Effort: \d+ \(max: 400\)/);
    // Effort metric in the structured payload must be a finite number > 400.
    const effort = reports[0]?.data?.['effort'];
    expect(typeof effort).toBe('number');
    expect(effort as number).toBeGreaterThan(400);
  });
});
