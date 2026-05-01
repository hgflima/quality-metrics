/**
 * Cyclomatic Complexity (CC) helper.
 *
 * Counts decision points within a function body and returns count + 1.
 * Decision points (per McCabe, aligned with ESLint's `complexity` rule):
 * - IfStatement
 * - ForStatement / ForInStatement / ForOfStatement
 * - WhileStatement / DoWhileStatement
 * - CatchClause
 * - ConditionalExpression (ternary)
 * - SwitchCase with a non-null `test` (i.e., not `default`)
 * - LogicalExpression with operator `&&`, `||`, or `??`
 *
 * Nested function/arrow bodies are NOT traversed — they have their own CC.
 *
 * Consumed by `rules/wmc.ts` (Weighted Methods per Class).
 */

/**
 * ESTree-compatible function-like AST node accepted by `computeCC`.
 *
 * Kept structural so we don't require a specific AST library at type-check
 * time. The runtime traversal accepts any ESTree-shaped tree.
 */
export interface FunctionNode {
  type: 'FunctionDeclaration' | 'FunctionExpression' | 'ArrowFunctionExpression';
  body: unknown;
}

interface AstNode {
  type: string;
  [key: string]: unknown;
}

const BRANCHING_NODE_TYPES: ReadonlySet<string> = new Set([
  'IfStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'CatchClause',
  'ConditionalExpression',
]);

const NESTED_FUNCTION_TYPES: ReadonlySet<string> = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

const SHORT_CIRCUIT_OPERATORS: ReadonlySet<string> = new Set(['&&', '||', '??']);

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
]);

function isAstNode(value: unknown): value is AstNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

/**
 * Compute the cyclomatic complexity of a function node.
 *
 * Returns 1 for a function with no decision points. Each branching construct
 * adds 1. Nested function bodies are skipped.
 */
export function computeCC(node: FunctionNode): number {
  let complexity = 1;

  const visit = (current: unknown): void => {
    if (Array.isArray(current)) {
      for (const child of current) visit(child);
      return;
    }
    if (!isAstNode(current)) return;

    if (BRANCHING_NODE_TYPES.has(current.type)) {
      complexity++;
    } else if (current.type === 'SwitchCase') {
      if (current['test'] != null) complexity++;
    } else if (current.type === 'LogicalExpression') {
      const operator = current['operator'];
      if (typeof operator === 'string' && SHORT_CIRCUIT_OPERATORS.has(operator)) {
        complexity++;
      }
    }

    for (const key of Object.keys(current)) {
      if (SKIP_KEYS.has(key)) continue;
      const child = current[key];
      if (Array.isArray(child)) {
        for (const item of child) {
          if (isAstNode(item) && NESTED_FUNCTION_TYPES.has(item.type)) continue;
          visit(item);
        }
      } else if (isAstNode(child)) {
        if (NESTED_FUNCTION_TYPES.has(child.type)) continue;
        visit(child);
      }
    }
  };

  visit(node.body);
  return complexity;
}
