/**
 * JSON formatter — pretty-prints the Report object with stable key ordering.
 * The schema is the one declared in `types.ts`; downstream tools consume it
 * verbatim.
 */

import type { Report } from './types.js';

export function formatJson(report: Report): string {
  return JSON.stringify(report, null, 2) + '\n';
}
