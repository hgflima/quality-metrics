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

export const meta = {
  name: 'quality-metrics',
  version: '0.0.0',
} as const;

export const rules = {} as const;

const plugin = {
  meta,
  rules,
} as const;

export default plugin;
