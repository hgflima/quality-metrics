/**
 * Pure LCOM1 computation — Lack of Cohesion of Methods (Chidamber & Kemerer, 1994).
 *
 * For each unordered method pair count P (no shared `this.X` access) and Q
 * (at least one shared access). LCOM = max(P - Q, 0). Extracted from
 * `rules/lcom.ts` so the same calculation can be reused outside of a lint
 * context (e.g. metric reports).
 *
 * Methods with fewer than 2 function-bodied members yield `lcom = 0` and
 * empty pair lists by definition.
 */

import { extractThisAccesses, type FunctionLikeNode } from './this-access.js';
import { collectClassMethods, getMethodName, type ClassLikeNode } from './ast-shared.js';

export interface LcomResult {
  lcom: number;
  pairs: { same: number; different: number };
  unrelated: Array<readonly [string, string]>;
}

function intersects(a: Set<string>, b: Set<string>): boolean {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of small) if (big.has(x)) return true;
  return false;
}

interface MethodAttrs {
  name: string;
  accessed: Set<string>;
}

export function computeLcom(node: ClassLikeNode): LcomResult {
  const methods = collectClassMethods<MethodAttrs>(node, (key, computed, value) => ({
    name: getMethodName(key, computed),
    accessed: extractThisAccesses(value as unknown as FunctionLikeNode),
  }));

  if (methods.length < 2) {
    return { lcom: 0, pairs: { same: 0, different: 0 }, unrelated: [] };
  }

  let same = 0;
  let different = 0;
  const unrelated: Array<readonly [string, string]> = [];
  for (let i = 0; i < methods.length; i++) {
    for (let j = i + 1; j < methods.length; j++) {
      const a = methods[i]!;
      const b = methods[j]!;
      if (intersects(a.accessed, b.accessed)) {
        same++;
      } else {
        different++;
        unrelated.push([a.name, b.name] as const);
      }
    }
  }

  return {
    lcom: Math.max(different - same, 0),
    pairs: { same, different },
    unrelated,
  };
}
