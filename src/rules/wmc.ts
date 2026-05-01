/**
 * Weighted Methods per Class (WMC) rule.
 *
 * For each class declaration / expression, sum the cyclomatic complexity of
 * every method body. If the sum exceeds the configured `max`, report once on
 * the class node with the per-method contributions.
 *
 * Definition (Chidamber & Kemerer, 1994):
 *   WMC = Σ CC(method_i) for all methods of the class.
 *
 * What counts as a method:
 *   - `MethodDefinition` of any `kind` (`method`, `constructor`, `get`, `set`).
 *   - `PropertyDefinition` whose `value` is a function-like expression
 *     (`FunctionExpression` / `ArrowFunctionExpression`) — class fields whose
 *     initializer is a function are methods in everything but the keyword.
 *   - Abstract / TypeScript-only declarations without a body are skipped.
 *
 * Diagnostic format (per docs/mvp/03-technical-architecture.md):
 *   "Class 'UserService' has WMC of 34 (max: 20).
 *      Methods contributing: validate(CC=8), createUser(CC=12), ..."
 */

import { computeCC, type FunctionNode } from '../utils/cc.js';
import type { RuleContext, WmcOptions } from '../types.js';

const DEFAULT_MAX = 20;

interface AstNode {
  type: string;
  [key: string]: unknown;
}

interface ClassLikeNode extends AstNode {
  type: 'ClassDeclaration' | 'ClassExpression';
}

const FUNCTION_LIKE_TYPES: ReadonlySet<string> = new Set([
  'FunctionExpression',
  'ArrowFunctionExpression',
  'FunctionDeclaration',
]);

function isAstNode(value: unknown): value is AstNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

function getMethodName(key: unknown, computed: boolean): string {
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

function getClassName(node: ClassLikeNode): string {
  const id = node['id'];
  if (isAstNode(id) && typeof id['name'] === 'string') return id['name'];
  return '<anonymous>';
}

interface MethodInfo {
  name: string;
  cc: number;
}

function collectMethods(node: ClassLikeNode): MethodInfo[] {
  const body = node['body'];
  if (!isAstNode(body)) return [];
  const members = body['body'];
  if (!Array.isArray(members)) return [];

  const methods: MethodInfo[] = [];
  for (const member of members) {
    if (!isAstNode(member)) continue;

    const computed = Boolean(member['computed']);

    if (member.type === 'MethodDefinition') {
      const value = member['value'];
      if (!isAstNode(value)) continue;
      if (!FUNCTION_LIKE_TYPES.has(value.type)) continue;
      methods.push({
        name: getMethodName(member['key'], computed),
        cc: computeCC(value as unknown as FunctionNode),
      });
      continue;
    }

    if (member.type === 'PropertyDefinition') {
      const value = member['value'];
      if (!isAstNode(value)) continue;
      if (!FUNCTION_LIKE_TYPES.has(value.type)) continue;
      methods.push({
        name: getMethodName(member['key'], computed),
        cc: computeCC(value as unknown as FunctionNode),
      });
    }
  }
  return methods;
}

function formatMethods(methods: MethodInfo[]): string {
  return methods.map(({ name, cc }) => `${name}(CC=${cc})`).join(', ');
}

export const wmc = {
  meta: {
    type: 'suggestion' as const,
    docs: {
      description:
        'enforce a maximum Weighted Methods per Class (WMC) — sum of cyclomatic complexity across all methods of a class',
    },
    schema: [
      {
        type: 'object',
        properties: {
          max: { type: 'number', minimum: 0 },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      tooHigh:
        "Class '{{className}}' has WMC of {{wmc}} (max: {{max}}).\n  Methods contributing: {{methods}}",
    },
  },
  create(context: RuleContext) {
    const userOptions = context.options[0];
    const options: WmcOptions =
      userOptions != null && typeof userOptions === 'object'
        ? { max: DEFAULT_MAX, ...(userOptions as Partial<WmcOptions>) }
        : { max: DEFAULT_MAX };

    const check = (node: unknown): void => {
      if (!isAstNode(node)) return;
      if (node.type !== 'ClassDeclaration' && node.type !== 'ClassExpression') return;

      const classNode = node as ClassLikeNode;
      const methods = collectMethods(classNode);
      if (methods.length === 0) return;

      let wmcValue = 0;
      for (const { cc } of methods) wmcValue += cc;

      if (wmcValue <= options.max) return;

      const className = getClassName(classNode);
      const methodsStr = formatMethods(methods);
      context.report({
        node: classNode,
        message: `Class '${className}' has WMC of ${wmcValue} (max: ${options.max}).\n  Methods contributing: ${methodsStr}`,
        data: {
          className,
          wmc: wmcValue,
          max: options.max,
          methods: methodsStr,
        },
      });
    };

    return {
      ClassDeclaration: check,
      ClassExpression: check,
    };
  },
};

export default wmc;
