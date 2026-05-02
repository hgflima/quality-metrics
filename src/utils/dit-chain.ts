/**
 * Pure DIT computation — depth + chain of `extends` edges from a ts-morph
 * `ClassDeclaration` to the root of its inheritance tree. Extracted from
 * `rules/dit.ts` so the same calculation can be reused outside of a lint
 * context (e.g. metric reports).
 *
 * Stops on: no base class, base in a `.d.ts` file, or a cycle.
 */

import type { ClassDeclaration as TsMorphClassDeclaration } from 'ts-morph';

export interface DitResult {
  dit: number;
  chain: string[];
}

export function computeDit(cls: TsMorphClassDeclaration): DitResult {
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
