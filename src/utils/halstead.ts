/**
 * Halstead software-science helper.
 *
 * Walks an ESTree-shaped AST subtree and counts operators (η₁, N₁) and
 * operands (η₂, N₂) per the model locked in
 * `tests/fixtures/halstead/COUNTING_MODEL.md`. Produces the full
 * `HalsteadMetrics` record (vocabulary, length, volume, difficulty, effort).
 *
 * Consumed by `rules/halstead.ts` (Halstead Volume / Effort thresholds).
 *
 * The traversal:
 *   - Skips TypeScript type annotations (`typeAnnotation`, `returnType`,
 *     `typeParameters`, `superTypeParameters`) and `TS*` AST nodes — Halstead
 *     is computed on the JavaScript-emit token stream.
 *   - Stops at NESTED function-like boundaries. The function-like node passed
 *     in (or the first encountered while descending) IS measured; any
 *     function declared INSIDE it gets its own measurement and is not
 *     traversed here.
 *   - Counts object-literal shorthand properties (`{ foo }`) as a single
 *     operand to avoid double-counting key/value (which share the same
 *     Identifier node in ESTree).
 */

import type { HalsteadMetrics } from '../types.js';

interface AstNode {
  type: string;
  [key: string]: unknown;
}

const SKIP_KEYS: ReadonlySet<string> = new Set([
  'type',
  'loc',
  'range',
  'start',
  'end',
  'parent',
  'comments',
  'leadingComments',
  'trailingComments',
  'innerComments',
  // TypeScript type-only fields — stripped per COUNTING_MODEL.md.
  'typeAnnotation',
  'returnType',
  'typeParameters',
  'superTypeParameters',
]);

const FUNCTION_LIKE_TYPES: ReadonlySet<string> = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

function isAstNode(value: unknown): value is AstNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/**
 * Compute Halstead metrics for the given AST subtree.
 *
 * The caller chooses which subtree to measure. For a standalone function the
 * caller typically passes the FunctionDeclaration / FunctionExpression /
 * ArrowFunctionExpression node. To include a wrapping `const x = (...) => ...`
 * the caller passes the surrounding VariableDeclaration so that `const` and
 * `=` participate in the count.
 */
export function computeHalstead(node: unknown): HalsteadMetrics {
  const operators = new Map<string, number>();
  const operands = new Map<string, number>();

  const addOperator = (token: string): void => increment(operators, token);
  const addIdentifier = (name: string): void =>
    increment(operands, `id:${name}`);
  const addLiteral = (kind: string, value: string): void =>
    increment(operands, `lit:${kind}:${value}`);

  let functionDepth = 0;

  const classify = (current: AstNode): void => {
    switch (current.type) {
      case 'FunctionDeclaration':
      case 'FunctionExpression':
        addOperator('function');
        return;
      case 'ArrowFunctionExpression':
        addOperator('=>');
        return;
      case 'ReturnStatement':
        addOperator('return');
        return;
      case 'IfStatement':
        addOperator('if');
        if (current['alternate'] != null) addOperator('else');
        return;
      case 'ForStatement':
        addOperator('for');
        return;
      case 'ForInStatement':
        addOperator('for');
        addOperator('in');
        return;
      case 'ForOfStatement':
        addOperator('for');
        addOperator('of');
        return;
      case 'WhileStatement':
        addOperator('while');
        return;
      case 'DoWhileStatement':
        addOperator('do');
        addOperator('while');
        return;
      case 'SwitchStatement':
        addOperator('switch');
        return;
      case 'SwitchCase':
        addOperator(current['test'] != null ? 'case' : 'default');
        return;
      case 'BreakStatement':
        addOperator('break');
        return;
      case 'ContinueStatement':
        addOperator('continue');
        return;
      case 'ThrowStatement':
        addOperator('throw');
        return;
      case 'TryStatement':
        addOperator('try');
        if (current['finalizer'] != null) addOperator('finally');
        return;
      case 'CatchClause':
        addOperator('catch');
        return;
      case 'NewExpression':
        addOperator('new');
        return;
      case 'UnaryExpression':
      case 'UpdateExpression':
      case 'BinaryExpression':
      case 'AssignmentExpression':
      case 'LogicalExpression': {
        const op = current['operator'];
        if (typeof op === 'string') addOperator(op);
        return;
      }
      case 'ConditionalExpression':
        addOperator('?');
        addOperator(':');
        return;
      case 'MemberExpression':
        if (current['optional']) addOperator('?.');
        else if (!current['computed']) addOperator('.');
        return;
      case 'VariableDeclaration': {
        const kind = current['kind'];
        if (typeof kind === 'string') addOperator(kind);
        const declarations = current['declarations'];
        if (Array.isArray(declarations)) {
          for (const decl of declarations) {
            if (isAstNode(decl) && decl['init'] != null) addOperator('=');
          }
        }
        return;
      }
      case 'ClassDeclaration':
      case 'ClassExpression':
        addOperator('class');
        if (current['superClass'] != null) addOperator('extends');
        return;
      case 'ThisExpression':
        addOperator('this');
        return;
      case 'Super':
        addOperator('super');
        return;
      case 'YieldExpression':
        addOperator('yield');
        return;
      case 'AwaitExpression':
        addOperator('await');
        return;
      case 'Identifier':
        addIdentifier(String(current['name']));
        return;
      case 'PrivateIdentifier':
        addIdentifier(`#${String(current['name'])}`);
        return;
      case 'Literal': {
        const value = current['value'];
        if (value === null) {
          // `null` literal vs. regex literal (value === null with `regex` field).
          const regex = current['regex'];
          if (regex && typeof regex === 'object') {
            const r = regex as { pattern?: unknown; flags?: unknown };
            addLiteral('regex', `/${String(r.pattern ?? '')}/${String(r.flags ?? '')}`);
          } else {
            addLiteral('null', 'null');
          }
        } else {
          addLiteral(typeof value, String(value));
        }
        return;
      }
      // typescript-eslint / Babel literal variants.
      case 'StringLiteral':
        addLiteral('string', String(current['value']));
        return;
      case 'NumericLiteral':
        addLiteral('number', String(current['value']));
        return;
      case 'BooleanLiteral':
        addLiteral('boolean', String(current['value']));
        return;
      case 'NullLiteral':
        addLiteral('null', 'null');
        return;
      case 'BigIntLiteral':
        addLiteral('bigint', String(current['value']));
        return;
      default:
        return;
    }
  };

  const visit = (current: unknown): void => {
    if (Array.isArray(current)) {
      for (const child of current) visit(child);
      return;
    }
    if (!isAstNode(current)) return;

    // TS-only nodes are stripped entirely.
    if (current.type.startsWith('TS')) return;

    const isFunctionLike = FUNCTION_LIKE_TYPES.has(current.type);
    if (isFunctionLike) {
      if (functionDepth >= 1) {
        // Nested function — skipped (it has its own Halstead measurement).
        return;
      }
      functionDepth++;
    }

    classify(current);

    // Property nodes need special handling for shorthand to avoid
    // double-counting the (key === value) Identifier reference.
    if (current.type === 'Property' || current.type === 'ObjectProperty') {
      if (current['shorthand']) {
        visit(current['value']);
      } else {
        if (!current['computed']) visit(current['key']);
        else visit(current['key']);
        visit(current['value']);
      }
      if (isFunctionLike) functionDepth--;
      return;
    }

    for (const key of Object.keys(current)) {
      if (SKIP_KEYS.has(key)) continue;
      visit(current[key]);
    }

    if (isFunctionLike) functionDepth--;
  };

  visit(node);

  const eta1 = operators.size;
  const eta2 = operands.size;
  let N1 = 0;
  for (const count of operators.values()) N1 += count;
  let N2 = 0;
  for (const count of operands.values()) N2 += count;

  const vocabulary = eta1 + eta2;
  const length = N1 + N2;
  const volume = vocabulary > 0 ? length * Math.log2(vocabulary) : 0;
  const difficulty = eta2 === 0 ? 0 : (eta1 / 2) * (N2 / eta2);
  const effort = difficulty * volume;

  return { eta1, eta2, N1, N2, vocabulary, length, volume, difficulty, effort };
}
