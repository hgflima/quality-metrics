/**
 * Lack of Cohesion of Methods (LCOM1) rule.
 *
 * For each class declaration / expression, build the set of `this.X`
 * properties accessed by every method body, then for each unordered method
 * pair count:
 *   - P : pairs that share NO accessed properties (disjoint sets)
 *   - Q : pairs that share AT LEAST ONE accessed property
 *
 * LCOM1 (Chidamber & Kemerer, 1994) = max(P - Q, 0).
 *
 * If LCOM > `options.maxLcom` the rule emits a single diagnostic on the
 * class node listing every unrelated (P) pair.
 *
 * What counts as a method:
 *   - `MethodDefinition` of any `kind` (`method`, `constructor`, `get`, `set`).
 *   - `PropertyDefinition` whose `value` is function-like (`FunctionExpression`,
 *     `ArrowFunctionExpression`) — class-field arrows close over the class
 *     `this`, so they belong in the cohesion footprint.
 *   - Abstract / TS-only declarations without a function body are skipped.
 *
 * Pair analysis uses property-name set intersection. The empty set has empty
 * intersection with any set, so two methods that never touch `this` count as
 * an unrelated pair (they don't interact through instance state — exactly
 * what LCOM is designed to flag).
 *
 * `this`-access extraction is delegated to `extractThisAccesses`, which
 * traverses arrow functions (shared `this`) but stops at nested
 * function/class boundaries (own `this`).
 *
 * Diagnostic format (per docs/mvp/03-technical-architecture.md):
 *   "Class 'ReportService' has LCOM of 3 (max: 0).
 *      Unrelated method pairs: (generatePDF, sendEmail), (generatePDF, scheduleJob), (sendEmail, scheduleJob)"
 */

import {
  extractThisAccesses,
  type FunctionLikeNode,
} from '../utils/this-access.js';
import {
  collectClassMethods,
  getClassName,
  getMethodName,
  isClassLikeNode,
} from '../utils/ast-shared.js';
import type { LcomOptions, RuleContext } from '../types.js';

const DEFAULT_MAX_LCOM = 0;

interface MethodAttrs {
  name: string;
  accessed: Set<string>;
}

function intersects(a: Set<string>, b: Set<string>): boolean {
  // Iterate the smaller set for cheaper lookup.
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of small) if (big.has(x)) return true;
  return false;
}

export const lcom = {
  meta: {
    type: 'suggestion' as const,
    docs: {
      description:
        'enforce a maximum Lack of Cohesion of Methods (LCOM1) — flag classes whose methods do not interact through shared instance state',
    },
    schema: [
      {
        type: 'object',
        properties: {
          maxLcom: { type: 'number', minimum: 0 },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      tooHigh:
        "Class '{{className}}' has LCOM of {{lcom}} (max: {{max}}).\n  Unrelated method pairs: {{pairs}}",
    },
  },
  create(context: RuleContext) {
    const userOptions = context.options[0];
    const options: LcomOptions =
      userOptions != null && typeof userOptions === 'object'
        ? { maxLcom: DEFAULT_MAX_LCOM, ...(userOptions as Partial<LcomOptions>) }
        : { maxLcom: DEFAULT_MAX_LCOM };

    const check = (node: unknown): void => {
      if (!isClassLikeNode(node)) return;

      const methods = collectClassMethods<MethodAttrs>(
        node,
        (key, computed, value) => ({
          name: getMethodName(key, computed),
          accessed: extractThisAccesses(value as unknown as FunctionLikeNode),
        }),
      );
      // Need at least 2 methods to form a single pair; with fewer, P=Q=0 and
      // LCOM=0 by definition (covers the single-method fixture).
      if (methods.length < 2) return;

      let P = 0;
      let Q = 0;
      const unrelated: Array<readonly [string, string]> = [];
      for (let i = 0; i < methods.length; i++) {
        for (let j = i + 1; j < methods.length; j++) {
          const a = methods[i]!;
          const b = methods[j]!;
          if (intersects(a.accessed, b.accessed)) {
            Q++;
          } else {
            P++;
            unrelated.push([a.name, b.name] as const);
          }
        }
      }

      const lcomValue = Math.max(P - Q, 0);
      if (lcomValue <= options.maxLcom) return;

      const className = getClassName(node) ?? '<anonymous>';
      const pairsStr = unrelated.map(([a, b]) => `(${a}, ${b})`).join(', ');
      context.report({
        node,
        message: `Class '${className}' has LCOM of ${lcomValue} (max: ${options.maxLcom}).\n  Unrelated method pairs: ${pairsStr}`,
        data: {
          className,
          lcom: lcomValue,
          max: options.maxLcom,
          pairs: pairsStr,
        },
      });
    };

    return {
      ClassDeclaration: check,
      ClassExpression: check,
    };
  },
};

export default lcom;
