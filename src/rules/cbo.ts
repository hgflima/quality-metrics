/**
 * Coupling Between Objects (CBO) rule — bidirectional (TASK-022).
 *
 * For each class declaration, count the distinct external classes that the
 * class is coupled to in either direction (outgoing + incoming) and report
 * once when the sum exceeds the configured `max`.
 *
 * Definition (Chidamber & Kemerer, 1994), bidirectional flavor used here:
 *   CBO(C) = |outgoing(C)| + |incoming(C)|
 *     outgoing(C) = { C' : C uses methods or instance variables of C' }
 *     incoming(C) = { C' : C' uses methods or instance variables of C }
 *
 * What counts as outgoing:
 *   - Identifier references inside class members whose symbol resolves to a
 *     `ClassDeclaration` in another file.
 *
 * What counts as incoming:
 *   - Any reference to this class name from inside another class's members
 *     (constructor, methods, getters, setters, properties), regardless of
 *     whether the referring class lives in the same or a different file.
 *
 * What does NOT count (in either direction):
 *   - Inheritance edges (`extends` / `implements`) — per C&K. Outgoing avoids
 *     them by iterating `class.getMembers()` (which excludes heritage clauses);
 *     incoming avoids them by skipping any reference whose ancestor chain
 *     passes through a `HeritageClause`.
 *   - Self-references (the class referring to itself).
 *   - Declarations from `.d.ts` files (built-in types, ambient libs).
 *   - References at module/file level outside any class body (e.g. the bare
 *     `import { X }` statement, top-level type aliases, etc.).
 *
 * Diagnostic format (per docs/mvp/03-technical-architecture.md):
 *   "Class 'OrderController' has CBO of 12 (max: 10).
 *      Outgoing (7): OrderService, PaymentService, ...
 *      Incoming (5): AdminPanel, CheckoutFlow, ..."
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
  Node as TsMorphNode,
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
 * the C&K "exclude inheritance" rule is enforced for outgoing edges.
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

/**
 * Find every class (in any source file loaded into the ts-morph Project) whose
 * body references `cls`. Uses TypeScript's "Find All References" service via
 * `findReferencesAsNodes()`, then for each reference walks up the AST:
 *   - if the chain crosses a `HeritageClause` → skip (inheritance excluded)
 *   - else attribute the reference to the innermost containing class
 * Self-references (declaration site, references inside `cls` itself) drop out
 * via the `containingClass === cls` guard.
 */
function collectIncomingClasses(cls: TsMorphClassDeclaration): Set<string> {
  const out = new Set<string>();

  for (const ref of cls.findReferencesAsNodes()) {
    if (ref.getSourceFile().isDeclarationFile()) continue;

    const containing = findContainingClassExcludingHeritage(ref);
    if (!containing) continue;
    if (containing === cls) continue;

    const name = containing.getName();
    if (name) out.add(name);
  }

  return out;
}

/**
 * Walk ancestors of `node` and return the innermost containing class, or
 * `null` if any ancestor in that chain is a `HeritageClause` (the reference
 * lives inside an `extends` / `implements` clause and must be excluded per
 * C&K). Also returns `null` if the reference is not contained in any class
 * (e.g. top-level imports, type aliases, function declarations).
 */
function findContainingClassExcludingHeritage(
  node: TsMorphNode,
): TsMorphClassDeclaration | null {
  let current: TsMorphNode | undefined = node.getParent();
  while (current) {
    const kind = current.getKindName();
    if (kind === 'HeritageClause') return null;
    if (kind === 'ClassDeclaration' || kind === 'ClassExpression') {
      return current as TsMorphClassDeclaration;
    }
    current = current.getParent();
  }
  return null;
}

function formatList(values: string[]): string {
  return values.join(', ');
}

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
    // ESLint v9+ exposes `context.filename` (property); legacy v8 exposes
    // `getFilename()`. OXLint matches the v9+ shape. Read both so this rule
    // works under any host runtime — see RuleContext in src/types.ts.
    const filename = context.filename ?? context.getFilename?.() ?? '';
    if (!filename) {
      return {
        ClassDeclaration: () => {},
        ClassExpression: () => {},
      };
    }

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
      const incoming = collectIncomingClasses(tsmClass);
      const outgoingCount = outgoing.size;
      const incomingCount = incoming.size;
      const cboValue = outgoingCount + incomingCount;

      if (cboValue <= options.max) return;

      const outgoingList = [...outgoing].sort();
      const incomingList = [...incoming].sort();
      const outgoingStr = formatList(outgoingList);
      const incomingStr = formatList(incomingList);

      context.report({
        node: classNode,
        message: `Class '${className}' has CBO of ${cboValue} (max: ${options.max}).\n  Outgoing (${outgoingCount}): ${outgoingStr}\n  Incoming (${incomingCount}): ${incomingStr}`,
        data: {
          className,
          cbo: cboValue,
          max: options.max,
          outgoingCount,
          outgoing: outgoingStr,
          incomingCount,
          incoming: incomingStr,
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
