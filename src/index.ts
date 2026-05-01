/**
 * Plugin entry point.
 *
 * Exposes the OXLint / ESLint plugin object alongside the public TypeScript
 * contracts. Rule keys are the short names; consumers reference them under
 * the namespace declared in `meta.name` (e.g. `quality-metrics/wmc`).
 *
 * Only the fast-tier rules (`wmc`, `halstead`, `lcom`) are wired in this
 * release. Deep-tier rules (`cbo`, `dit`) ship in a later iteration once the
 * ts-morph project singleton is in place (TASK-020+).
 */

import { wmc } from './rules/wmc.js';
import { halstead } from './rules/halstead.js';
import { lcom } from './rules/lcom.js';

export type {
  ReportDescriptor,
  RuleContext,
  WmcOptions,
  HalsteadOptions,
  LcomOptions,
  CboOptions,
  DitOptions,
  HalsteadMetrics,
  ClassMethodAttributes,
  ProjectSingleton,
} from './types.js';

export { wmc } from './rules/wmc.js';
export { halstead } from './rules/halstead.js';
export { lcom } from './rules/lcom.js';

export const meta = {
  name: 'quality-metrics',
  version: '0.0.0',
} as const;

export const rules = {
  wmc,
  halstead,
  lcom,
} as const;

const plugin = {
  meta,
  rules,
} as const;

export default plugin;
