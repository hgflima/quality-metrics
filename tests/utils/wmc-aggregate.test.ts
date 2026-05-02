import { describe, it, expect } from 'vitest';
import { computeWmc } from '../../src/utils/wmc-aggregate';
import type { ClassLikeNode } from '../../src/utils/ast-shared';

/* ──────────────────────────────────────────────────────────────────────── */
/* AST construction helpers — ESTree-shaped nodes for the cases under test. */
/* ──────────────────────────────────────────────────────────────────────── */

const id = (name: string) => ({ type: 'Identifier', name });
const lit = (value: unknown) => ({ type: 'Literal', value });
const block = (...body: unknown[]) => ({ type: 'BlockStatement', body });

function fnExpr(...body: unknown[]): unknown {
  return {
    type: 'FunctionExpression',
    params: [],
    body: block(...body),
  };
}

function ifStmt(test: unknown, ...consequent: unknown[]): unknown {
  return {
    type: 'IfStatement',
    test,
    consequent: block(...consequent),
    alternate: null,
  };
}

function methodDef(
  key: unknown,
  value: unknown,
  opts: { kind?: string; computed?: boolean; static?: boolean } = {},
): unknown {
  return {
    type: 'MethodDefinition',
    key,
    value,
    kind: opts.kind ?? 'method',
    computed: opts.computed ?? false,
    static: opts.static ?? false,
  };
}

function classDecl(name: string | null, ...members: unknown[]): ClassLikeNode {
  return {
    type: 'ClassDeclaration',
    id: name == null ? null : id(name),
    superClass: null,
    body: { type: 'ClassBody', body: members },
  } as unknown as ClassLikeNode;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*                                  Tests                                   */
/* ──────────────────────────────────────────────────────────────────────── */

describe('computeWmc', () => {
  it('returns wmc=0 with empty methods array for a class with no members', () => {
    expect(computeWmc(classDecl('Empty'))).toEqual({ wmc: 0, methods: [] });
  });

  it('returns wmc=2 / methods=[{name:"check", cc:2}] for a single method with one if', () => {
    const node = classDecl('Foo', methodDef(id('check'), fnExpr(ifStmt(lit(true)))));
    expect(computeWmc(node)).toEqual({
      wmc: 2,
      methods: [{ name: 'check', cc: 2 }],
    });
  });

  it('lists every method with the correct name across constructor / getter / setter / static', () => {
    // All bodies are straight-line → cc=1 each. wmc = 4.
    const node = classDecl(
      'Mix',
      methodDef(id('constructor'), fnExpr(), { kind: 'constructor' }),
      methodDef(id('value'), fnExpr(), { kind: 'get' }),
      methodDef(id('value'), fnExpr(), { kind: 'set' }),
      methodDef(id('helper'), fnExpr(), { static: true }),
    );
    const result = computeWmc(node);
    expect(result.wmc).toBe(4);
    expect(result.methods.map((m) => m.name)).toEqual(['constructor', 'value', 'value', 'helper']);
    expect(result.methods.every((m) => m.cc === 1)).toBe(true);
  });

  it('resolves computed string-literal method key via getMethodName', () => {
    // `['x']() {}` — computed: true, key: Literal('x') → name 'x'.
    const node = classDecl('Computed', methodDef(lit('x'), fnExpr(), { computed: true }));
    expect(computeWmc(node)).toEqual({
      wmc: 1,
      methods: [{ name: 'x', cc: 1 }],
    });
  });

  it('is deterministic — invoking twice on the same node returns equal results', () => {
    const node = classDecl(
      'Det',
      methodDef(id('a'), fnExpr(ifStmt(lit(true)))),
      methodDef(id('b'), fnExpr()),
    );
    const first = computeWmc(node);
    const second = computeWmc(node);
    expect(first).toEqual(second);
    expect(first.wmc).toBe(3); // a=2, b=1
  });
});
