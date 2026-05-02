/**
 * Pure WMC computation — sum of cyclomatic complexity across class methods.
 *
 * Extracted from `rules/wmc.ts` so the same calculation can be reused outside
 * of a lint context (e.g. metric reports). The rule still owns option parsing,
 * thresholding, and `context.report` — this helper is just the "what is the
 * WMC of this class?" answer plus the per-method breakdown that drives both
 * the diagnostic message and the report payload.
 */

import { computeCC, type FunctionNode } from './cc.js';
import { collectClassMethods, getMethodName, type ClassLikeNode } from './ast-shared.js';

export interface WmcMethod {
  name: string;
  cc: number;
}

export interface WmcResult {
  wmc: number;
  methods: WmcMethod[];
}

export function computeWmc(node: ClassLikeNode): WmcResult {
  const methods = collectClassMethods<WmcMethod>(node, (key, computed, value) => ({
    name: getMethodName(key, computed),
    cc: computeCC(value as unknown as FunctionNode),
  }));

  let wmc = 0;
  for (const { cc } of methods) wmc += cc;

  return { wmc, methods };
}
