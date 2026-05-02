/**
 * Coupling Between Objects (CBO) rule — bidirectional (TASK-022).
 *
 * For each class declaration, count the distinct external classes that the
 * class is coupled to in either direction (outgoing + incoming) and report
 * once when the sum exceeds the configured `max`.
 *
 * Definition (Chidamber & Kemerer, 1994), bidirectional flavor used here:
 * CBO(C) = |outgoing(C)| + |incoming(C)|
 * outgoing(C) = { C' : C uses methods or instance variables of C' }
 * incoming(C) = { C' : C' uses methods or instance variables of C }
 *
 * What counts as outgoing:
 * - Identifier references inside class members whose symbol resolves to a
 * `ClassDeclaration` in another file.
 *
 * What counts as incoming:
 * - Any reference to this class name from inside another class's members
 * (constructor, methods, getters, setters, properties), regardless of
 * whether the referring class lives in the same or a different file.
 *
 * What does NOT count (in either direction):
 * - Inheritance edges (`extends` / `implements`) — per C&K. Outgoing avoids
 * them by iterating `class.getMembers()` (which excludes heritage clauses);
 * incoming avoids them by skipping any reference whose ancestor chain
 * passes through a `HeritageClause`.
 * - Self-references (the class referring to itself).
 * - Declarations from `.d.ts` files (built-in types, ambient libs).
 * - References at module/file level outside any class body (e.g. the bare
 * `import { X }` statement, top-level type aliases, etc.).
 *
 * Diagnostic format (per docs/mvp/03-technical-architecture.md):
 * "Class 'OrderController' has CBO of 12 (max: 10).
 * Outgoing (7): OrderService, PaymentService, ...
 * Incoming (5): AdminPanel, CheckoutFlow, ..."
 *
 * Graceful degradation:
 * - When `ts-morph` is unavailable (peer dep absent or Project construction
 * failed), `getProjectSingleton().isAvailable` is false; the rule returns
 * an empty visitor object so no diagnostics are produced.
 * - When the analyzed file or the named class is not in the ts-morph project
 * (e.g. tsconfigPath not configured, or class is anonymous), the visitor
 * silently skips that node.
 */

import { createDeepClassVisitor } from '../utils/ts-morph-rule.js';
import { collectOutgoingClasses, collectIncomingClasses } from '../utils/cbo-graph.js';
import type { CboOptions, RuleContext } from '../types.js';

const DEFAULT_MAX = 10;

export const cbo = {
  meta: {
    type: 'suggestion' as const,
    docs: {
      description:
        'enforce a maximum Coupling Between Objects (CBO) — sum of distinct external classes that this class either references (outgoing) or is referenced by (incoming). Inheritance edges are excluded per Chidamber & Kemerer (1994).',
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
        "Class '{{className}}' has CBO of {{cbo}} (max: {{max}}).\n  Outgoing ({{outgoingCount}}): {{outgoing}}\n  Incoming ({{incomingCount}}): {{incoming}}",
    },
  },
  create(context: RuleContext) {
    const userOptions = context.options[0];
    const options: CboOptions =
      userOptions != null && typeof userOptions === 'object'
        ? { max: DEFAULT_MAX, ...(userOptions as Partial<CboOptions>) }
        : { max: DEFAULT_MAX };

    return createDeepClassVisitor(
      context,
      options.tsconfigPath,
      ({ classNode, className, tsmClass }) => {
        const outgoing = collectOutgoingClasses(tsmClass);
        const incoming = collectIncomingClasses(tsmClass);
        const cboValue = outgoing.size + incoming.size;
        if (cboValue <= options.max) return;

        const outgoingStr = [...outgoing].sort().join(', ');
        const incomingStr = [...incoming].sort().join(', ');

        context.report({
          node: classNode,
          message: `Class '${className}' has CBO of ${cboValue} (max: ${options.max}).\n  Outgoing (${outgoing.size}): ${outgoingStr}\n  Incoming (${incoming.size}): ${incomingStr}`,
          data: {
            className,
            cbo: cboValue,
            max: options.max,
            outgoingCount: outgoing.size,
            outgoing: outgoingStr,
            incomingCount: incoming.size,
            incoming: incomingStr,
          },
        });
      },
    );
  },
};

export default cbo;
