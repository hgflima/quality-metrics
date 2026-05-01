/**
 * `this`-access extraction helper.
 *
 * Walks a method body and returns the set of property names accessed via
 * `this.X` MemberExpression. Consumed by `rules/lcom.ts` to build the
 * per-method `accessedProperties` sets used in LCOM1 pair analysis.
 *
 * Boundary semantics (per docs/mvp/01-task-breakdown.md TASK-015):
 *   - ArrowFunctionExpression: TRAVERSED (arrows close over the enclosing
 *     `this`, so `this.X` inside an arrow refers to the same instance).
 *   - FunctionDeclaration / FunctionExpression: NOT TRAVERSED (these bind a
 *     fresh `this` at call time, so accesses inside don't belong to the
 *     enclosing method's cohesion footprint).
 *   - ClassDeclaration / ClassExpression: NOT TRAVERSED (their methods bind
 *     their own `this`).
 *
 * Capture rules:
 *   - `this.foo`           → captured as `'foo'`
 *   - `this.#foo`          → captured as `'#foo'` (PrivateIdentifier)
 *   - `this['foo']`        → captured as `'foo'`  (string-literal computed key)
 *   - `this[x]`            → NOT captured (dynamic key, can't resolve statically)
 *   - `this.foo.bar`       → captures `'foo'` only (the directly-on-this prop)
 *   - bare `this`          → NOT captured (no property access)
 */

interface AstNode {
  type: string;
  [key: string]: unknown;
}

/**
 * Function-like AST node accepted by `extractThisAccesses`. Structural so we
 * don't bind to a specific AST library at type-check time.
 */
export interface FunctionLikeNode {
  type: 'FunctionDeclaration' | 'FunctionExpression' | 'ArrowFunctionExpression';
  body: unknown;
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
]);

const FN_BOUNDARY_TYPES: ReadonlySet<string> = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
]);

const CLASS_BOUNDARY_TYPES: ReadonlySet<string> = new Set([
  'ClassDeclaration',
  'ClassExpression',
]);

function isAstNode(value: unknown): value is AstNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

function captureProperty(member: AstNode, sink: Set<string>): void {
  const property = member['property'];
  if (!isAstNode(property)) return;

  if (member['computed']) {
    // `this['foo']` — only static string literals are resolvable.
    if (property.type === 'Literal' || property.type === 'StringLiteral') {
      const value = property['value'];
      if (typeof value === 'string') sink.add(value);
    }
    return;
  }

  if (property.type === 'Identifier') {
    sink.add(String(property['name']));
  } else if (property.type === 'PrivateIdentifier') {
    sink.add(`#${String(property['name'])}`);
  }
}

/**
 * Extract the set of `this.X` property names accessed within the given
 * function-like node's body. Nested non-arrow function and class boundaries
 * are NOT traversed.
 */
export function extractThisAccesses(node: FunctionLikeNode): Set<string> {
  const accessed = new Set<string>();

  const visit = (current: unknown): void => {
    if (Array.isArray(current)) {
      for (const child of current) visit(child);
      return;
    }
    if (!isAstNode(current)) return;

    // Nested function/class boundaries — different `this`. Skip entirely.
    if (FN_BOUNDARY_TYPES.has(current.type)) return;
    if (CLASS_BOUNDARY_TYPES.has(current.type)) return;

    if (current.type === 'MemberExpression') {
      const object = current['object'];
      if (isAstNode(object) && object.type === 'ThisExpression') {
        captureProperty(current, accessed);
      }
    }

    for (const key of Object.keys(current)) {
      if (SKIP_KEYS.has(key)) continue;
      visit(current[key]);
    }
  };

  // Visit the body, not the function node itself — nested function-like nodes
  // encountered during traversal ARE boundaries; the entry node is not.
  visit(node.body);
  return accessed;
}
