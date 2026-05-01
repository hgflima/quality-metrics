import { afterEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getProjectSingleton,
  resetProjectSingleton,
  setTsMorphLoader,
  type TsMorphLoader,
} from '../src/project-singleton';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HIGH_CBO_TSCONFIG = path.resolve(__dirname, 'fixtures/cbo/high-cbo/tsconfig.json');
const LOW_CBO_TSCONFIG = path.resolve(__dirname, 'fixtures/cbo/low-cbo/tsconfig.json');

afterEach(() => {
  setTsMorphLoader(null);
  resetProjectSingleton();
});

/* ──────────────────────────────────────────────────────────────────────── */
/* Caching semantics                                                         */
/* ──────────────────────────────────────────────────────────────────────── */

describe('getProjectSingleton — caching', () => {
  it('returns the same instance for repeated calls with the same tsconfigPath', () => {
    const fakeProject = { id: 'P1' };
    const loader: TsMorphLoader = vi.fn(() => ({
      Project: vi.fn(() => fakeProject) as unknown as TsMorphLoader extends never ? never : never,
    })) as unknown as TsMorphLoader;
    setTsMorphLoader(loader);

    const a = getProjectSingleton('/abs/tsconfig.json');
    const b = getProjectSingleton('/abs/tsconfig.json');

    expect(a).toBe(b);
    expect(a.project).toBe(fakeProject as unknown);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('returns separate instances for distinct tsconfigPaths', () => {
    const projects = new Map<string, object>();
    const Project = vi.fn(function (this: unknown, opts?: { tsConfigFilePath?: string }) {
      const key = opts?.tsConfigFilePath ?? '<default>';
      const obj = { key };
      projects.set(key, obj);
      return obj;
    });
    setTsMorphLoader(() => ({ Project }) as unknown as ReturnType<TsMorphLoader>);

    const a = getProjectSingleton('/abs/a/tsconfig.json');
    const b = getProjectSingleton('/abs/b/tsconfig.json');

    expect(a).not.toBe(b);
    expect(a.project).not.toBe(b.project);
    expect(Project).toHaveBeenCalledTimes(2);
  });

  it("treats missing tsconfigPath as the cache key '<default>'", () => {
    const Project = vi.fn(() => ({}));
    setTsMorphLoader(() => ({ Project }) as unknown as ReturnType<TsMorphLoader>);

    const first = getProjectSingleton();
    const second = getProjectSingleton(undefined);

    expect(first).toBe(second);
    expect(Project).toHaveBeenCalledTimes(1);
  });

  it('passes tsConfigFilePath to the Project constructor when provided', () => {
    const Project = vi.fn(() => ({}));
    setTsMorphLoader(() => ({ Project }) as unknown as ReturnType<TsMorphLoader>);

    getProjectSingleton('/some/tsconfig.json');

    expect(Project).toHaveBeenCalledWith({ tsConfigFilePath: '/some/tsconfig.json' });
  });

  it('omits tsConfigFilePath when not provided (default Project)', () => {
    const Project = vi.fn(() => ({}));
    setTsMorphLoader(() => ({ Project }) as unknown as ReturnType<TsMorphLoader>);

    getProjectSingleton();

    expect(Project).toHaveBeenCalledWith();
  });
});

/* ──────────────────────────────────────────────────────────────────────── */
/* Failure modes                                                             */
/* ──────────────────────────────────────────────────────────────────────── */

describe('getProjectSingleton — failure handling', () => {
  it('returns isAvailable: false when the loader throws (ts-morph not installed)', () => {
    setTsMorphLoader(() => {
      throw new Error("Cannot find module 'ts-morph'");
    });

    const result = getProjectSingleton();
    expect(result.isAvailable).toBe(false);
    expect(result.error).toContain('Failed to load ts-morph');
    expect(result.error).toContain("Cannot find module 'ts-morph'");
  });

  it('returns isAvailable: false when the loader returns a non-Project module', () => {
    setTsMorphLoader(() => ({}) as unknown as ReturnType<TsMorphLoader>);

    const result = getProjectSingleton();
    expect(result.isAvailable).toBe(false);
    expect(result.error).toContain('does not export a Project constructor');
  });

  it('returns isAvailable: false when Project construction throws', () => {
    const Project = vi.fn(() => {
      throw new Error('bad tsconfig');
    });
    setTsMorphLoader(() => ({ Project }) as unknown as ReturnType<TsMorphLoader>);

    const result = getProjectSingleton('/missing/tsconfig.json');
    expect(result.isAvailable).toBe(false);
    expect(result.error).toContain('Failed to construct ts-morph Project');
    expect(result.error).toContain('bad tsconfig');
  });

  it('describes non-Error throwables in the error message', () => {
    setTsMorphLoader(() => {
      throw 'string thrown';
    });
    const result = getProjectSingleton();
    expect(result.error).toContain('string thrown');
  });

  it('caches failure results — does not retry the loader on subsequent calls', () => {
    const loader = vi.fn(() => {
      throw new Error('boom');
    });
    setTsMorphLoader(loader);

    getProjectSingleton('/a/tsconfig.json');
    getProjectSingleton('/a/tsconfig.json');

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('returns a stub project that throws on any property access when unavailable', () => {
    setTsMorphLoader(() => {
      throw new Error('nope');
    });
    const result = getProjectSingleton();
    expect(result.isAvailable).toBe(false);

    expect(() => {
      // `getSourceFiles` is a real ts-morph method; access alone must throw.
      void (result.project as unknown as { getSourceFiles: unknown }).getSourceFiles;
    }).toThrow(/ts-morph Project is not available/);
  });

  it('stub project error message mentions which property was accessed', () => {
    setTsMorphLoader(() => {
      throw new Error('nope');
    });
    const result = getProjectSingleton();

    try {
      void (result.project as unknown as { addSourceFileAtPath: unknown }).addSourceFileAtPath;
      throw new Error('expected throw');
    } catch (e) {
      expect((e as Error).message).toContain('accessed: addSourceFileAtPath');
    }
  });
});

/* ──────────────────────────────────────────────────────────────────────── */
/* Test seams: setTsMorphLoader / resetProjectSingleton                      */
/* ──────────────────────────────────────────────────────────────────────── */

describe('setTsMorphLoader / resetProjectSingleton', () => {
  it('setTsMorphLoader clears the cache so the next call uses the new loader', () => {
    const a = vi.fn(() => ({ Project: vi.fn(() => ({ tag: 'A' })) }));
    setTsMorphLoader(a as unknown as TsMorphLoader);
    const first = getProjectSingleton('/x/tsconfig.json');
    expect((first.project as { tag: string }).tag).toBe('A');

    const b = vi.fn(() => ({ Project: vi.fn(() => ({ tag: 'B' })) }));
    setTsMorphLoader(b as unknown as TsMorphLoader);
    const second = getProjectSingleton('/x/tsconfig.json');
    expect((second.project as { tag: string }).tag).toBe('B');
  });

  it('setTsMorphLoader(null) restores the default loader', () => {
    setTsMorphLoader(
      () =>
        ({
          Project: vi.fn(() => ({ tag: 'stub' })),
        }) as unknown as ReturnType<TsMorphLoader>,
    );
    const stub = getProjectSingleton();
    expect((stub.project as { tag: string }).tag).toBe('stub');

    setTsMorphLoader(null);
    // After restore + cache clear, default loader should resolve real ts-morph.
    const real = getProjectSingleton();
    expect(real.isAvailable).toBe(true);
    expect(typeof (real.project as { getSourceFiles: () => unknown }).getSourceFiles).toBe(
      'function',
    );
  });

  it('resetProjectSingleton clears the cache without changing the loader', () => {
    const Project = vi.fn(() => ({}));
    setTsMorphLoader(() => ({ Project }) as unknown as ReturnType<TsMorphLoader>);

    getProjectSingleton('/x/tsconfig.json');
    getProjectSingleton('/x/tsconfig.json');
    expect(Project).toHaveBeenCalledTimes(1);

    resetProjectSingleton();
    getProjectSingleton('/x/tsconfig.json');
    expect(Project).toHaveBeenCalledTimes(2);
  });
});

/* ──────────────────────────────────────────────────────────────────────── */
/* End-to-end: real ts-morph against deep-tier fixtures                      */
/* ──────────────────────────────────────────────────────────────────────── */

describe('integration with real ts-morph', () => {
  it('loads the high-cbo fixture project and exposes its source files', () => {
    const result = getProjectSingleton(HIGH_CBO_TSCONFIG);
    expect(result.isAvailable).toBe(true);
    expect(result.error).toBeUndefined();

    const filenames = result.project
      .getSourceFiles()
      .map((sf) => path.basename(sf.getFilePath()))
      .sort();

    // OrderController.ts plus 7 services plus 5 referrers = 13 files.
    expect(filenames).toContain('OrderController.ts');
    expect(filenames).toContain('OrderService.ts');
    expect(filenames).toContain('CheckoutFlow.ts');
  });

  it('returns the same Project across separate calls within one process', () => {
    const a = getProjectSingleton(HIGH_CBO_TSCONFIG);
    const b = getProjectSingleton(HIGH_CBO_TSCONFIG);
    expect(a.project).toBe(b.project);
  });

  it('builds independent projects for different tsconfigs', () => {
    const high = getProjectSingleton(HIGH_CBO_TSCONFIG);
    const low = getProjectSingleton(LOW_CBO_TSCONFIG);
    expect(high.isAvailable).toBe(true);
    expect(low.isAvailable).toBe(true);
    expect(high.project).not.toBe(low.project);
  });
});
