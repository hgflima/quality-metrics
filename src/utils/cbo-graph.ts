/**
 * Pure CBO graph collection — outgoing and incoming class references for a
 * ts-morph `ClassDeclaration`. Extracted from `rules/cbo.ts` so the same
 * traversal can be reused outside of a lint context (e.g. metric reports).
 *
 * Excludes (per Chidamber & Kemerer, 1994): inheritance edges (`extends` /
 * `implements`), self-references, declarations from `.d.ts` files, and
 * references that live outside any class body.
 */

import type {
  ClassDeclaration as TsMorphClassDeclaration,
  Identifier,
  Node as TsMorphNode,
} from 'ts-morph';

/**
 * Walk every member of `cls` (constructor, methods, getters, setters,
 * properties) and collect names of distinct external classes referenced from
 * within. `getMembers()` deliberately excludes heritage clauses.
 */
export function collectOutgoingClasses(cls: TsMorphClassDeclaration): Set<string> {
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
 * body references `cls`. Excludes heritage-clause references and self-refs.
 */
export function collectIncomingClasses(cls: TsMorphClassDeclaration): Set<string> {
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

function findContainingClassExcludingHeritage(node: TsMorphNode): TsMorphClassDeclaration | null {
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
