/**
 * Coupling Between Objects (CBO) rule — outgoing coupling (TASK-021).
 *
 * For each class declaration, count the distinct external classes referenced
 * from within the class body. Reports once per class when the count exceeds
 * the configured `max`.
 *
 * Definition (Chidamber & Kemerer, 1994), restricted here to outgoing edges:
 *   CBO_outgoing(C) = |{ C' : C uses methods or instance variables of C' }|
 *
 * What counts as outgoing:
 *   - Identifier references inside class members whose symbol resolves to a
 *     `ClassDeclaration` in another file.
 *
 * What does NOT count:
 *   - Inheritance edges (`extends` / `implements`) — per C&K. Achieved by
 *     iterating over `class.getMembers()` (which excludes heritage clauses).
 *   - Self-references (the class referring to itself).
 *   - Declarations from `.d.ts` files (built-in types, ambient libs).
 *
 * Bidirectional CBO (incoming + outgoing) lands in TASK-022; this task ships
 * the outgoing-only flavor.
 *
 * Diagnostic format (per docs/mvp/03-technical-architecture.md):
 *   "Class 'OrderController' has CBO of 14 (max: 10).
 *      Outgoing (8): OrderService, PaymentService, ..."
 *
 * Graceful degradation:
 *   - When `ts-morph` is unavailable (peer dep absent or Project construction
 *     failed), `getProjectSingleton().isAvailable` is false; the rule returns
 *     an empty visitor object so no diagnostics are produced.
 *   - When the analyzed file or the named class is not in the ts-morph project
 *     (e.g. tsconfigPath not configured, or class is anonymous), the visitor
 *     silently skips that node.
 */

import { getProjectSingleton } from '../project-singleton.js';
import type { CboOptions, RuleContext } from '../types.js';
import type {
  ClassDeclaration as TsMorphClassDeclaration,
  Identifier,
  Project,
} from 'ts-morph';

const DEFAULT_MAX = 10;

interface AstNode {
  type: string;
  [key: string]: unknown;
}

interface ClassLikeNode extends AstNode {
  type: 'ClassDeclaration' | 'ClassExpression';
}

function isAstNode(value: unknown): value is AstNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

function getClassName(node: ClassLikeNode): string | null {
  const id = node['id'];
  if (isAstNode(id) && typeof id['name'] === 'string') return id['name'];
  return null;
}

function findTsMorphClass(
  project: Project,
  filePath: string,
  className: string,
): TsMorphClassDeclaration | null {
  const sf = project.getSourceFile(filePath);
  if (!sf) return null;
  return sf.getClass(className) ?? null;
}

/**
 * Walk every member of `cls` (constructor, methods, getters, setters,
 * properties) and collect names of distinct external classes referenced from
 * within. `getMembers()` deliberately excludes heritage clauses — that is how
 * the C&K "exclude inheritance" rule is enforced.
 */
function collectOutgoingClasses(cls: TsMorphClassDeclaration): Set<string> {
  const out = new Set<string>();

  for (const member of cls.getMembers()) {
    member.forEachDescendant((node) => {
      if (node.getKindName() !== 'Identifier') return;
      collectFromIdentifier(node as Identifier, cls, out);
    });
  }

  return out;
}

function collectFromIdentifier(
  identifier: Identifier,
  selfClass: TsMorphClassDeclaration,
  out: Set<string>,
): void {
  // `getDefinitionNodes()` follows imports and re-exports to the *actual*
  // declaration, where `getSymbol()` would stop at the local import binding
  // (an `ImportSpecifier`) and never reveal the underlying ClassDeclaration.
  const definitions = identifier.getDefinitionNodes();
  for (const decl of definitions) {
    if (decl.getKindName() !== 'ClassDeclaration') continue;
    if (decl === selfClass) continue;

    if (decl.getSourceFile().isDeclarationFile()) continue;

    const name = (decl as TsMorphClassDeclaration).getName();
    if (name) out.add(name);
  }
}

function formatList(values: string[]): string {
  return values.join(', ');
}

export const cbo = {
  meta: {
    type: 'suggestion' as const,
    docs: {
      description:
        'enforce a maximum Coupling Between Objects (CBO) — count of distinct external classes referenced from this class. Outgoing-only in this release; bidirectional (incoming + outgoing) lands in a follow-up task.',
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
        "Class '{{className}}' has CBO of {{cbo}} (max: {{max}}).\n  Outgoing ({{outgoingCount}}): {{outgoing}}",
    },
  },
  create(context: RuleContext) {
    const userOptions = context.options[0];
    const merged: Partial<CboOptions> =
      userOptions != null && typeof userOptions === 'object'
        ? (userOptions as Partial<CboOptions>)
        : {};
    const options: CboOptions = {
      max: typeof merged.max === 'number' ? merged.max : DEFAULT_MAX,
      tsconfigPath: merged.tsconfigPath,
    };

    const singleton = getProjectSingleton(options.tsconfigPath);
    if (!singleton.isAvailable) {
      return {
        ClassDeclaration: () => {},
        ClassExpression: () => {},
      };
    }

    const project = singleton.project;
    const filename = context.getFilename();

    const check = (node: unknown): void => {
      if (!isAstNode(node)) return;
      if (node.type !== 'ClassDeclaration' && node.type !== 'ClassExpression')
        return;

      const classNode = node as ClassLikeNode;
      const className = getClassName(classNode);
      if (!className) return;

      const tsmClass = findTsMorphClass(project, filename, className);
      if (!tsmClass) return;

      const outgoing = collectOutgoingClasses(tsmClass);
      const outgoingCount = outgoing.size;
      const cboValue = outgoingCount;

      if (cboValue <= options.max) return;

      const outgoingList = [...outgoing].sort();
      const outgoingStr = formatList(outgoingList);

      context.report({
        node: classNode,
        message: `Class '${className}' has CBO of ${cboValue} (max: ${options.max}).\n  Outgoing (${outgoingCount}): ${outgoingStr}`,
        data: {
          className,
          cbo: cboValue,
          max: options.max,
          outgoingCount,
          outgoing: outgoingStr,
        },
      });
    };

    return {
      ClassDeclaration: check,
      ClassExpression: check,
    };
  },
};

export default cbo;
