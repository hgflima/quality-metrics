import { describe, it, expect } from 'vitest';
import { wmc } from '../../src/rules/wmc';
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
  const visitors = wmc.create(context);
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

const ifStmt = (alt: unknown = null) => ({
  type: 'IfStatement',
  test: lit(true),
  consequent: block(),
  alternate: alt,
});

const switchCase = (test: unknown) => ({
  type: 'SwitchCase',
  test,
  consequent: [],
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

/* ──────────────────────────────────────────────────────────────────────── */
/* Tests                                                                     */
/* ──────────────────────────────────────────────────────────────────────── */

describe('rules/wmc — basic behavior', () => {
  it('does not report when class has no methods', () => {
    const node = classDecl('EmptyContainer'); // mirrors zero-methods.ts
    expect(runOn(node)).toEqual([]);
  });

  it('does not report when class only has non-function PropertyDefinitions', () => {
    const node = classDecl(
      'EmptyContainer',
      propertyDef('name', lit('')),
      propertyDef('count', lit(0)),
      propertyDef('active', lit(false)),
    );
    expect(runOn(node)).toEqual([]);
  });

  it('does not report when WMC equals the threshold', () => {
    // Single method with CC=5 (4 ifs).
    const method = methodDef('m', fnExpr(ifStmt(), ifStmt(), ifStmt(), ifStmt()));
    const node = classDecl('Foo', method);
    expect(runOn(node, [{ max: 5 }])).toEqual([]);
  });

  it('reports when WMC exceeds the threshold', () => {
    const method = methodDef('m', fnExpr(ifStmt(), ifStmt(), ifStmt(), ifStmt()));
    const node = classDecl('Foo', method);
    const reports = runOn(node, [{ max: 4 }]);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toContain("Class 'Foo' has WMC of 5 (max: 4)");
    expect(reports[0]?.message).toContain('m(CC=5)');
  });
});

describe('rules/wmc — defaults and options', () => {
  it('uses default max=20 when no options are provided', () => {
    // 21 methods, each CC=1 → WMC=21
    const members = Array.from({ length: 21 }, (_, i) => methodDef(`m${i}`, fnExpr()));
    const node = classDecl('TooBig', ...members);
    const reports = runOn(node);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toContain('WMC of 21 (max: 20)');
  });

  it('uses default max=20 when options[0] is malformed', () => {
    const members = Array.from({ length: 21 }, (_, i) => methodDef(`m${i}`, fnExpr()));
    const node = classDecl('TooBig', ...members);
    expect(runOn(node, [null])).toHaveLength(1);
    expect(runOn(node, [42])).toHaveLength(1);
  });

  it('respects custom max from options', () => {
    const members = Array.from({ length: 5 }, (_, i) => methodDef(`m${i}`, fnExpr()));
    const node = classDecl('Mid', ...members);
    expect(runOn(node, [{ max: 10 }])).toEqual([]);
    expect(runOn(node, [{ max: 4 }])).toHaveLength(1);
  });

  it('attaches structured data alongside the formatted message', () => {
    const method = methodDef('m', fnExpr(ifStmt()));
    const node = classDecl('Foo', method);
    const reports = runOn(node, [{ max: 1 }]);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.data).toEqual({
      className: 'Foo',
      wmc: 2,
      max: 1,
      methods: 'm(CC=2)',
    });
  });
});

describe('rules/wmc — fixture parity', () => {
  it('low-wmc fixture: 4 methods × CC=1 → WMC=4 (no report at default max)', () => {
    // Calculator: add/sub/mul/div, each just `return a OP b`.
    const calculator = classDecl(
      'Calculator',
      methodDef('add', fnExpr()),
      methodDef('sub', fnExpr()),
      methodDef('mul', fnExpr()),
      methodDef('div', fnExpr()),
    );
    expect(runOn(calculator)).toEqual([]);
    // At max=3 it would fire: WMC=4.
    const reports = runOn(calculator, [{ max: 3 }]);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toContain('WMC of 4 (max: 3)');
    expect(reports[0]?.message).toContain('add(CC=1), sub(CC=1), mul(CC=1), div(CC=1)');
  });

  it('high-wmc fixture: per-method CCs 3+5+4+2+3 → WMC=17, reports at max=10', () => {
    // OrderService — AST mirrors tests/fixtures/wmc/high-wmc.ts.
    const validate = methodDef(
      'validate',
      fnExpr({
        type: 'IfStatement',
        test: lit(true),
        consequent: block(ifStmt()),
        alternate: null,
      }),
    );
    const create = methodDef(
      'create',
      fnExpr({
        type: 'SwitchStatement',
        discriminant: id('type'),
        cases: [
          switchCase(lit('a')),
          switchCase(lit('b')),
          switchCase(lit('c')),
          switchCase(lit('d')),
        ],
      }),
    );
    const update = methodDef('update', fnExpr(ifStmt(), ifStmt(), ifStmt()));
    const del = methodDef('delete', fnExpr(ifStmt()));
    const list = methodDef('list', fnExpr(ifStmt(), ifStmt()));

    const orderService = classDecl('OrderService', validate, create, update, del, list);

    // At default max=20, WMC=17 < 20 → no report.
    expect(runOn(orderService)).toEqual([]);

    // At max=10, WMC=17 → reports.
    const reports = runOn(orderService, [{ max: 10 }]);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toContain("Class 'OrderService' has WMC of 17 (max: 10)");
    expect(reports[0]?.message).toContain('validate(CC=3)');
    expect(reports[0]?.message).toContain('create(CC=5)');
    expect(reports[0]?.message).toContain('update(CC=4)');
    expect(reports[0]?.message).toContain('delete(CC=2)');
    expect(reports[0]?.message).toContain('list(CC=3)');
  });
});

describe('rules/wmc — method shapes', () => {
  it('counts constructor methods', () => {
    const ctor = {
      type: 'MethodDefinition',
      key: id('constructor'),
      value: fnExpr(ifStmt(), ifStmt()),
      kind: 'constructor',
      computed: false,
      static: false,
    };
    const node = classDecl('Foo', ctor);
    const reports = runOn(node, [{ max: 2 }]);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toContain('constructor(CC=3)');
  });

  it('counts getters and setters', () => {
    const getter = {
      type: 'MethodDefinition',
      key: id('val'),
      value: fnExpr(ifStmt()),
      kind: 'get',
      computed: false,
      static: false,
    };
    const setter = {
      type: 'MethodDefinition',
      key: id('val'),
      value: fnExpr(ifStmt()),
      kind: 'set',
      computed: false,
      static: false,
    };
    const node = classDecl('Foo', getter, setter);
    const reports = runOn(node, [{ max: 3 }]);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toContain('val(CC=2), val(CC=2)');
  });

  it('counts arrow-valued PropertyDefinition class fields', () => {
    // class Foo { handle = () => { if (x) {} } }
    const field = propertyDef('handle', arrow(block(ifStmt())));
    const node = classDecl('Foo', field);
    const reports = runOn(node, [{ max: 1 }]);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toContain('handle(CC=2)');
  });

  it('counts function-expression-valued class fields', () => {
    const field = propertyDef('handle', fnExpr(ifStmt()));
    const node = classDecl('Foo', field);
    const reports = runOn(node, [{ max: 1 }]);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toContain('handle(CC=2)');
  });

  it('skips PropertyDefinition with non-function values', () => {
    const field = propertyDef('count', lit(0));
    const node = classDecl('Foo', field);
    expect(runOn(node, [{ max: 0 }])).toEqual([]);
  });

  it('skips abstract / TS-only method definitions without a function body', () => {
    const abstractMethod = {
      type: 'TSAbstractMethodDefinition',
      key: id('m'),
      value: null,
      kind: 'method',
      computed: false,
      static: false,
    };
    const node = classDecl('Foo', abstractMethod);
    expect(runOn(node, [{ max: 0 }])).toEqual([]);
  });

  it('captures private method names with the # prefix', () => {
    const m = {
      type: 'MethodDefinition',
      key: { type: 'PrivateIdentifier', name: 'secret' },
      value: fnExpr(ifStmt()),
      kind: 'method',
      computed: false,
      static: false,
    };
    const node = classDecl('Foo', m);
    const reports = runOn(node, [{ max: 1 }]);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toContain('#secret(CC=2)');
  });

  it('captures string-literal method names', () => {
    const m = {
      type: 'MethodDefinition',
      key: lit('weird-name'),
      value: fnExpr(ifStmt()),
      kind: 'method',
      computed: true,
      static: false,
    };
    const node = classDecl('Foo', m);
    const reports = runOn(node, [{ max: 1 }]);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toContain('weird-name(CC=2)');
  });

  it('falls back to <computed> for non-resolvable computed keys', () => {
    const m = {
      type: 'MethodDefinition',
      key: id('SOMETHING'),
      value: fnExpr(ifStmt()),
      kind: 'method',
      computed: true, // computed flag with an Identifier key still resolves to its name
      static: false,
    };
    const node = classDecl('Foo', m);
    const reports = runOn(node, [{ max: 1 }]);
    expect(reports[0]?.message).toContain('SOMETHING(CC=2)');
  });
});

describe('rules/wmc — class node shapes', () => {
  it('handles ClassExpression too', () => {
    const cls = {
      type: 'ClassExpression',
      id: id('Anon'),
      superClass: null,
      body: {
        type: 'ClassBody',
        body: [methodDef('m', fnExpr(ifStmt(), ifStmt()))],
      },
    };
    const reports = runOn(cls, [{ max: 1 }]);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toContain("Class 'Anon' has WMC of 3 (max: 1)");
  });

  it('falls back to <anonymous> when class has no id', () => {
    const cls = {
      type: 'ClassExpression',
      id: null,
      superClass: null,
      body: {
        type: 'ClassBody',
        body: [methodDef('m', fnExpr(ifStmt()))],
      },
    };
    const reports = runOn(cls, [{ max: 1 }]);
    expect(reports[0]?.message).toContain("Class '<anonymous>'");
  });

  it('does not double-count CC from nested functions inside methods', () => {
    // Outer method has 1 if (CC=2); the nested arrow has 5 ifs but is skipped.
    const inner = arrow(block(ifStmt(), ifStmt(), ifStmt(), ifStmt(), ifStmt()));
    const outer = methodDef(
      'm',
      fnExpr(ifStmt(), {
        type: 'VariableDeclaration',
        kind: 'const',
        declarations: [{ type: 'VariableDeclarator', id: id('cb'), init: inner }],
      }),
    );
    const node = classDecl('Foo', outer);
    const reports = runOn(node, [{ max: 1 }]);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toContain('m(CC=2)');
  });
});
