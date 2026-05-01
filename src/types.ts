/**
 * Shared TypeScript contracts for the quality-metrics plugin.
 *
 * Mirrors the interfaces specified in docs/mvp/03-technical-architecture.md.
 * Consumed by rules, helpers, and the project singleton across both fast and
 * deep tiers.
 */

export interface ReportDescriptor {
  message: string;
  node?: unknown;
  loc?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  data?: Record<string, string | number>;
}

export interface RuleContext {
  report(descriptor: ReportDescriptor): void;
  /**
   * Source file path for the unit currently being linted. Preferred accessor —
   * present on every modern ESLint v9+ context and on OXLint's JS-plugin
   * context. Some legacy ESLint v8 contexts only expose `getFilename()`, so
   * deep-tier rules read both: `context.filename ?? context.getFilename?.()`.
   */
  filename?: string;
  /**
   * Legacy ESLint v8 accessor. Deprecated in v9, removed in v10 — kept here
   * as an optional fallback so older host runtimes still resolve.
   */
  getFilename?(): string;
  options: unknown[];
}

export interface WmcOptions {
  /** Maximum allowed Weighted Methods per Class. Default: 20 */
  max: number;
}

export interface HalsteadOptions {
  /** Maximum allowed Halstead volume per function. Default: 1000 */
  maxVolume: number;
  /** Maximum allowed Halstead effort per function. Default: 400 */
  maxEffort: number;
}

export interface LcomOptions {
  /** Maximum allowed Lack of Cohesion of Methods. Default: 0 */
  maxLcom: number;
}

export interface CboOptions {
  /** Maximum allowed Coupling Between Objects. Default: 10 */
  max: number;
  /** Path to tsconfig.json used by ts-morph for project loading. */
  tsconfigPath?: string;
}

export interface DitOptions {
  /** Maximum allowed Depth of Inheritance Tree. Default: 5 */
  max: number;
  /** Path to tsconfig.json used by ts-morph for project loading. */
  tsconfigPath?: string;
}

export interface HalsteadMetrics {
  /** Distinct operators (η₁). */
  eta1: number;
  /** Distinct operands (η₂). */
  eta2: number;
  /** Total operators (N₁). */
  N1: number;
  /** Total operands (N₂). */
  N2: number;
  /** Vocabulary η = η₁ + η₂. */
  vocabulary: number;
  /** Length N = N₁ + N₂. */
  length: number;
  /** Volume V = N · log₂(η). */
  volume: number;
  /** Difficulty D = (η₁ / 2) · (N₂ / η₂). */
  difficulty: number;
  /** Effort E = D · V. */
  effort: number;
}

export interface ClassMethodAttributes {
  methodName: string;
  /** Names of `this.X` properties accessed within the method body. */
  accessedProperties: Set<string>;
}

export interface ProjectSingleton {
  project: import('ts-morph').Project;
  isAvailable: boolean;
  error?: string;
}
