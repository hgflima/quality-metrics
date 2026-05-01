import { describe, it, expect } from 'vitest';
import { lcom } from '../../src/rules/lcom';
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

function runOn(node: unknown, options: unknown[] = []): CapturedReport[] {
  const { context, reports } = makeContext(options);
  const visitors = lcom.create(context);
  if (!node || typeof node !== 'object') return reports;
  const t = (node as { type?: string }).type;
  if (t === 'ClassDeclaration') visitors.ClassDeclaration(node);
  else if (t === 'ClassExpression') visitors.ClassExpression(node);
  return reports;
}

/* ──────────────────────────────────────────────────────────────────────── */
/* AST construction helpers                                                  */
/* ──────────────────────────────────────────────────────────────────────── */

const id = (name: string) => ({ type: 'Identifier', name });
const lit = (value: unknown) => ({ type: 'Literal', value });
const block = (...body: unknown[]) => ({ type: 'BlockStatement', body });
const thisExpr = () => ({ type: 'ThisExpression' });

const thisDot = (prop: string) => ({
  type: 'MemberExpression',
  object: thisExpr(),
  property: id(prop),
  computed: false,
  optional: false,
});

const exprStmt = (expression: unknown) => ({
  type: 'ExpressionStatement',
  expression,
});

function fnExpr(...body: unknown[]): unknown {
  return {
    type: 'FunctionExpression',
    params: [],
    body: block(...body),
  };
}

function arrow(body: unknown): unknown {
  return {
    type: 'ArrowFunctionExpression',
    params: [],
    body,
  };
}

function methodDef(name: string, value: unknown, kind = 'method'): unknown {
  return {
    type: 'MethodDefinition',
    key: id(name),
    value,
    kind,
    computed: false,
    static: false,
  };
}

function propertyDef(name: string, value: unknown): unknown {
  return {
    type: 'PropertyDefinition',
    key: id(name),
    value,
    computed: false,
    static: false,
  };
}

function classDecl(name: string | null, ...members: unknown[]): unknown {
  return {
    type: 'ClassDeclaration',
    id: name == null ? null : id(name),
    superClass: null,
    body: { type: 'ClassBody', body: members },
  };
}

/** A method whose body just touches each of the named `this.X` properties. */
function methodAccessing(name: string, ...props: string[]): unknown {
  const body = props.map((p) => exprStmt(thisDot(p)));
  return methodDef(name, fnExpr(...body));
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Tests                                                                     */
/* ──────────────────────────────────────────────────────────────────────── */

describe('rules/lcom — basic behavior', () => {
  it('does not report when class has no methods', () => {
    expect(runOn(classDecl('Empty'))).toEqual([]);
  });

  it('does not report when class has only one method (no pairs to evaluate)', () => {
    // Mirrors the single-method fixture (Greeter / `this.name`).
    const node = classDecl('Greeter', methodAccessing('greet', 'name'));
    expect(runOn(node)).toEqual([]);
  });

  it('does not report when class has only non-function PropertyDefinitions', () => {
    const node = classDecl('OnlyData', propertyDef('count', lit(0)), propertyDef('name', lit('x')));
    expect(runOn(node)).toEqual([]);
  });

  it('does not report when LCOM equals the threshold', () => {
    // Two methods sharing nothing → P=1, Q=0, LCOM=1.
    const node = classDecl('Foo', methodAccessing('a', 'x'), methodAccessing('b', 'y'));
    expect(runOn(node, [{ maxLcom: 1 }])).toEqual([]);
  });

  it('reports when LCOM exceeds the threshold', () => {
    const node = classDecl('Foo', methodAccessing('a', 'x'), methodAccessing('b', 'y'));
    const reports = runOn(node, [{ maxLcom: 0 }]);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toContain("Class 'Foo' has LCOM of 1 (max: 0)");
    expect(reports[0]?.message).toContain('(a, b)');
  });

  it('does not report when all method pairs share a property (Q dominates)', () => {
    // High-cohesion shape: every method touches `count`. C(4,2)=6 pairs all
    // share → P=0, Q=6 → LCOM=max(0-6,0)=0.
    const node = classDecl(
      'Counter',
      methodAccessing('increment', 'count'),
      methodAccessing('decrement', 'count'),
      methodAccessing('reset', 'count'),
      methodAccessing('getValue', 'count'),
    );
    expect(runOn(node)).toEqual([]);
  });
});

describe('rules/lcom — defaults and options', () => {
  it('uses default maxLcom=0 when no options are provided', () => {
    const node = classDecl('Foo', methodAccessing('a', 'x'), methodAccessing('b', 'y'));
    const reports = runOn(node);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toContain('LCOM of 1 (max: 0)');
  });

  it('uses default maxLcom=0 when options[0] is null/non-object', () => {
    const node = classDecl('Foo', methodAccessing('a', 'x'), methodAccessing('b', 'y'));
    expect(runOn(node, [null])).toHaveLength(1);
    expect(runOn(node, [42])).toHaveLength(1);
    expect(runOn(node, ['nope'])).toHaveLength(1);
  });

  it('respects custom maxLcom from options', () => {
    // Three pairwise-disjoint methods → P=3, Q=0, LCOM=3.
    const node = classDecl(
      'Three',
      methodAccessing('a', 'x'),
      methodAccessing('b', 'y'),
      methodAccessing('c', 'z'),
    );
    expect(runOn(node, [{ maxLcom: 3 }])).toEqual([]);
    expect(runOn(node, [{ maxLcom: 2 }])).toHaveLength(1);
  });

  it('merges partial options with defaults', () => {
    const node = classDecl('Foo', methodAccessing('a', 'x'), methodAccessing('b', 'y'));
    // Empty object → falls back to default maxLcom=0.
    const reports = runOn(node, [{}]);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toContain('(max: 0)');
  });

  it('attaches structured data alongside the formatted message', () => {
    const node = classDecl('Foo', methodAccessing('a', 'x'), methodAccessing('b', 'y'));
    const reports = runOn(node, [{ maxLcom: 0 }]);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.data).toEqual({
      className: 'Foo',
      lcom: 1,
      max: 0,
      pairs: '(a, b)',
    });
  });
});

describe('rules/lcom — fixture parity', () => {
  it('low-cohesion fixture: 3 methods, 3 disjoint pairs → LCOM=3, reports', () => {
    // Mirrors tests/fixtures/lcom/low-cohesion.ts
    //   saveUser → {db}, sendWelcome → {mailer}, invalidateSession → {cache}
    const node = classDecl(
      'MixedService',
      methodAccessing('saveUser', 'db'),
      methodAccessing('sendWelcome', 'mailer'),
      methodAccessing('invalidateSession', 'cache'),
    );
    const reports = runOn(node);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toContain("Class 'MixedService' has LCOM of 3 (max: 0)");
    expect(reports[0]?.message).toContain(
      'Unrelated method pairs: (saveUser, sendWelcome), (saveUser, invalidateSession), (sendWelcome, invalidateSession)',
    );
    expect(reports[0]?.data).toEqual({
      className: 'MixedService',
      lcom: 3,
      max: 0,
      pairs:
        '(saveUser, sendWelcome), (saveUser, invalidateSession), (sendWelcome, invalidateSession)',
    });
  });

  it('high-cohesion fixture: every pair shares `count` → LCOM=0, no report', () => {
    // Mirrors tests/fixtures/lcom/high-cohesion.ts
    const node = classDecl(
      'Counter',
      methodAccessing('increment', 'count'),
      methodAccessing('decrement', 'count'),
      methodAccessing('reset', 'count'),
      methodAccessing('getValue', 'count'),
    );
    expect(runOn(node)).toEqual([]);
  });

  it('single-method fixture: 1 method → 0 pairs → LCOM=0, no report', () => {
    // Mirrors tests/fixtures/lcom/single-method.ts (E2E-006)
    const node = classDecl('Greeter', methodAccessing('greet', 'name'));
    expect(runOn(node)).toEqual([]);
  });
});

describe('rules/lcom — pair semantics', () => {
  it('two empty-set methods count as an unrelated pair (no shared state)', () => {
    // Both methods leave `this` alone — they don't interact through state, so
    // LCOM rightly flags them.
    const node = classDecl('Pure', methodDef('a', fnExpr()), methodDef('b', fnExpr()));
    const reports = runOn(node);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toContain('LCOM of 1');
    expect(reports[0]?.message).toContain('(a, b)');
  });

  it('partial overlap: one shared property is enough to make a pair related', () => {
    // a → {x}, b → {x, y}, c → {y}
    //   (a, b) share {x}        → Q
    //   (a, c) share ∅          → P
    //   (b, c) share {y}        → Q
    // P=1, Q=2, LCOM=max(-1,0)=0
    const node = classDecl(
      'Mixed',
      methodAccessing('a', 'x'),
      methodAccessing('b', 'x', 'y'),
      methodAccessing('c', 'y'),
    );
    expect(runOn(node)).toEqual([]);
  });

  it('clamps LCOM at 0 (P-Q never reported negative)', () => {
    // 4 methods all share `x` → C(4,2)=6 pairs all share → P=0, Q=6.
    const node = classDecl(
      'AllShare',
      methodAccessing('a', 'x'),
      methodAccessing('b', 'x'),
      methodAccessing('c', 'x'),
      methodAccessing('d', 'x'),
    );
    expect(runOn(node)).toEqual([]);
  });

  it('preserves visitation order in the unrelated-pairs list', () => {
    // Pairs are emitted in the order (i,j) with i<j, by source order.
    const node = classDecl(
      'Foo',
      methodAccessing('m1', 'a'),
      methodAccessing('m2', 'b'),
      methodAccessing('m3', 'c'),
    );
    const reports = runOn(node, [{ maxLcom: 0 }]);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toContain('Unrelated method pairs: (m1, m2), (m1, m3), (m2, m3)');
  });
});

describe('rules/lcom — method shapes', () => {
  it('counts constructor methods as part of the cohesion footprint', () => {
    // constructor accesses `this.x`, m accesses `this.x` → share → Q=1, P=0,
    // LCOM=0.
    const ctor = {
      type: 'MethodDefinition',
      key: id('constructor'),
      value: fnExpr(exprStmt(thisDot('x'))),
      kind: 'constructor',
      computed: false,
      static: false,
    };
    const m = methodAccessing('m', 'x');
    expect(runOn(classDecl('Foo', ctor, m))).toEqual([]);
  });

  it('counts getters and setters', () => {
    // getter touches `value`, setter touches `value` → share → LCOM=0.
    const getter = {
      type: 'MethodDefinition',
      key: id('value'),
      value: fnExpr(exprStmt(thisDot('value'))),
      kind: 'get',
      computed: false,
      static: false,
    };
    const setter = {
      type: 'MethodDefinition',
      key: id('value'),
      value: fnExpr(exprStmt(thisDot('value'))),
      kind: 'set',
      computed: false,
      static: false,
    };
    expect(runOn(classDecl('Foo', getter, setter))).toEqual([]);
  });

  it('counts arrow-valued PropertyDefinition class fields', () => {
    // class Foo { handle = () => this.x; other = () => this.y }
    const handle = propertyDef('handle', arrow(thisDot('x')));
    const other = propertyDef('other', arrow(thisDot('y')));
    const reports = runOn(classDecl('Foo', handle, other));
    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toContain('LCOM of 1');
    expect(reports[0]?.message).toContain('(handle, other)');
  });

  it('counts function-expression-valued class fields', () => {
    const handle = propertyDef('handle', fnExpr(exprStmt(thisDot('x'))));
    const other = propertyDef('other', fnExpr(exprStmt(thisDot('y'))));
    expect(runOn(classDecl('Foo', handle, other))).toHaveLength(1);
  });

  it('skips PropertyDefinition with non-function values', () => {
    // Two non-function fields — they aren't methods, so no pairs.
    const a = propertyDef('a', lit(1));
    const b = propertyDef('b', lit(2));
    expect(runOn(classDecl('Foo', a, b))).toEqual([]);
  });

  it('skips abstract / TS-only method definitions without a body', () => {
    // One real method + one abstract. Only the real one is counted, so 1
    // method total → no pairs → no report.
    const real = methodAccessing('m', 'x');
    const abstractMethod = {
      type: 'TSAbstractMethodDefinition',
      key: id('abs'),
      value: null,
      kind: 'method',
      computed: false,
      static: false,
    };
    expect(runOn(classDecl('Foo', real, abstractMethod))).toEqual([]);
  });

  it('captures private method names with the # prefix', () => {
    const privateM = {
      type: 'MethodDefinition',
      key: { type: 'PrivateIdentifier', name: 'secret' },
      value: fnExpr(exprStmt(thisDot('x'))),
      kind: 'method',
      computed: false,
      static: false,
    };
    const publicM = methodAccessing('open', 'y');
    const reports = runOn(classDecl('Foo', privateM, publicM));
    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toContain('(#secret, open)');
  });

  it('captures string-literal method names', () => {
    const m1 = {
      type: 'MethodDefinition',
      key: lit('weird-name'),
      value: fnExpr(exprStmt(thisDot('x'))),
      kind: 'method',
      computed: true,
      static: false,
    };
    const m2 = methodAccessing('regular', 'y');
    const reports = runOn(classDecl('Foo', m1, m2));
    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toContain('(weird-name, regular)');
  });
});

describe('rules/lcom — class node shapes', () => {
  it('handles ClassExpression too', () => {
    const cls = {
      type: 'ClassExpression',
      id: id('Anon'),
      superClass: null,
      body: {
        type: 'ClassBody',
        body: [methodAccessing('a', 'x'), methodAccessing('b', 'y')],
      },
    };
    const reports = runOn(cls);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toContain("Class 'Anon' has LCOM of 1 (max: 0)");
  });

  it('falls back to <anonymous> when class has no id', () => {
    const cls = {
      type: 'ClassExpression',
      id: null,
      superClass: null,
      body: {
        type: 'ClassBody',
        body: [methodAccessing('a', 'x'), methodAccessing('b', 'y')],
      },
    };
    const reports = runOn(cls);
    expect(reports[0]?.message).toContain("Class '<anonymous>'");
  });
});

describe('rules/lcom — boundary semantics (delegated to extractThisAccesses)', () => {
  it('counts `this.X` accessed from a nested arrow inside a method (shared `this`)', () => {
    // m1's body wraps `this.shared` inside an arrow IIFE-like expression.
    // The arrow shares `this`, so `shared` enters m1's footprint.
    // m2 also touches `shared` directly → share → LCOM=0.
    const arrowAccess = arrow(thisDot('shared'));
    const m1 = methodDef('m1', fnExpr(exprStmt(arrowAccess)));
    const m2 = methodAccessing('m2', 'shared');
    expect(runOn(classDecl('Foo', m1, m2))).toEqual([]);
  });

  it('does NOT count `this.X` accessed from a nested FunctionDeclaration inside a method', () => {
    // m1 contains an inner function declaration that touches `this.hidden`.
    // The function rebinds `this`, so `hidden` does NOT enter m1's footprint.
    // m2 touches `hidden` → m1∩m2 = ∅ → unrelated pair → LCOM=1.
    const innerFn = {
      type: 'FunctionDeclaration',
      id: id('helper'),
      params: [],
      body: block(exprStmt(thisDot('hidden'))),
    };
    const m1 = methodDef('m1', fnExpr(innerFn));
    const m2 = methodAccessing('m2', 'hidden');
    const reports = runOn(classDecl('Foo', m1, m2));
    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toContain('LCOM of 1');
    expect(reports[0]?.message).toContain('(m1, m2)');
  });

  it('does NOT count `this.X` from a nested class inside a method', () => {
    // Inner class defines `m()` accessing `this.innerProp`. That `this` belongs
    // to the inner class, so `innerProp` is not in the outer m1's footprint.
    const innerClass = {
      type: 'ClassDeclaration',
      id: id('Inner'),
      superClass: null,
      body: {
        type: 'ClassBody',
        body: [
          {
            type: 'MethodDefinition',
            key: id('m'),
            kind: 'method',
            computed: false,
            static: false,
            value: fnExpr(exprStmt(thisDot('innerProp'))),
          },
        ],
      },
    };
    const m1 = methodDef('m1', fnExpr(innerClass));
    const m2 = methodAccessing('m2', 'innerProp');
    const reports = runOn(classDecl('Outer', m1, m2));
    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toContain('(m1, m2)');
  });
});
