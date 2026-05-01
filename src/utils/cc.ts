/**
 * Cyclomatic Complexity (CC) helper.
 *
 * Stub for TASK-003. The full implementation lands in TASK-010 and will count
 * branching nodes (IfStatement, ForStatement, ForInStatement, ForOfStatement,
 * WhileStatement, DoWhileStatement, SwitchCase, CatchClause,
 * ConditionalExpression, LogicalExpression with &&/||/??) within the function
 * body, returning that count + 1. Nested function/arrow bodies are not
 * traversed.
 *
 * Consumed by `rules/wmc.ts` (Weighted Methods per Class).
 */

/**
 * ESTree-compatible function-like AST node accepted by `computeCC`.
 *
 * Kept minimal at the stub stage. TASK-010 may refine `body` to a stricter
 * type once we settle on an AST library (estree types vs. plugin-provided).
 */
export interface FunctionNode {
  type: 'FunctionDeclaration' | 'FunctionExpression' | 'ArrowFunctionExpression';
  body: unknown;
}

/**
 * Compute the cyclomatic complexity of a function node.
 *
 * Stub: returns 1 (the minimum CC for any function — a single linear path
 * with no branches). The full traversal arrives in TASK-010.
 */
export function computeCC(_node: FunctionNode): number {
  return 1;
}
