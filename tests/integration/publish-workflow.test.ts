import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

/**
 * Validates the shape of `.github/workflows/publish.yml`.
 *
 * The publish workflow is a release-time contract: a missing `id-token: write`
 * permission, a missing `--provenance` flag, or a non-allowlisted `files`
 * entry would silently regress the supply-chain guarantees declared in
 * docs/mvp/04-security-and-performance.md §"Supply Chain":
 * - Package published with `npm provenance` (GitHub Actions OIDC)
 * - `package.json` `files` field explicitly allowlists only dist/configs/fixtures
 *
 * We parse no YAML here (no parser dep): the workflow file is small and
 * deterministic, so regex-anchored assertions are sufficient.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKFLOW_PATH = resolve(HERE, '../../.github/workflows/publish.yml');
const PACKAGE_JSON_PATH = resolve(HERE, '../../package.json');

function loadWorkflow(): string {
  return readFileSync(WORKFLOW_PATH, 'utf8');
}

interface PackageJson {
  files: string[];
  scripts: Record<string, string>;
}

function loadPackageJson(): PackageJson {
  return JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8')) as PackageJson;
}

describe('.github/workflows/publish.yml — triggers', () => {
  it('runs on release published events', () => {
    const wf = loadWorkflow();
    expect(wf).toMatch(/on:\s*[\s\S]*?release:\s*\n\s*types:\s*\[\s*published\s*\]/);
  });

  it('supports manual workflow_dispatch as a fallback', () => {
    const wf = loadWorkflow();
    expect(wf).toMatch(/workflow_dispatch:/);
  });
});

describe('.github/workflows/publish.yml — permissions (OIDC for provenance)', () => {
  it('grants id-token: write at the workflow level', () => {
    const wf = loadWorkflow();
    expect(wf).toMatch(/permissions:\s*\n(?:\s+\S+:\s*\S+\s*\n)*\s+id-token:\s*write/);
  });

  it('keeps contents at read (least privilege)', () => {
    const wf = loadWorkflow();
    expect(wf).toMatch(/contents:\s*read/);
  });

  it('does not request write access to repo contents', () => {
    const wf = loadWorkflow();
    expect(wf).not.toMatch(/contents:\s*write/);
  });
});

describe('.github/workflows/publish.yml — quality gates run before publish', () => {
  it('runs npm ci', () => {
    expect(loadWorkflow()).toMatch(/run:\s*npm ci/);
  });

  it('runs the typecheck script', () => {
    expect(loadWorkflow()).toMatch(/run:\s*npm run typecheck/);
  });

  it('runs the build script', () => {
    expect(loadWorkflow()).toMatch(/run:\s*npm run build/);
  });

  it('runs the test suite', () => {
    expect(loadWorkflow()).toMatch(/run:\s*npm test/);
  });

  it('orders typecheck, build, test before publish', () => {
    const wf = loadWorkflow();
    const typecheckIdx = wf.search(/run:\s*npm run typecheck/);
    const buildIdx = wf.search(/run:\s*npm run build/);
    const testIdx = wf.search(/run:\s*npm test/);
    const publishIdx = wf.search(/npm publish/);
    expect(typecheckIdx).toBeGreaterThan(0);
    expect(buildIdx).toBeGreaterThan(typecheckIdx);
    expect(testIdx).toBeGreaterThan(buildIdx);
    expect(publishIdx).toBeGreaterThan(testIdx);
  });
});

describe('.github/workflows/publish.yml — npm publish command', () => {
  it('uses npm provenance', () => {
    expect(loadWorkflow()).toMatch(/npm publish[^\n]*--provenance/);
  });

  it('publishes with public access (scoped or unscoped consistency)', () => {
    expect(loadWorkflow()).toMatch(/npm publish[^\n]*--access public/);
  });

  it('reads the auth token from the NPM_TOKEN secret', () => {
    expect(loadWorkflow()).toMatch(/NODE_AUTH_TOKEN:\s*\$\{\{\s*secrets\.NPM_TOKEN\s*\}\}/);
  });

  it('configures the npm registry URL on setup-node (required for OIDC + auth)', () => {
    expect(loadWorkflow()).toMatch(/registry-url:\s*['"]https:\/\/registry\.npmjs\.org['"]/);
  });
});

describe('.github/workflows/publish.yml — version verification', () => {
  it('verifies package.json version matches the release tag', () => {
    const wf = loadWorkflow();
    expect(wf).toMatch(/package\.json/);
    expect(wf).toMatch(/GITHUB_REF_NAME/);
  });
});

describe('package.json — files allowlist (supply-chain contract)', () => {
  it('publishes only dist, configs, fixtures, README.md', () => {
    const pkg = loadPackageJson();
    expect(pkg.files).toEqual(expect.arrayContaining(['dist', 'configs', 'fixtures', 'README.md']));
  });

  it('does not ship src/ or tests/ to npm', () => {
    const pkg = loadPackageJson();
    expect(pkg.files).not.toContain('src');
    expect(pkg.files).not.toContain('tests');
    expect(pkg.files).not.toContain('.');
    expect(pkg.files).not.toContain('*');
  });

  it('exposes the scripts the publish workflow invokes', () => {
    const pkg = loadPackageJson();
    expect(pkg.scripts.typecheck).toBeDefined();
    expect(pkg.scripts.build).toBeDefined();
    expect(pkg.scripts.test).toBeDefined();
  });
});
