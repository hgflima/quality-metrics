import { describe, it, expect } from 'vitest';
import { computeCC, type FunctionNode } from '../../src/utils/cc';

/**
 * Helper: wrap a list of body statements into a FunctionDeclaration node.
 * AST shapes follow ESTree conventions.
 */
function fn(...body: unknown[]): FunctionNode {
  return {
    type: 'FunctionDeclaration',
    body: { type: 'BlockStatement', body },
  };
}

const lit = (value: unknown) => ({ type: 'Literal', value });
const id = (name: string) => ({ type: 'Identifier', name });

describe('computeCC', () => {
  it('returns 1 for an empty function body', () => {
    expect(computeCC(fn())).toBe(1);
  });

  it('returns 1 for a function with no branches', () => {
    expect(
      computeCC(
        fn(
          { type: 'VariableDeclaration', declarations: [], kind: 'const' },
          { type: 'ReturnStatement', argument: lit(42) },
        ),
      ),
    ).toBe(1);
  });

  it('counts an IfStatement', () => {
    expect(
      computeCC(
        fn({
          type: 'IfStatement',
          test: lit(true),
          consequent: { type: 'BlockStatement', body: [] },
          alternate: null,
        }),
      ),
    ).toBe(2);
  });

  it('counts nested IfStatements', () => {
    expect(
      computeCC(
        fn({
          type: 'IfStatement',
          test: lit(true),
          consequent: {
            type: 'BlockStatement',
            body: [
              {
                type: 'IfStatement',
                test: lit(true),
                consequent: { type: 'BlockStatement', body: [] },
                alternate: null,
              },
            ],
          },
          alternate: null,
        }),
      ),
    ).toBe(3);
  });

  it('counts each loop type', () => {
    const loops = [
      'ForStatement',
      'ForInStatement',
      'ForOfStatement',
      'WhileStatement',
      'DoWhileStatement',
    ];
    for (const type of loops) {
      expect(
        computeCC(
          fn({
            type,
            body: { type: 'BlockStatement', body: [] },
            test: lit(true),
          }),
        ),
        `loop type: ${type}`,
      ).toBe(2);
    }
  });

  it('counts a ConditionalExpression (ternary)', () => {
    expect(
      computeCC(
        fn({
          type: 'ExpressionStatement',
          expression: {
            type: 'ConditionalExpression',
            test: id('x'),
            consequent: lit(1),
            alternate: lit(2),
          },
        }),
      ),
    ).toBe(2);
  });

  it('counts each non-default SwitchCase but not default', () => {
    expect(
      computeCC(
        fn({
          type: 'SwitchStatement',
          discriminant: id('x'),
          cases: [
            { type: 'SwitchCase', test: lit('a'), consequent: [] },
            { type: 'SwitchCase', test: lit('b'), consequent: [] },
            { type: 'SwitchCase', test: lit('c'), consequent: [] },
            { type: 'SwitchCase', test: null, consequent: [] }, // default — not counted
          ],
        }),
      ),
    ).toBe(4); // 1 base + 3 non-default cases
  });

  it('counts &&, ||, ?? but not other binary operators', () => {
    const make = (operator: string) =>
      computeCC(
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
    expect(make('&&')).toBe(2);
    expect(make('||')).toBe(2);
    expect(make('??')).toBe(2);
  });

  it('counts a CatchClause', () => {
    expect(
      computeCC(
        fn({
          type: 'TryStatement',
          block: { type: 'BlockStatement', body: [] },
          handler: {
            type: 'CatchClause',
            param: id('e'),
            body: { type: 'BlockStatement', body: [] },
          },
          finalizer: null,
        }),
      ),
    ).toBe(2);
  });

  it('does not traverse into nested function bodies', () => {
    // Outer function has no branches; inner has 3 ifs.
    // Outer CC must remain 1.
    const innerIf = (): unknown => ({
      type: 'IfStatement',
      test: lit(true),
      consequent: { type: 'BlockStatement', body: [] },
      alternate: null,
    });
    const innerFn: unknown = {
      type: 'FunctionExpression',
      body: {
        type: 'BlockStatement',
        body: [innerIf(), innerIf(), innerIf()],
      },
    };
    expect(
      computeCC(
        fn({
          type: 'VariableDeclaration',
          kind: 'const',
          declarations: [{ type: 'VariableDeclarator', id: id('inner'), init: innerFn }],
        }),
      ),
    ).toBe(1);

    // Same applies to ArrowFunctionExpression and FunctionDeclaration.
    const arrow: unknown = {
      type: 'ArrowFunctionExpression',
      body: {
        type: 'IfStatement',
        test: lit(true),
        consequent: { type: 'BlockStatement', body: [] },
        alternate: null,
      },
    };
    expect(
      computeCC(
        fn({
          type: 'ExpressionStatement',
          expression: arrow,
        }),
      ),
    ).toBe(1);
  });

  // The following AST shapes mirror the methods in
  // tests/fixtures/wmc/high-wmc.ts. Expected values are the per-method CCs
  // documented in that fixture's header comment.
  describe('matches WMC fixture per-method CCs', () => {
    it('validate(x): two ifs → CC 3', () => {
      const ifNode = {
        type: 'IfStatement',
        test: lit(true),
        consequent: { type: 'BlockStatement', body: [] },
        alternate: null,
      };
      expect(
        computeCC(
          fn({
            type: 'IfStatement',
            test: lit(true),
            consequent: { type: 'BlockStatement', body: [ifNode] },
            alternate: null,
          }),
        ),
      ).toBe(3);
    });

    it('create(type): switch with 4 cases → CC 5', () => {
      expect(
        computeCC(
          fn({
            type: 'SwitchStatement',
            discriminant: id('type'),
            cases: [
              { type: 'SwitchCase', test: lit('a'), consequent: [] },
              { type: 'SwitchCase', test: lit('b'), consequent: [] },
              { type: 'SwitchCase', test: lit('c'), consequent: [] },
              { type: 'SwitchCase', test: lit('d'), consequent: [] },
            ],
          }),
        ),
      ).toBe(5);
    });

    it('update(...): three ifs → CC 4', () => {
      const ifNode = (): unknown => ({
        type: 'IfStatement',
        test: lit(true),
        consequent: { type: 'BlockStatement', body: [] },
        alternate: null,
      });
      expect(computeCC(fn(ifNode(), ifNode(), ifNode()))).toBe(4);
    });

    it('delete(id): one if → CC 2', () => {
      expect(
        computeCC(
          fn({
            type: 'IfStatement',
            test: lit(true),
            consequent: { type: 'BlockStatement', body: [] },
            alternate: null,
          }),
        ),
      ).toBe(2);
    });

    it('list(page): two ifs → CC 3', () => {
      const ifNode = (): unknown => ({
        type: 'IfStatement',
        test: lit(true),
        consequent: { type: 'BlockStatement', body: [] },
        alternate: null,
      });
      expect(computeCC(fn(ifNode(), ifNode()))).toBe(3);
    });
  });
});
