# Security & Performance

## Performance Requirements

### Execution Time Targets

| Tier | Scope | Target | Measurement |
|------|-------|--------|-------------|
| Fast (WMC + Halstead + LCOM) | Single file | < 200ms | p95 across 100 representative TS files |
| Fast (WMC + Halstead + LCOM) | 500-file project | < 1s total | CI benchmark fixture |
| Deep (CBO + DIT, ts-morph init) | First run, 500-file project | < 10s total | CI benchmark fixture |
| Deep (CBO + DIT, ts-morph init) | First run, 2000-file project | < 30s total | CI benchmark fixture |
| Deep (CBO + DIT, after createOnce) | Per-file analysis | < 50ms per file | Profiling in benchmark |

### Performance Constraints

- **ts-morph `createOnce`** is mandatory for the deep tier. Per-file instantiation is prohibited — it increases deep tier time from ~5s to 300s+ on a 500-file project.
- **Fast tier must not import ts-morph** — the import alone adds ~200ms startup time due to TypeScript compiler loading.
- **Fast tier rules must not use `context.getScope()` recursively** — scope analysis is O(n) per node and acceptable for small functions but must be bounded.

### Benchmarks

Benchmarks are implemented in `tests/benchmarks/perf.bench.ts` using Vitest's `bench` API and run against a fixture project of 500 TypeScript files (generated, representative of a real medium-sized codebase).

```typescript
// tests/benchmarks/perf.bench.ts
bench('fast tier — 500 files', async () => {
  await runOxlint('oxlint.fast.json', FIXTURE_PROJECT_PATH)
}, { time: 5000 }) // must complete within 1s average

bench('deep tier — 500 files', async () => {
  await runOxlint('oxlint.deep.json', FIXTURE_PROJECT_PATH)
}, { time: 30000 }) // must complete within 10s average
```

CI fails if either benchmark exceeds its target by > 20%.

---

## Security Requirements

### Input Validation

- **Rule options**: All numeric thresholds must be validated as positive integers. Invalid options cause a rule configuration error (not a crash): `"max" must be a positive integer, got: -1`
- **tsconfigPath**: Must be validated as a resolvable file path before ts-morph initialization. Relative paths are resolved from the config file location (OXLint convention).
- **No file system writes**: The plugin is strictly read-only. It must never write to the file system, even for caching.

### Dependency Security

- `ts-morph` is the only non-dev dependency. Its version must be pinned with a caret range (`^23.0`) and audited on every release via `npm audit`.
- No network calls are made at any point during rule execution.
- Plugin code must not use `eval`, `new Function`, or `vm.runInContext`.

### Supply Chain

- Package published with `npm provenance` (GitHub Actions OIDC)
- `package.json` `files` field explicitly allowlists only `dist/`, `configs/`, `fixtures/` — no source files or test fixtures shipped

---

## Monitoring & Observability

### CI Quality Gates

All of the following must pass on every PR before merge:

| Gate | Tool | Failure Condition |
|------|------|-------------------|
| Unit tests | Vitest | Any test failure |
| Integration tests (OXLint) | Vitest + OXLint v1+ | Any rule misfire or crash |
| Integration tests (ESLint) | Vitest + ESLint v9+ | Any rule misfire or crash |
| Performance benchmarks | Vitest bench | Fast tier > 1s or deep tier > 10s on 500-file fixture |
| Type check | tsc --noEmit | Any TypeScript error |
| Lint (self-hosted) | oxlint.fast.json on src/ | Any WMC/Halstead/LCOM violation in plugin source itself |

### Rule Correctness Verification

Each rule has a set of fixture files with pre-computed expected values. Unit tests assert exact metric values (not just pass/fail):

```typescript
// example: wmc.test.ts
it('computes WMC = 8 for UserService', () => {
  const result = runRule(wmc, fixtures.userService)
  expect(result.diagnostics[0].data.wmc).toBe(8)
  expect(result.diagnostics[0].data.methods).toEqual([
    { name: 'getUser', cc: 1 },
    { name: 'validateEmail', cc: 3 },
    { name: 'createUser', cc: 4 },
  ])
})
```
