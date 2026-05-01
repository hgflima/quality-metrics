# Task Breakdown

## Summary

| Metric | Value |
|--------|-------|
| Total Epics | 5 |
| Total Tasks | 28 |
| Max Parallel Lanes | 4 |
| P0 Tasks | 19 |
| P1 Tasks | 7 |
| P2 Tasks | 2 |

### Agent Topology

| Agent Type | Count | Responsibilities |
|-----------|-------|-----------------|
| coder-agent | 2 | Lane A (fast tier rules) + Lane B (deep tier rules) |
| tester-agent | 1 | Lane D — fixture files + unit tests + integration tests |
| infra-agent | 1 | Lane C — CI, benchmarks, npm publish config |
| reviewer-agent | 1 | Review gates between batches |

---

## Epic 1: Contracts & Project Scaffold (Batch 0)

**Goal:** Define all TypeScript interfaces and project structure that unblock parallel lanes
**Total:** 4 tasks | 1 sequential lane (base branch)

| ID | Task | Priority | Complexity | Dependencies | Lane | Agent |
|----|------|----------|-----------|--------------|------|-------|
| TASK-001 | Define TypeScript contracts (`src/types.ts`) | P0 | S | None | Base | coder-agent |
| TASK-002 | Scaffold package structure + `package.json` + `tsconfig.json` | P0 | S | None | Base | infra-agent |
| TASK-003 | Define CC helper interface + stub (`src/utils/cc.ts`) | P0 | S | TASK-001 | Base | coder-agent |
| TASK-004 | Create all test fixture files with hand-computed reference values | P0 | M | TASK-001 | Base | tester-agent |

### Task Details

#### TASK-001: Define TypeScript contracts

**Description:** Create `src/types.ts` with all shared interfaces as specified in `03-technical-architecture.md` — `WmcOptions`, `HalsteadOptions`, `LcomOptions`, `CboOptions`, `DitOptions`, `HalsteadMetrics`, `ClassMethodAttributes`, `ProjectSingleton`, `RuleContext`.

**Outputs:** `src/types.ts`
**Acceptance Criteria:**
- [ ] All interfaces exported and matching specs in `03-technical-architecture.md` exactly
- [ ] `tsc --noEmit` passes on `types.ts` alone

---

#### TASK-002: Scaffold package structure

**Description:** Create `package.json` (with `quality-metrics` as name, `tsup` build, `vitest` test, dual ESM+CJS output), `tsconfig.json`, directory structure as specified in `03-technical-architecture.md`. Create stub `src/index.ts` that exports empty plugin object.

**Outputs:** `package.json`, `tsconfig.json`, `src/index.ts`, directory tree
**Acceptance Criteria:**
- [ ] `npm install` completes without errors
- [ ] `tsup` build produces `dist/index.js` (CJS) and `dist/index.mjs` (ESM)
- [ ] `vitest run` finds and runs 0 tests without crashing

---

#### TASK-003: Define CC helper stub

**Description:** Create `src/utils/cc.ts` with the exported function signature `computeCC(node: FunctionNode): number` and a stub implementation returning 1. This contract is consumed by TASK-005 (WMC rule).

**Outputs:** `src/utils/cc.ts`
**Acceptance Criteria:**
- [ ] Function exported with correct TypeScript signature
- [ ] Returns 1 for any input (stub — full implementation in TASK-010)

---

#### TASK-004: Create test fixtures

**Description:** Create all fixture TypeScript files listed in `05-e2e-test-specs.md` with hand-computed metric values documented in file-level comments. Fixtures are frozen references — metric values must be verified independently before committing.

**Outputs:** All files under `tests/fixtures/`
**Acceptance Criteria:**
- [ ] Each fixture file has a `// METRICS:` comment with all expected values
- [ ] Values verified by at least one independent computation (manual or reference tool)
- [ ] `tsconfig.json` files in fixture subdirectories are valid

---

## Epic 2: Fast-Tier Rules (Lane A — parallel after Batch 0)

**Goal:** Implement WMC, Halstead, LCOM rules
**Total:** 8 tasks | Lane A (sequential within lane)

| ID | Task | Priority | Complexity | Dependencies | Lane | Agent |
|----|------|----------|-----------|--------------|------|-------|
| TASK-010 | Implement `cc.ts` helper (full) | P0 | M | TASK-003 | A | coder-agent |
| TASK-011 | Implement `halstead.ts` helper | P0 | M | TASK-001 | A | coder-agent |
| TASK-012 | Implement `this-access.ts` helper | P0 | S | TASK-001 | A | coder-agent |
| TASK-013 | Implement `rules/wmc.ts` | P0 | M | TASK-010 | A | coder-agent |
| TASK-014 | Implement `rules/halstead.ts` | P0 | M | TASK-011 | A | coder-agent |
| TASK-015 | Implement `rules/lcom.ts` | P0 | L | TASK-012 | A | coder-agent |
| TASK-016 | Wire fast-tier rules into `src/index.ts` | P0 | S | TASK-013, TASK-014, TASK-015 | A | coder-agent |
| TASK-017 | Create `configs/oxlint.fast.json` preset | P0 | S | TASK-016 | A | coder-agent |

### Key Task Details

#### TASK-010: Implement CC helper

**Description:** Full implementation of `computeCC(node)`. Count `IfStatement`, `ForStatement`, `ForInStatement`, `ForOfStatement`, `WhileStatement`, `DoWhileStatement`, `SwitchCase`, `CatchClause`, `ConditionalExpression`, `LogicalExpression` (&&, ||, ??) nodes within the function body. Do not recurse into nested function bodies. Return count + 1.

**Acceptance Criteria:**
- [ ] Given `function f() { if (a) { if (b) {} } }`, `computeCC` returns 3
- [ ] Given `function f() {}`, returns 1
- [ ] Given `function f() { a && b }`, returns 2 (one logical operator)
- [ ] Does not count nodes inside nested `function` declarations or arrow functions

---

#### TASK-015: Implement LCOM rule

**Description:** Full LCOM1 computation. For each class: (1) iterate all `MethodDefinition` children; (2) for each method, extract all `this.X` MemberExpression accesses (do not recurse into nested functions); (3) build a set of accessed properties per method; (4) for each pair (mi, mj), P++ if no shared properties, Q++ if ≥ 1 shared; (5) LCOM1 = max(P-Q, 0). Report on `ClassDeclaration:exit` if LCOM > `maxLcom`.

**Acceptance Criteria:**
- [ ] LCOM computation matches reference values for all LCOM fixtures in `tests/fixtures/lcom/`
- [ ] `this` accesses inside nested arrow functions within a method ARE counted (they share the outer `this` context)
- [ ] `this` accesses inside nested named function declarations are NOT counted

---

## Epic 3: Deep-Tier Rules (Lane B — parallel after Batch 0)

**Goal:** Implement CBO and DIT rules using ts-morph
**Total:** 6 tasks | Lane B (sequential within lane)

| ID | Task | Priority | Complexity | Dependencies | Lane | Agent |
|----|------|----------|-----------|--------------|------|-------|
| TASK-020 | Implement `project-singleton.ts` (createOnce + ESLint fallback) | P0 | M | TASK-001 | B | coder-agent |
| TASK-021 | Implement `rules/cbo.ts` — outgoing coupling | P0 | L | TASK-020 | B | coder-agent |
| TASK-022 | Implement `rules/cbo.ts` — incoming coupling (bidirectional) | P0 | L | TASK-021 | B | coder-agent |
| TASK-023 | Implement `rules/dit.ts` | P1 | M | TASK-020 | B | coder-agent |
| TASK-024 | Wire deep-tier rules into `src/index.ts` | P0 | S | TASK-022, TASK-023 | B | coder-agent |
| TASK-025 | Create `configs/oxlint.deep.json` preset | P0 | S | TASK-024 | B | coder-agent |

### Key Task Details

#### TASK-020: Implement project singleton

**Description:** Create `src/project-singleton.ts`. For OXLint: export a `createOnce` lifecycle handler that initializes `ts-morph Project` once, stores it in shared context, handles initialization errors gracefully (sets `isAvailable: false`, stores error message). For ESLint fallback: export a module-level singleton that initializes lazily on first rule invocation. Both paths must return a `ProjectSingleton` interface.

**Acceptance Criteria:**
- [ ] In OXLint: `createOnce` is called exactly once per lint run regardless of file count (verified by spy in integration test)
- [ ] In ESLint: module-level singleton initialized on first rule invocation
- [ ] If tsconfig not found: `isAvailable: false`, error message captured, no exception thrown
- [ ] If ts-morph OOM: error caught, `isAvailable: false`, no process crash

---

#### TASK-022: CBO bidirectional coupling

**Description:** Extend TASK-021's outgoing CBO to add incoming coupling. Use ts-morph `getSourceFiles()` to scan all project files; for each class in each file, check if it references the target class. Count distinct referencing classes. Combine with outgoing count. Exclude `extends` and `implements` from both counts.

**Acceptance Criteria:**
- [ ] CBO = outgoing + incoming (excluding inheritance)
- [ ] CBO computation matches reference values for all CBO fixtures
- [ ] Performance: < 50ms per file after ts-morph is initialized

---

## Epic 4: Tests (Lane D — parallel after Batch 0)

**Goal:** Write all unit and integration tests
**Total:** 6 tasks | Lane D (sequential within lane)

| ID | Task | Priority | Complexity | Dependencies | Lane | Agent |
|----|------|----------|-----------|--------------|------|-------|
| TASK-030 | Unit tests: WMC rule | P0 | M | TASK-004 (fixtures) | D | tester-agent |
| TASK-031 | Unit tests: Halstead rule | P0 | M | TASK-004 | D | tester-agent |
| TASK-032 | Unit tests: LCOM rule | P0 | M | TASK-004 | D | tester-agent |
| TASK-033 | Unit tests: CBO + DIT rules | P0 | L | TASK-004 | D | tester-agent |
| TASK-034 | Integration tests: OXLint + ESLint compatibility | P1 | L | TASK-016, TASK-024 | D | tester-agent |
| TASK-035 | Integration tests: hook wiring (Claude Code + lint-staged) | P1 | M | TASK-017, TASK-025 | D | tester-agent |

---

## Epic 5: Infrastructure & Publishing (Lane C)

**Goal:** CI, benchmarks, npm publish setup
**Total:** 4 tasks | Lane C

| ID | Task | Priority | Complexity | Dependencies | Lane | Agent |
|----|------|----------|-----------|--------------|------|-------|
| TASK-040 | CI pipeline (GitHub Actions) — test + type check + lint | P0 | M | TASK-002 | C | infra-agent |
| TASK-041 | Performance benchmark suite + CI gate | P0 | M | TASK-002, TASK-004 | C | infra-agent |
| TASK-042 | npm publish workflow (provenance, files allowlist) | P1 | S | TASK-040 | C | infra-agent |
| TASK-043 | Package README with threshold rationale + research citations | P1 | M | TASK-016, TASK-024 | C | infra-agent |
