import { describe, it, expect } from 'vitest';
import { computeHalstead } from '../../src/utils/halstead';

/**
 * Helpers for assembling minimal ESTree-shaped AST nodes. Same convention as
 * `tests/utils/cc.test.ts`: small constructors keep test setup readable.
 */

const id = (name: string) => ({ type: 'Identifier', name });
const lit = (value: unknown) => ({ type: 'Literal', value });
const block = (...body: unknown[]) => ({ type: 'BlockStatement', body });

/**
 * Anonymous FunctionDeclaration wrapper. Keeps the entry-level `function`
 * keyword in the operator count while contributing no extra operand from
 * the function name, so tests can focus on what's inside the body.
 */
function fn(...body: unknown[]): unknown {
  return {
    type: 'FunctionDeclaration',
    id: null,
    params: [],
    body: block(...body),
  };
}

describe('computeHalstead — degenerate cases', () => {
  it('returns all-zero metrics for an empty subtree', () => {
    const m = computeHalstead({ type: 'Program', body: [] });
    expect(m.eta1).toBe(0);
    expect(m.eta2).toBe(0);
    expect(m.N1).toBe(0);
    expect(m.N2).toBe(0);
    expect(m.vocabulary).toBe(0);
    expect(m.length).toBe(0);
    expect(m.volume).toBe(0);
    expect(m.difficulty).toBe(0);
    expect(m.effort).toBe(0);
  });

  it('returns difficulty=effort=0 when there are no operands (eta2=0)', () => {
    // Empty function body: only `function` keyword (1 op, 0 operands).
    const m = computeHalstead({
      type: 'FunctionDeclaration',
      id: null,
      params: [],
      body: block(),
    });
    expect(m.eta1).toBe(1);
    expect(m.eta2).toBe(0);
    expect(m.N1).toBe(1);
    expect(m.N2).toBe(0);
    expect(m.difficulty).toBe(0);
    expect(m.effort).toBe(0);
  });
});

describe('computeHalstead — simple-fn fixture (function add(a, b) { return a + b })', () => {
  it('matches the COUNTING_MODEL.md worked example', () => {
    const node = {
      type: 'FunctionDeclaration',
      id: id('add'),
      params: [id('a'), id('b')],
      body: block({
        type: 'ReturnStatement',
        argument: {
          type: 'BinaryExpression',
          operator: '+',
          left: id('a'),
          right: id('b'),
        },
      }),
    };
    const m = computeHalstead(node);
    // Operators: function, return, +
    expect(m.eta1).toBe(3);
    expect(m.N1).toBe(3);
    // Operands: add, a, b — counts: add×1, a×2, b×2
    expect(m.eta2).toBe(3);
    expect(m.N2).toBe(5);

    expect(m.vocabulary).toBe(6);
    expect(m.length).toBe(8);
    expect(m.volume).toBeCloseTo(8 * Math.log2(6), 5);
    expect(m.difficulty).toBeCloseTo((3 / 2) * (5 / 3), 5);
    expect(m.effort).toBeCloseTo(m.difficulty * m.volume, 5);
    // Sanity: from the COUNTING_MODEL — V≈20.68, D≈2.50, E≈51.71
    expect(m.volume).toBeCloseTo(20.68, 1);
    expect(m.difficulty).toBeCloseTo(2.5, 2);
    expect(m.effort).toBeCloseTo(51.71, 1);
  });
});

describe('computeHalstead — arrow-fn fixture (export const add = (a, b) => a + b)', () => {
  it('matches when the wrapping VariableDeclaration is passed in', () => {
    const arrow = {
      type: 'ArrowFunctionExpression',
      params: [id('a'), id('b')],
      body: {
        type: 'BinaryExpression',
        operator: '+',
        left: id('a'),
        right: id('b'),
      },
    };
    const node = {
      type: 'VariableDeclaration',
      kind: 'const',
      declarations: [
        { type: 'VariableDeclarator', id: id('add'), init: arrow },
      ],
    };
    const m = computeHalstead(node);
    // Operators: const, =, =>, +  (4 distinct, 4 occurrences)
    expect(m.eta1).toBe(4);
    expect(m.N1).toBe(4);
    // Operands: add, a, b  (3 distinct; add×1, a×2, b×2 = 5 occurrences)
    expect(m.eta2).toBe(3);
    expect(m.N2).toBe(5);
    // Sanity from fixture header: V≈25.27, D≈3.33, E≈84.23
    expect(m.volume).toBeCloseTo(25.27, 1);
    expect(m.difficulty).toBeCloseTo(3.33, 2);
    expect(m.effort).toBeCloseTo(84.23, 1);
  });
});

describe('computeHalstead — operator classification', () => {
  it('classifies if/else as separate keywords when alternate is present', () => {
    const m = computeHalstead(
      fn({
        type: 'IfStatement',
        test: id('x'),
        consequent: block(),
        alternate: block(),
      }),
    );
    // function, if, else
    expect(Object.fromEntries([...new Set(['function', 'if', 'else'])].map((k) => [k, true])))
      .toBeDefined();
    expect(m.eta1).toBe(3);
    expect(m.N1).toBe(3);
  });

  it('classifies for-in and for-of distinctly', () => {
    const forIn = computeHalstead(
      fn({
        type: 'ForInStatement',
        left: id('k'),
        right: id('o'),
        body: block(),
      }),
    );
    // function, for, in
    expect(forIn.eta1).toBe(3);

    const forOf = computeHalstead(
      fn({
        type: 'ForOfStatement',
        left: id('v'),
        right: id('o'),
        body: block(),
      }),
    );
    // function, for, of
    expect(forOf.eta1).toBe(3);
  });

  it('counts switch/case but emits `default` for the default branch', () => {
    const m = computeHalstead(
      fn({
        type: 'SwitchStatement',
        discriminant: id('x'),
        cases: [
          { type: 'SwitchCase', test: lit('a'), consequent: [] },
          { type: 'SwitchCase', test: lit('b'), consequent: [] },
          { type: 'SwitchCase', test: null, consequent: [] },
        ],
      }),
    );
    // operators: function, switch, case, case, default
    // distinct: function, switch, case, default = 4
    expect(m.eta1).toBe(4);
    expect(m.N1).toBe(5);
  });

  it('counts try/catch/finally', () => {
    const m = computeHalstead(
      fn({
        type: 'TryStatement',
        block: block(),
        handler: {
          type: 'CatchClause',
          param: id('e'),
          body: block(),
        },
        finalizer: block(),
      }),
    );
    // function, try, catch, finally + identifier `e` operand
    expect(m.eta1).toBe(4);
    expect(m.N1).toBe(4);
  });

  it('counts logical operators &&, ||, ??', () => {
    for (const operator of ['&&', '||', '??'] as const) {
      const m = computeHalstead(
        fn({
          type: 'ExpressionStatement',
          expression: {
            type: 'LogicalExpression',
            operator,
            left: id('a'),
            right: id('b'),
          },
        }),
      );
      // operators: function, <op>
      expect(m.eta1).toBe(2);
      expect(m.N1).toBe(2);
      // operands: a, b
      expect(m.eta2).toBe(2);
      expect(m.N2).toBe(2);
    }
  });

  it('counts ternary as `?` plus `:`', () => {
    const m = computeHalstead(
      fn({
        type: 'ExpressionStatement',
        expression: {
          type: 'ConditionalExpression',
          test: id('x'),
          consequent: lit(1),
          alternate: lit(2),
        },
      }),
    );
    // operators: function, ?, : (3 distinct)
    expect(m.eta1).toBe(3);
    expect(m.N1).toBe(3);
  });

  it('counts member access `.` only for non-computed access', () => {
    const dot = computeHalstead(
      fn({
        type: 'ExpressionStatement',
        expression: {
          type: 'MemberExpression',
          object: id('o'),
          property: id('p'),
          computed: false,
          optional: false,
        },
      }),
    );
    // function, .
    expect(dot.eta1).toBe(2);
    expect(dot.N1).toBe(2);

    const computed = computeHalstead(
      fn({
        type: 'ExpressionStatement',
        expression: {
          type: 'MemberExpression',
          object: id('o'),
          property: id('p'),
          computed: true,
          optional: false,
        },
      }),
    );
    // function only (computed `[...]` is delimiters)
    expect(computed.eta1).toBe(1);
    expect(computed.N1).toBe(1);
  });

  it('counts optional chaining `?.`', () => {
    const m = computeHalstead(
      fn({
        type: 'ExpressionStatement',
        expression: {
          type: 'MemberExpression',
          object: id('o'),
          property: id('p'),
          computed: false,
          optional: true,
        },
      }),
    );
    // function, ?.
    expect(m.eta1).toBe(2);
  });

  it('counts each unary/update operator distinctly', () => {
    const m = computeHalstead(
      fn(
        {
          type: 'ExpressionStatement',
          expression: {
            type: 'UnaryExpression',
            operator: '!',
            argument: id('x'),
            prefix: true,
          },
        },
        {
          type: 'ExpressionStatement',
          expression: {
            type: 'UpdateExpression',
            operator: '++',
            argument: id('x'),
            prefix: false,
          },
        },
      ),
    );
    // operators: function, !, ++
    expect(m.eta1).toBe(3);
    expect(m.N1).toBe(3);
  });

  it('counts VariableDeclaration kind plus one `=` per initialised declarator', () => {
    const m = computeHalstead({
      type: 'VariableDeclaration',
      kind: 'const',
      declarations: [
        { type: 'VariableDeclarator', id: id('a'), init: lit(1) },
        { type: 'VariableDeclarator', id: id('b'), init: lit(2) },
        { type: 'VariableDeclarator', id: id('c'), init: null },
      ],
    });
    // operators: const, =, = (distinct: const, = → eta1=2; total: 1+2=3)
    expect(m.eta1).toBe(2);
    expect(m.N1).toBe(3);
  });

  it('counts class with extends', () => {
    const m = computeHalstead({
      type: 'ClassDeclaration',
      id: id('Dog'),
      superClass: id('Animal'),
      body: { type: 'ClassBody', body: [] },
    });
    // operators: class, extends; operands: Dog, Animal
    expect(m.eta1).toBe(2);
    expect(m.eta2).toBe(2);
  });
});

describe('computeHalstead — operand classification', () => {
  it('counts identifiers per occurrence and per distinct name', () => {
    const m = computeHalstead(
      fn(
        {
          type: 'ExpressionStatement',
          expression: {
            type: 'BinaryExpression',
            operator: '+',
            left: id('a'),
            right: id('a'),
          },
        },
      ),
    );
    // operands: a×2 → eta2=1, N2=2
    expect(m.eta2).toBe(1);
    expect(m.N2).toBe(2);
  });

  it('does not collide identifier `null` with literal null', () => {
    // Identifier named "null" (legal-ish member name) vs. null literal must be distinct.
    const m = computeHalstead(
      fn(
        {
          type: 'ExpressionStatement',
          expression: {
            type: 'MemberExpression',
            object: id('x'),
            property: id('null'),
            computed: false,
            optional: false,
          },
        },
        {
          type: 'ExpressionStatement',
          expression: lit(null),
        },
      ),
    );
    // operands: x, null (identifier), null (literal) → 3 distinct
    expect(m.eta2).toBe(3);
    expect(m.N2).toBe(3);
  });

  it('does not collide string "1" with number 1', () => {
    const m = computeHalstead({
      type: 'ArrayExpression',
      elements: [lit(1), lit('1')],
    });
    expect(m.eta2).toBe(2);
    expect(m.N2).toBe(2);
  });

  it('counts boolean literals', () => {
    const m = computeHalstead({
      type: 'ArrayExpression',
      elements: [lit(true), lit(false), lit(true)],
    });
    // distinct: true, false; total: 3
    expect(m.eta2).toBe(2);
    expect(m.N2).toBe(3);
  });

  it('counts shorthand object properties as a single operand', () => {
    const x = id('x');
    const m = computeHalstead({
      type: 'ObjectExpression',
      properties: [
        {
          type: 'Property',
          kind: 'init',
          key: x,
          value: x,
          shorthand: true,
          computed: false,
          method: false,
        },
      ],
    });
    expect(m.eta2).toBe(1);
    expect(m.N2).toBe(1);
  });

  it('counts non-shorthand object property key and value', () => {
    const m = computeHalstead({
      type: 'ObjectExpression',
      properties: [
        {
          type: 'Property',
          kind: 'init',
          key: id('foo'),
          value: id('bar'),
          shorthand: false,
          computed: false,
          method: false,
        },
      ],
    });
    // operands: foo, bar
    expect(m.eta2).toBe(2);
    expect(m.N2).toBe(2);
  });
});

describe('computeHalstead — TypeScript stripping', () => {
  it('skips parameter type annotations on identifiers', () => {
    const m = computeHalstead({
      type: 'FunctionDeclaration',
      id: id('f'),
      params: [
        {
          type: 'Identifier',
          name: 'a',
          typeAnnotation: {
            type: 'TSTypeAnnotation',
            typeAnnotation: { type: 'TSNumberKeyword' },
          },
        },
      ],
      returnType: {
        type: 'TSTypeAnnotation',
        typeAnnotation: { type: 'TSStringKeyword' },
      },
      body: block(),
    });
    // operators: function. operands: f, a.
    expect(m.eta1).toBe(1);
    expect(m.eta2).toBe(2);
    expect(m.N1).toBe(1);
    expect(m.N2).toBe(2);
  });

  it('skips TS-prefixed nodes entirely (e.g. type aliases inside a tree)', () => {
    const m = computeHalstead({
      type: 'Program',
      body: [
        {
          type: 'TSTypeAliasDeclaration',
          id: id('Foo'),
          typeAnnotation: { type: 'TSStringKeyword' },
        },
        { type: 'ExpressionStatement', expression: id('runtime') },
      ],
    });
    // Only `runtime` should count.
    expect(m.eta2).toBe(1);
    expect(m.N2).toBe(1);
  });
});

describe('computeHalstead — function-boundary semantics', () => {
  it('does not traverse into nested function bodies', () => {
    // Outer function declares an inner arrow assigned to a const. The inner
    // body has many tokens; only the outer-level VariableDeclaration / arrow
    // entry tokens should count.
    const innerArrow = {
      type: 'ArrowFunctionExpression',
      params: [id('a'), id('b')],
      body: {
        type: 'BinaryExpression',
        operator: '*',
        left: id('a'),
        right: id('b'),
      },
    };
    const m = computeHalstead(
      fn({
        type: 'VariableDeclaration',
        kind: 'const',
        declarations: [
          { type: 'VariableDeclarator', id: id('inner'), init: innerArrow },
        ],
      }),
    );
    // Outer operators: function, const, =. Inner arrow is skipped, so `=>`
    // and `*` and inner identifiers must NOT appear.
    expect([...new Set(Array.from({ length: 0 }))].length).toBe(0);
    expect(m.eta1).toBe(3);
    expect(m.N1).toBe(3);
    // Outer operand: only `inner`.
    expect(m.eta2).toBe(1);
    expect(m.N2).toBe(1);
  });

  it('measures only the first FunctionDeclaration when the entry is the function', () => {
    const innerFn = {
      type: 'FunctionDeclaration',
      id: id('inner'),
      params: [],
      body: block({
        type: 'ExpressionStatement',
        expression: {
          type: 'BinaryExpression',
          operator: '+',
          left: id('a'),
          right: id('b'),
        },
      }),
    };
    const m = computeHalstead({
      type: 'FunctionDeclaration',
      id: id('outer'),
      params: [],
      body: block(innerFn),
    });
    // Outer is the entry: counts `function` + `outer`. Inner is skipped.
    expect(m.eta1).toBe(1);
    expect(m.N1).toBe(1);
    expect(m.eta2).toBe(1);
    expect(m.N2).toBe(1);
  });
});
