/**
 * Shared ts-morph Project singleton for deep-tier rules (CBO, DIT).
 *
 * Architecture (per docs/mvp/03-technical-architecture.md):
 *   - OXLint runs `createOnce` once per lint run; deep-tier rules call
 *     `getProjectSingleton(tsconfigPath)` from there to obtain a single Project
 *     instance shared by every visitor.
 *   - ESLint has no `createOnce`, so the same module-level cache provides the
 *     equivalent guarantee: only the first `create()` call pays the load cost,
 *     subsequent calls reuse the cached Project.
 *
 * `ts-morph` is an *optional* peer dependency. If it is not installed (fast-tier
 * users who never opt into CBO/DIT), or if construction fails (bad
 * tsConfigFilePath), the singleton returns `{ isAvailable: false, error }`
 * along with a stub `project` that throws on any property access. Callers must
 * check `isAvailable` before touching `project`.
 */

import { createRequire } from 'node:module';
import type { ProjectSingleton } from './types.js';

type TsMorphProject = import('ts-morph').Project;
type TsMorphProjectOptions = ConstructorParameters<
  typeof import('ts-morph').Project
>[0];

interface TsMorphModule {
  Project: new (opts?: TsMorphProjectOptions) => TsMorphProject;
}

/** Loader function — resolves and returns the `ts-morph` module. Test seam. */
export type TsMorphLoader = () => TsMorphModule;

const cache = new Map<string, ProjectSingleton>();
let loader: TsMorphLoader = defaultLoader;

function defaultLoader(): TsMorphModule {
  const requireFn = createRequire(import.meta.url);
  return requireFn('ts-morph') as TsMorphModule;
}

/**
 * Override the ts-morph loader. Pass `null` to restore the default. Clears the
 * cache so the next `getProjectSingleton` call re-runs the loader.
 *
 * Intended for tests that need to simulate a missing `ts-morph` dependency or
 * inject a lightweight Project stub.
 */
export function setTsMorphLoader(custom: TsMorphLoader | null): void {
  loader = custom ?? defaultLoader;
  cache.clear();
}

/** Clear the cache. Useful between independent test runs. */
export function resetProjectSingleton(): void {
  cache.clear();
}

/**
 * Get (or lazily build) the shared Project instance for the given tsconfig.
 *
 * Calls with the same `tsconfigPath` return the same Project — the project is
 * loaded once per (tsconfig, process) tuple. The default cache key (no
 * tsconfigPath) is `'<default>'`.
 *
 * If `ts-morph` is not installed or Project construction throws, returns
 * `{ isAvailable: false, error, project: <stub> }`. The stub throws on any
 * property access; callers MUST gate usage on `isAvailable`.
 */
export function getProjectSingleton(tsconfigPath?: string): ProjectSingleton {
  const key = tsconfigPath ?? '<default>';
  const cached = cache.get(key);
  if (cached) return cached;

  const result = buildSingleton(tsconfigPath);
  cache.set(key, result);
  return result;
}

function buildSingleton(tsconfigPath?: string): ProjectSingleton {
  let mod: TsMorphModule;
  try {
    mod = loader();
  } catch (e) {
    return unavailable(`Failed to load ts-morph: ${describeError(e)}`);
  }

  if (
    mod === null ||
    mod === undefined ||
    typeof (mod as { Project?: unknown }).Project !== 'function'
  ) {
    return unavailable(
      'ts-morph module loaded but does not export a Project constructor',
    );
  }

  try {
    const project = tsconfigPath
      ? new mod.Project({ tsConfigFilePath: tsconfigPath })
      : new mod.Project();
    return { project, isAvailable: true };
  } catch (e) {
    return unavailable(
      `Failed to construct ts-morph Project: ${describeError(e)}`,
    );
  }
}

function unavailable(message: string): ProjectSingleton {
  return {
    project: makeStubProject(),
    isAvailable: false,
    error: message,
  };
}

const STUB_BASE_MESSAGE =
  'ts-morph Project is not available — gate access on ProjectSingleton.isAvailable before using `project`.';

function makeStubProject(): TsMorphProject {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      throw new Error(`${STUB_BASE_MESSAGE} (accessed: ${String(prop)})`);
    },
    apply() {
      throw new Error(STUB_BASE_MESSAGE);
    },
    construct() {
      throw new Error(STUB_BASE_MESSAGE);
    },
  };
  return new Proxy({}, handler) as TsMorphProject;
}

function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
