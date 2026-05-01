import { describe, it, expect } from 'vitest';
import { extractThisAccesses, type FunctionLikeNode } from '../../src/utils/this-access';

/* ──────────────────────────────────────────────────────────────────────── */
/* AST construction helpers — ESTree-shaped nodes for the cases under test. */
/* ──────────────────────────────────────────────────────────────────────── */

function method(...body: unknown[]): FunctionLikeNode {
  return {
    type: 'FunctionExpression',
    body: { type: 'BlockStatement', body },
  };
}

const id = (name: string) => ({ type: 'Identifier', name });
const lit = (value: unknown) => ({ type: 'Literal', value });
const thisExpr = () => ({ type: 'ThisExpression' });

const thisDot = (prop: string) => ({
  type: 'MemberExpression',
  object: thisExpr(),
  property: id(prop),
  computed: false,
  optional: false,
});

const thisPrivate = (prop: string) => ({
  type: 'MemberExpression',
  object: thisExpr(),
  property: { type: 'PrivateIdentifier', name: prop },
  computed: false,
  optional: false,
});

const thisComputed = (key: unknown) => ({
  type: 'MemberExpression',
  object: thisExpr(),
  property: key,
  computed: true,
  optional: false,
});

const exprStmt = (expression: unknown) => ({
  type: 'ExpressionStatement',
  expression,
});

/* ──────────────────────────────────────────────────────────────────────── */
/*                                  Tests                                   */
/* ──────────────────────────────────────────────────────────────────────── */

describe('extractThisAccesses', () => {
  it('returns an empty set for an empty body', () => {
    expect(extractThisAccesses(method())).toEqual(new Set<string>());
  });

  it('captures a single `this.foo` access', () => {
    expect(extractThisAccesses(method(exprStmt(thisDot('foo'))))).toEqual(new Set(['foo']));
  });

  it('captures multiple distinct properties', () => {
    expect(
      extractThisAccesses(method(exprStmt(thisDot('db')), exprStmt(thisDot('mailer')))),
    ).toEqual(new Set(['db', 'mailer']));
  });

  it('deduplicates repeated accesses to the same property', () => {
    expect(
      extractThisAccesses(
        method(exprStmt(thisDot('count')), exprStmt(thisDot('count')), exprStmt(thisDot('count'))),
      ),
    ).toEqual(new Set(['count']));
  });

  it('captures only the first hop in a chain like `this.foo.bar`', () => {
    const chain = {
      type: 'MemberExpression',
      object: thisDot('foo'),
      property: id('bar'),
      computed: false,
      optional: false,
    };
    expect(extractThisAccesses(method(exprStmt(chain)))).toEqual(new Set(['foo']));
  });

  it('captures `this.foo()` (method call)', () => {
    const call = {
      type: 'CallExpression',
      callee: thisDot('save'),
      arguments: [],
      optional: false,
    };
    expect(extractThisAccesses(method(exprStmt(call)))).toEqual(new Set(['save']));
  });

  it('captures `this.foo = value` (assignment LHS)', () => {
    const assign = {
      type: 'AssignmentExpression',
      operator: '=',
      left: thisDot('count'),
      right: lit(0),
    };
    expect(extractThisAccesses(method(exprStmt(assign)))).toEqual(new Set(['count']));
  });

  it('captures `this.count++` (update expression)', () => {
    const update = {
      type: 'UpdateExpression',
      operator: '++',
      argument: thisDot('count'),
      prefix: false,
    };
    expect(extractThisAccesses(method(exprStmt(update)))).toEqual(new Set(['count']));
  });

  it('does NOT capture bare `this` without member access', () => {
    expect(extractThisAccesses(method({ type: 'ReturnStatement', argument: thisExpr() }))).toEqual(
      new Set<string>(),
    );
  });

  it("captures `this['foo']` (computed string-literal key)", () => {
    expect(extractThisAccesses(method(exprStmt(thisComputed(lit('foo')))))).toEqual(
      new Set(['foo']),
    );
  });

  it('captures Babel-style `StringLiteral` computed key', () => {
    expect(
      extractThisAccesses(
        method(exprStmt(thisComputed({ type: 'StringLiteral', value: 'mailer' }))),
      ),
    ).toEqual(new Set(['mailer']));
  });

  it('does NOT capture `this[x]` (dynamic computed key)', () => {
    expect(extractThisAccesses(method(exprStmt(thisComputed(id('x')))))).toEqual(new Set<string>());
  });

  it('does NOT capture `this[42]` (numeric computed key)', () => {
    expect(extractThisAccesses(method(exprStmt(thisComputed(lit(42)))))).toEqual(new Set<string>());
  });

  it('captures `this.#foo` (PrivateIdentifier) with `#` prefix', () => {
    expect(extractThisAccesses(method(exprStmt(thisPrivate('count'))))).toEqual(
      new Set(['#count']),
    );
  });

  it('treats `#foo` and `foo` as distinct properties', () => {
    expect(
      extractThisAccesses(method(exprStmt(thisDot('count')), exprStmt(thisPrivate('count')))),
    ).toEqual(new Set(['count', '#count']));
  });

  it('TRAVERSES into ArrowFunctionExpression — `this` is shared', () => {
    const arrow = {
      type: 'ArrowFunctionExpression',
      params: [],
      body: thisDot('shared'),
    };
    expect(extractThisAccesses(method(exprStmt(arrow)))).toEqual(new Set(['shared']));
  });

  it('TRAVERSES nested arrows (block body)', () => {
    const inner = {
      type: 'ArrowFunctionExpression',
      params: [],
      body: {
        type: 'BlockStatement',
        body: [exprStmt(thisDot('inner'))],
      },
    };
    const outer = {
      type: 'ArrowFunctionExpression',
      params: [],
      body: {
        type: 'BlockStatement',
        body: [exprStmt(thisDot('outer')), exprStmt(inner)],
      },
    };
    expect(extractThisAccesses(method(exprStmt(outer)))).toEqual(new Set(['outer', 'inner']));
  });

  it('does NOT traverse a nested FunctionDeclaration', () => {
    const nested = {
      type: 'FunctionDeclaration',
      id: id('helper'),
      params: [],
      body: {
        type: 'BlockStatement',
        body: [exprStmt(thisDot('shouldNotBeCaptured'))],
      },
    };
    expect(extractThisAccesses(method(exprStmt(thisDot('outer')), nested))).toEqual(
      new Set(['outer']),
    );
  });

  it('does NOT traverse a nested FunctionExpression', () => {
    const nested = {
      type: 'FunctionExpression',
      id: null,
      params: [],
      body: {
        type: 'BlockStatement',
        body: [exprStmt(thisDot('shouldNotBeCaptured'))],
      },
    };
    expect(extractThisAccesses(method(exprStmt(thisDot('outer')), exprStmt(nested)))).toEqual(
      new Set(['outer']),
    );
  });

  it('does NOT traverse a nested class declaration (its methods bind their own `this`)', () => {
    const nestedClass = {
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
            static: false,
            computed: false,
            value: {
              type: 'FunctionExpression',
              id: null,
              params: [],
              body: {
                type: 'BlockStatement',
                body: [exprStmt(thisDot('innerClassProp'))],
              },
            },
          },
        ],
      },
    };
    expect(extractThisAccesses(method(exprStmt(thisDot('outer')), nestedClass))).toEqual(
      new Set(['outer']),
    );
  });

  it('arrow inside a method counts; function inside that arrow does not', () => {
    const innerFn = {
      type: 'FunctionExpression',
      id: null,
      params: [],
      body: {
        type: 'BlockStatement',
        body: [exprStmt(thisDot('hidden'))],
      },
    };
    const arrow = {
      type: 'ArrowFunctionExpression',
      params: [],
      body: {
        type: 'BlockStatement',
        body: [exprStmt(thisDot('viaArrow')), exprStmt(innerFn)],
      },
    };
    expect(extractThisAccesses(method(exprStmt(arrow)))).toEqual(new Set(['viaArrow']));
  });

  it('handles low-cohesion fixture shape (one prop per method)', () => {
    // Mirrors `tests/fixtures/lcom/low-cohesion.ts` — `saveUser` body is
    // `this.db.save(user)`. We expect the helper to extract `{db}`.
    const callOnDb = {
      type: 'CallExpression',
      callee: {
        type: 'MemberExpression',
        object: thisDot('db'),
        property: id('save'),
        computed: false,
        optional: false,
      },
      arguments: [id('user')],
      optional: false,
    };
    expect(extractThisAccesses(method(exprStmt(callOnDb)))).toEqual(new Set(['db']));
  });

  it('handles high-cohesion fixture shape (every method touches `this.count`)', () => {
    // Mirrors `tests/fixtures/lcom/high-cohesion.ts` — `increment` body is
    // `this.count++`.
    const update = {
      type: 'UpdateExpression',
      operator: '++',
      argument: thisDot('count'),
      prefix: false,
    };
    expect(extractThisAccesses(method(exprStmt(update)))).toEqual(new Set(['count']));
  });

  it('handles concise-body arrow function as entry node', () => {
    const entry: FunctionLikeNode = {
      type: 'ArrowFunctionExpression',
      body: thisDot('only'),
    };
    expect(extractThisAccesses(entry)).toEqual(new Set(['only']));
  });

  it('captures `this.foo` reached via optional chaining (`this.foo?.bar`)', () => {
    const optional = {
      type: 'MemberExpression',
      object: thisDot('foo'),
      property: id('bar'),
      computed: false,
      optional: true,
    };
    expect(extractThisAccesses(method(exprStmt(optional)))).toEqual(new Set(['foo']));
  });
});
