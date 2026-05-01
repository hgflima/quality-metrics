/**
 * Synthetic fixture generator for the performance benchmarks (TASK-041).
 *
 * Materializes a representative 500-file TypeScript project on disk under a
 * caller-supplied directory:
 *
 * <root>/
 * tsconfig.json            — included for ts-morph (deep-tier benchmarks).
 * fixture_000.ts ... fixture_NNN.ts
 *
 * The files are structured as a forest of inheritance chains (depth `CHAIN_DEPTH`,
 * `CHAIN_DEPTH = 5`):
 *
 * - chain root: a base class with no `extends`.
 * - subsequent files: `extends` the previous file in the chain.
 *
 * Each class has a constructor + several methods with branching and `this.X`
 * access so all five rules (WMC, Halstead, LCOM, CBO, DIT) have signal to
 * compute on. Output is purely JavaScript-compatible (no TS-only constructs):
 *
 * - Default ESLint parser (`espree`) accepts the same source verbatim.
 * - `ts-morph` accepts it as TypeScript with no type annotations.
 *
 * Generation is deterministic: two calls with the same `count` produce identical
 * file contents and identical chain topology.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const CHAIN_DEPTH = 5;

export interface GeneratedFixture {
  /** Absolute filesystem path to the generated file. */
  filePath: string;
  /** File contents written to disk (also returned for in-memory linting). */
  source: string;
  /** 0-based index in chain (0 = chain root, no `extends`). */
  depthInChain: number;
}

export interface GeneratedFixtureSet {
  /** Absolute path of the temp directory containing all files + tsconfig. */
  rootDir: string;
  /** Absolute path of the tsconfig.json (referenced by deep-tier rule options). */
  tsconfigPath: string;
  /** All generated source files, indexed in generation order. */
  files: GeneratedFixture[];
}

/**
 * Generate `count` source files under `rootDir`. The directory is wiped first
 * (if it exists) and recreated. Returns the materialized file metadata so
 * callers can iterate without re-reading disk.
 */
export function generateFixtureProject(rootDir: string, count: number): GeneratedFixtureSet {
  rmSync(rootDir, { recursive: true, force: true });
  mkdirSync(rootDir, { recursive: true });

  const tsconfigPath = path.join(rootDir, 'tsconfig.json');
  writeFileSync(tsconfigPath, TSCONFIG_CONTENT);

  const files: GeneratedFixture[] = [];

  for (let i = 0; i < count; i++) {
    const depthInChain = i % CHAIN_DEPTH;
    const fileName = `fixture_${pad(i)}.ts`;
    const filePath = path.join(rootDir, fileName);
    const className = classNameFor(i);

    let source: string;
    if (depthInChain === 0) {
      source = renderRoot(className, i);
    } else {
      const parentIndex = i - 1;
      const parentClass = classNameFor(parentIndex);
      const parentFile = `./fixture_${pad(parentIndex)}.js`;
      source = renderSubclass(className, parentClass, parentFile, i);
    }

    writeFileSync(filePath, source);
    files.push({ filePath, source, depthInChain });
  }

  return { rootDir, tsconfigPath, files };
}

/** Remove the generated tree. Safe no-op if `rootDir` does not exist. */
export function cleanupFixtureProject(rootDir: string): void {
  rmSync(rootDir, { recursive: true, force: true });
}

function pad(n: number): string {
  return n.toString().padStart(4, '0');
}

function classNameFor(i: number): string {
  return `Fixture${pad(i)}`;
}

/**
 * Chain root — no `extends`. Includes:
 * - constructor with property initialization
 * - 4 methods exercising branches, `this.X` access (some shared, some
 * disjoint), and arithmetic / logical operators (Halstead signal).
 *
 * `seed` is folded into a couple of integer literals so consecutive roots are
 * not byte-identical (keeps Halstead operand counts non-trivially varied).
 */
function renderRoot(className: string, seed: number): string {
  const a = (seed % 7) + 1;
  const b = (seed % 11) + 1;
  return `export class ${className} {
  constructor() {
    this.items = [];
    this.cache = new Map();
    this.count = 0;
  }
  add(item) {
    if (item == null) return false;
    if (this.cache.has(item.id)) return false;
    this.items.push(item);
    this.cache.set(item.id, item);
    this.count = this.count + 1;
    return true;
  }
  remove(id) {
    if (id == null) return false;
    const item = this.cache.get(id);
    if (!item) return false;
    const idx = this.items.indexOf(item);
    if (idx < 0) return false;
    this.items.splice(idx, 1);
    this.cache.delete(id);
    this.count = this.count - 1;
    return true;
  }
  total(weight) {
    let sum = 0;
    for (const it of this.items) {
      if (it.value != null) {
        sum = sum + it.value * (weight || 1);
      } else if (it.fallback != null) {
        sum = sum + it.fallback;
      }
    }
    return sum + ${a};
  }
  describe() {
    return 'class=${className};count=' + this.count + ';mod=' + ${b};
  }
}
`;
}

/**
 * Chain link — `extends` the previous file's class via a relative import.
 * Imports use the `.js` extension (TS Bundler resolution accepts both `.js`
 * and the bare specifier, but ESLint's default parser is happy with anything).
 *
 * Adds methods that override and call `super`, plus one method with a
 * `this.X` access disjoint from the parent's footprint to keep LCOM > 0 on a
 * subset of subclasses.
 */
function renderSubclass(
  className: string,
  parentClass: string,
  parentFile: string,
  seed: number,
): string {
  const a = (seed % 13) + 1;
  return `import { ${parentClass} } from '${parentFile}';

export class ${className} extends ${parentClass} {
  constructor() {
    super();
    this.tag = 'tag-${seed}';
  }
  process(input) {
    if (input == null) return null;
    if (input.length === 0) return [];
    const out = [];
    for (const v of input) {
      if (v >= 0 && v < ${a * 100}) {
        out.push(v * ${a});
      } else if (v < 0) {
        out.push(0);
      }
    }
    this.cache.set('last', out);
    return out;
  }
  retag(suffix) {
    if (typeof suffix !== 'string') return this.tag;
    this.tag = this.tag + ':' + suffix;
    return this.tag;
  }
  describe() {
    const base = super.describe();
    return base + ';tag=' + this.tag;
  }
}
`;
}

const TSCONFIG_CONTENT = `${JSON.stringify(
  {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      lib: ['ES2022'],
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      isolatedModules: true,
      noEmit: true,
    },
    include: ['**/*.ts'],
  },
  null,
  2,
)}\n`;
