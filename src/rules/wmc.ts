/**
 * Weighted Methods per Class (WMC) rule.
 *
 * For each class declaration / expression, sum the cyclomatic complexity of
 * every method body. If the sum exceeds the configured `max`, report once on
 * the class node with the per-method contributions.
 *
 * Definition (Chidamber & Kemerer, 1994):
 * WMC = Σ CC(method_i) for all methods of the class.
 *
 * What counts as a method:
 *
 * - `MethodDefinition` of any `kind` (`method`, `constructor`, `get`, `set`).
 * - `PropertyDefinition` whose `value` is a function-like expression (`FunctionExpression` /
 *   `ArrowFunctionExpression`) — class fields whose initializer is a function are methods in
 *   everything but the keyword.
 * - Abstract / TypeScript-only declarations without a body are skipped.
 *
 * Diagnostic format (per docs/mvp/03-technical-architecture.md):
 * "Class 'UserService' has WMC of 34 (max: 20).
 * Methods contributing: validate(CC=8), createUser(CC=12), ..."
 */

import { computeWmc } from '../utils/wmc-aggregate.js';
import { getClassName, isClassLikeNode } from '../utils/ast-shared.js';
import type { RuleContext, WmcOptions } from '../types.js';

const DEFAULT_MAX = 20;

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
      if (!isClassLikeNode(node)) return;

      const { wmc: wmcValue, methods } = computeWmc(node);
      if (methods.length === 0) return;
      if (wmcValue <= options.max) return;

      const className = getClassName(node) ?? '<anonymous>';
      const methodsStr = methods.map(({ name, cc }) => `${name}(CC=${cc})`).join(', ');
      context.report({
        node,
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
