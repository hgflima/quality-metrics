/**
 * Plugin entry point.
 *
 * Exposes the OXLint / ESLint plugin object alongside the public TypeScript
 * contracts. Rule keys are the short names; consumers reference them under
 * the namespace declared in `meta.name` (e.g. `quality-metrics/wmc`).
 *
 * Both tiers are wired:
 * - Fast-tier (AST-only): `wmc`, `halstead`, `lcom`.
 * - Deep-tier (ts-morph backed): `cbo`, `dit`. These gracefully no-op when
 * the ts-morph peer dep is absent — see `src/project-singleton.ts`.
 */

import { wmc } from './rules/wmc.js';
import { halstead } from './rules/halstead.js';
import { lcom } from './rules/lcom.js';
import { cbo } from './rules/cbo.js';
import { dit } from './rules/dit.js';

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
export { cbo } from './rules/cbo.js';
export { dit } from './rules/dit.js';

export const meta = {
  name: 'quality-metrics',
  version: '0.0.0',
} as const;

export const rules = {
  wmc,
  halstead,
  lcom,
  cbo,
  dit,
} as const;

const plugin = {
  meta,
  rules,
} as const;

export default plugin;
