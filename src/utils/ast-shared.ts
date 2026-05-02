/**
 * Shared ESTree-shaped AST primitives used by every rule in this plugin.
 *
 * Rules consume the AST as plain `unknown` values (the lint host's tree shape
 * is structurally ESTree-compatible across ESLint v8/v9/v10 and OXLint). These
 * helpers narrow that `unknown` into the small set of node patterns the rules
 * actually care about: class-like nodes, method/property keys, and the
 * function-like value that hangs off a class member.
 */

export interface AstNode {
  type: string;
  [key: string]: unknown;
}

export interface ClassLikeNode extends AstNode {
  type: 'ClassDeclaration' | 'ClassExpression';
}

export const FUNCTION_LIKE_TYPES: ReadonlySet<string> = new Set([
  'FunctionExpression',
  'ArrowFunctionExpression',
  'FunctionDeclaration',
]);

export function isAstNode(value: unknown): value is AstNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

export function isClassLikeNode(value: unknown): value is ClassLikeNode {
  return (
    isAstNode(value) && (value.type === 'ClassDeclaration' || value.type === 'ClassExpression')
  );
}

/**
 * Resolve the binding name of a `ClassDeclaration` / `ClassExpression`.
 * Returns `null` when the class has no `id` (anonymous class expressions).
 * Callers decide whether to skip the node or substitute `<anonymous>`.
 */
export function getClassName(node: ClassLikeNode): string | null {
  const id = node['id'];
  if (isAstNode(id) && typeof id['name'] === 'string') return id['name'];
  return null;
}

/**
 * Resolve a human-readable name for a class member key. Handles plain
 * identifiers, private identifiers (`#name`), and literal keys
 * (`'foo'` / `42`). Falls back to `<computed>` for computed keys whose value
 * isn't a literal, and `<unknown>` when the key shape is unrecognized.
 */
export function getMethodName(key: unknown, computed: boolean): string {
  if (!isAstNode(key)) return '<unknown>';
  if (key.type === 'Identifier' && typeof key['name'] === 'string') {
    return key['name'];
  }
  if (key.type === 'PrivateIdentifier' && typeof key['name'] === 'string') {
    return `#${key['name']}`;
  }
  if (key.type === 'Literal' || key.type === 'StringLiteral' || key.type === 'NumericLiteral') {
    const value = key['value'];
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value);
    }
  }
  return computed ? '<computed>' : '<unknown>';
}

/**
 * Iterate the function-bodied members of a class (constructor, methods,
 * getters, setters, and `PropertyDefinition` whose value is a function-like
 * expression) and project each into a caller-defined shape via `extract`.
 *
 * Abstract / TypeScript-only declarations without a function body are skipped.
 * Heritage clauses are not visited (this iterates `body.body`, not the class
 * itself), matching the C&K convention of excluding inheritance from member
 * analysis.
 */
export function collectClassMethods<T>(
  node: ClassLikeNode,
  extract: (key: unknown, computed: boolean, value: AstNode) => T,
): T[] {
  const body = node['body'];
  if (!isAstNode(body)) return [];
  const members = body['body'];
  if (!Array.isArray(members)) return [];

  const result: T[] = [];
  for (const member of members) {
    if (!isAstNode(member)) continue;
    if (member.type !== 'MethodDefinition' && member.type !== 'PropertyDefinition') {
      continue;
    }
    const value = member['value'];
    if (!isAstNode(value)) continue;
    if (!FUNCTION_LIKE_TYPES.has(value.type)) continue;
    result.push(extract(member['key'], Boolean(member['computed']), value));
  }
  return result;
}

/**
 * Resolve a human-readable name for a function-like node.
 *
 * Preference order:
 *
 * 1. The function's own `id` (named FunctionDeclaration / FunctionExpression).
 * 2. The enclosing binding context exposed via `node.parent` (set by the ESLint / OXLint traversal):
 *
 *    - `VariableDeclarator` with an `Identifier` id
 *    - `AssignmentExpression` to an `Identifier` or `MemberExpression`
 *    - `MethodDefinition` / `PropertyDefinition` / `Property` / `ObjectProperty`
 * 3. `<anonymous>` as a final fallback.
 */
export function getFunctionName(node: AstNode): string {
  const ownId = node['id'];
  if (isAstNode(ownId) && ownId.type === 'Identifier' && typeof ownId['name'] === 'string') {
    return ownId['name'];
  }

  const parent = node['parent'];
  if (!isAstNode(parent)) return '<anonymous>';

  switch (parent.type) {
    case 'VariableDeclarator': {
      const idNode = parent['id'];
      if (isAstNode(idNode) && idNode.type === 'Identifier' && typeof idNode['name'] === 'string') {
        return idNode['name'];
      }
      return '<anonymous>';
    }
    case 'AssignmentExpression': {
      const left = parent['left'];
      if (isAstNode(left)) {
        if (left.type === 'Identifier' && typeof left['name'] === 'string') {
          return left['name'];
        }
        if (left.type === 'MemberExpression') {
          const prop = left['property'];
          if (isAstNode(prop) && prop.type === 'Identifier' && typeof prop['name'] === 'string') {
            return prop['name'];
          }
        }
      }
      return '<anonymous>';
    }
    case 'MethodDefinition':
    case 'PropertyDefinition':
    case 'Property':
    case 'ObjectProperty':
      return getMethodName(parent['key'], Boolean(parent['computed']));
    default:
      return '<anonymous>';
  }
}
