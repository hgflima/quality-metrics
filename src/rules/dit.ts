/**
 * Depth of Inheritance Tree (DIT) rule (TASK-023).
 *
 * For each class declaration, count the number of `extends` edges from the
 * class up to the root of its inheritance chain and report once when the depth
 * exceeds the configured `max`.
 *
 * Definition (Chidamber & Kemerer, 1994):
 *   DIT(C) = number of `extends` edges between C and the root of its
 *           inheritance tree. A class with no parent has DIT = 0.
 *
 * What counts:
 *   - `extends` edges resolved via the TypeScript type checker
 *     (`ClassDeclaration.getBaseClass()`), which follows imports across files.
 *
 * What does NOT count:
 *   - `implements` clauses — per C&K, only inheritance (`extends`) contributes
 *     to depth. `getBaseClass()` already excludes interfaces by construction.
 *   - Base classes declared in `.d.ts` files (built-in types, ambient libs).
 *     This mirrors the CBO rule's treatment of declaration files: project-local
 *     classes only.
 *   - Cycles (mutually-recursive `extends`) — the chain walker maintains a
 *     visited set and stops as soon as it would re-enter a previously-seen
 *     class, preventing infinite loops on TypeScript-error inputs (E2E-011).
 *
 * Diagnostic format (per docs/mvp/03-technical-architecture.md):
 *   "Class 'Labrador' has DIT of 4 (max: 3).
 *      Chain: Labrador → Dog → Mammal → Animal → LivingThing"
 *
 * Graceful degradation:
 *   - When `ts-morph` is unavailable (peer dep absent or Project construction
 *     failed), `getProjectSingleton().isAvailable` is false; the rule returns
 *     no-op visitors so no diagnostics are produced.
 *   - When the analyzed file or the named class is not in the ts-morph project
 *     (e.g. tsconfigPath not configured, or class is anonymous), the visitor
 *     silently skips that node.
 */

import { createDeepClassVisitor } from '../utils/ts-morph-rule.js';
import type { DitOptions, RuleContext } from '../types.js';
import type { ClassDeclaration as TsMorphClassDeclaration } from 'ts-morph';

const DEFAULT_MAX = 5;

interface DitResult {
  dit: number;
  chain: string[];
}

/**
 * Walk the `extends` chain from `cls` to the root, returning DIT (number of
 * edges) and the named chain (class first, then ancestors). Stops on:
 *   - no base class (chain ends naturally),
 *   - base in a `.d.ts` file (project-local classes only),
 *   - cycle (would revisit a class already in the chain).
 */
function computeDit(cls: TsMorphClassDeclaration): DitResult {
  const chain: string[] = [];
  const visited = new Set<TsMorphClassDeclaration>();

  let current: TsMorphClassDeclaration | undefined = cls;
  chain.push(current.getName() ?? '<anonymous>');
  visited.add(current);

  while (true) {
    const base: TsMorphClassDeclaration | undefined = current.getBaseClass();
    if (!base) break;
    if (base.getSourceFile().isDeclarationFile()) break;
    if (visited.has(base)) break;

    visited.add(base);
    chain.push(base.getName() ?? '<anonymous>');
    current = base;
  }

  return { dit: chain.length - 1, chain };
}

export const dit = {
  meta: {
    type: 'suggestion' as const,
    docs: {
      description:
        'enforce a maximum Depth of Inheritance Tree (DIT) — the number of `extends` edges from this class to the root of its inheritance tree. `implements` clauses are excluded per Chidamber & Kemerer (1994).',
    },
    schema: [
      {
        type: 'object',
        properties: {
          max: { type: 'number', minimum: 0 },
          tsconfigPath: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      tooHigh:
        "Class '{{className}}' has DIT of {{dit}} (max: {{max}}).\n  Chain: {{chain}}",
    },
  },
  create(context: RuleContext) {
    const userOptions = context.options[0];
    const options: DitOptions =
      userOptions != null && typeof userOptions === 'object'
        ? { max: DEFAULT_MAX, ...(userOptions as Partial<DitOptions>) }
        : { max: DEFAULT_MAX };

    return createDeepClassVisitor(
      context,
      options.tsconfigPath,
      ({ classNode, className, tsmClass }) => {
        const { dit: depth, chain } = computeDit(tsmClass);
        if (depth <= options.max) return;

        const chainStr = chain.join(' → ');

        context.report({
          node: classNode,
          message: `Class '${className}' has DIT of ${depth} (max: ${options.max}).\n  Chain: ${chainStr}`,
          data: {
            className,
            dit: depth,
            max: options.max,
            chain: chainStr,
          },
        });
      },
    );
  },
};

export default dit;
