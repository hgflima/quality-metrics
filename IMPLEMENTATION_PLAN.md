# Implementation Plan

This file is generated and maintained by Ralph in planning mode.

Run `./loop.sh plan` (or `./loop-docker.sh plan`) to populate it.

## Priority 1: Batch 0 — Contracts & Project Scaffold

- [x] **TASK-002** — Scaffold package structure (`package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `src/index.ts`, directory tree, `.gitignore`). Validated: `npm install` ✅, `tsup` build produces dual ESM+CJS ✅, `vitest run` ✅, `tsc --noEmit` ✅.
- [ ] **TASK-001** — Define TypeScript contracts in `src/types.ts` (interfaces from `docs/mvp/03-technical-architecture.md`)
- [ ] **TASK-003** — Define CC helper interface + stub (`src/utils/cc.ts`) — depends on TASK-001
- [ ] **TASK-004** — Create test fixture files with hand-computed reference values — depends on TASK-001

## Priority 2: Lane A — Fast-Tier Rules (after Batch 0)

- [ ] **TASK-010** — Implement `cc.ts` helper (full)
- [ ] **TASK-011** — Implement `halstead.ts` helper
- [ ] **TASK-012** — Implement `this-access.ts` helper
- [ ] **TASK-013** — Implement `rules/wmc.ts`
- [ ] **TASK-014** — Implement `rules/halstead.ts`
- [ ] **TASK-015** — Implement `rules/lcom.ts`
- [ ] **TASK-016** — Wire fast-tier rules into `src/index.ts`
- [ ] **TASK-017** — Create `configs/oxlint.fast.json` preset

## Priority 3: Lane B — Deep-Tier Rules (after Batch 0)

- [ ] **TASK-020** — Implement `project-singleton.ts` (createOnce + ESLint fallback)
- [ ] **TASK-021** — Implement `rules/cbo.ts` — outgoing coupling
- [ ] **TASK-022** — Implement `rules/cbo.ts` — incoming coupling (bidirectional)
- [ ] **TASK-023** — Implement `rules/dit.ts`
- [ ] **TASK-024** — Wire deep-tier rules into `src/index.ts`
- [ ] **TASK-025** — Create `configs/oxlint.deep.json` preset

## Priority 4: Lane D — Tests

- [ ] **TASK-030** — Unit tests: WMC rule
- [ ] **TASK-031** — Unit tests: Halstead rule
- [ ] **TASK-032** — Unit tests: LCOM rule
- [ ] **TASK-033** — Unit tests: CBO + DIT rules
- [ ] **TASK-034** — Integration tests: OXLint + ESLint compatibility
- [ ] **TASK-035** — Integration tests: hook wiring (Claude Code + lint-staged)

## Priority 5: Lane C — Infrastructure

- [ ] **TASK-040** — CI pipeline (GitHub Actions) — test + type check + lint
- [ ] **TASK-041** — Performance benchmark suite + CI gate
- [ ] **TASK-042** — npm publish workflow (provenance, files allowlist)
- [ ] **TASK-043** — Package README with threshold rationale + research citations

## Notes / Discoveries

- `vitest.config.ts` uses `passWithNoTests: true` so `vitest run` exits 0 before any tests exist (satisfies TASK-002 AC).
- `tsconfig.json` excludes `tests/` from compilation (test files compiled by Vitest's own pipeline). Once Lane D ships, may need a `tsconfig.test.json` for stricter test type-checking.
- `node_modules`, `dist`, `package-lock.json` to be added/committed appropriately (lock file checked in; `node_modules`, `dist` ignored).
