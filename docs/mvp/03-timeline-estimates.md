# Timeline Estimates

## Agent Configuration

| Agent Type | Count | Throughput | Notes |
|-----------|-------|-----------|-------|
| coder-agent | 2 | 2–3 M-complexity tasks/batch | Lane A and Lane B run concurrently |
| tester-agent | 1 | 2–3 M-complexity tasks/batch | Lane D; integration tests blocked until Lanes A+B complete |
| infra-agent | 1 | 2–3 M-complexity tasks/batch | Lane C; mostly independent |
| reviewer-agent | 1 | 1 review pass/batch | Reviews all lane outputs before batch exit |

---

## Execution Plan

### Batch 0: Contracts & Foundation

**Goal:** Define all shared interfaces, scaffold project, create test fixtures. All lanes are blocked until this batch completes.

| Task ID | Task | Complexity | Agent |
|---------|------|-----------|-------|
| TASK-001 | TypeScript contracts (`src/types.ts`) | S | coder-agent |
| TASK-002 | Package scaffold (package.json, tsconfig, dirs) | S | infra-agent |
| TASK-003 | CC helper stub | S | coder-agent |
| TASK-004 | Test fixtures with hand-computed reference values | M | tester-agent |

**Batch Exit Criteria:**
- [ ] `src/types.ts` exported and reviewed — no interface changes permitted after this point without reviewer approval
- [ ] `tests/fixtures/` complete with `// METRICS:` comments
- [ ] `npm install` + `tsup build` + `vitest run` all pass (zero tests, no crashes)
- [ ] reviewer-agent approves all contracts

---

### Batch 1: Parallel Implementation Kickoff

**Active Lanes:** A, B, C, D (all 4)

| Task ID | Task | Complexity | Lane | Agent |
|---------|------|-----------|------|-------|
| TASK-010 | CC helper (full implementation) | M | A | coder-agent |
| TASK-011 | Halstead utility | M | A | coder-agent |
| TASK-012 | `this-access` utility | S | A | coder-agent |
| TASK-020 | ts-morph singleton (`createOnce` + ESLint fallback) | M | B | coder-agent |
| TASK-040 | CI pipeline (GitHub Actions) | M | C | infra-agent |
| TASK-030 | Unit tests: WMC fixtures (written against stub — will fail until Batch 2) | M | D | tester-agent |
| TASK-031 | Unit tests: Halstead fixtures | M | D | tester-agent |

**Batch Exit Criteria:**
- [ ] TASK-010: `computeCC` passes all specified unit test cases
- [ ] TASK-020: `createOnce` spy test passes (initialized exactly once per run)
- [ ] TASK-040: CI runs and reports pass/fail on main branch
- [ ] reviewer-agent approves utilities before rules are built on top

---

### Batch 2: Rule Implementation

**Active Lanes:** A, B, C, D

| Task ID | Task | Complexity | Lane | Agent |
|---------|------|-----------|------|-------|
| TASK-013 | WMC rule | M | A | coder-agent |
| TASK-014 | Halstead rule | M | A | coder-agent |
| TASK-015 | LCOM rule | L | A | coder-agent |
| TASK-021 | CBO rule — outgoing coupling | L | B | coder-agent |
| TASK-041 | Performance benchmark suite | M | C | infra-agent |
| TASK-032 | Unit tests: LCOM fixtures | M | D | tester-agent |
| TASK-033 | Unit tests: CBO + DIT fixtures (written against stubs) | L | D | tester-agent |

**Batch Exit Criteria:**
- [ ] TASK-013..015: All fast-tier rule unit tests pass with exact metric values matching fixtures
- [ ] TASK-021: Outgoing CBO unit tests pass
- [ ] TASK-041: Benchmark suite runs (targets may not be met yet)
- [ ] reviewer-agent approves rule implementations

---

### Batch 3: Completion & Wiring

**Active Lanes:** A, B, C

| Task ID | Task | Complexity | Lane | Agent |
|---------|------|-----------|------|-------|
| TASK-016 | Wire fast-tier rules into `src/index.ts` | S | A | coder-agent |
| TASK-017 | `configs/oxlint.fast.json` preset | S | A | coder-agent |
| TASK-022 | CBO — incoming coupling (bidirectional) | L | B | coder-agent |
| TASK-023 | DIT rule | M | B | coder-agent |
| TASK-024 | Wire deep-tier rules into `src/index.ts` | S | B | coder-agent |
| TASK-025 | `configs/oxlint.deep.json` preset | S | B | coder-agent |
| TASK-042 | npm publish workflow | S | C | infra-agent |
| TASK-043 | Package README | M | C | infra-agent |

**Batch Exit Criteria:**
- [ ] `oxlint --config oxlint.fast.json` runs and fires WMC + Halstead + LCOM — no other rules
- [ ] `oxlint --config oxlint.deep.json` runs and fires CBO + DIT — no other rules
- [ ] Fast tier benchmark: < 1s on 500-file fixture
- [ ] Deep tier benchmark: < 10s on 500-file fixture
- [ ] reviewer-agent approves wiring and config files

---

### Batch 4: Integration & Verification

**Active Lanes:** D (primary), all lanes for fixes

| Task ID | Task | Complexity | Agent |
|---------|------|-----------|-------|
| TASK-034 | Integration tests: OXLint + ESLint compatibility | L | tester-agent |
| TASK-035 | Integration tests: hook wiring (Claude Code + lint-staged) | M | tester-agent |
| — | Fix any issues found in integration | varies | coder-agent |

**Batch Exit Criteria:**
- [ ] All 18 E2E test specs passing (E2E-001 through E2E-016)
- [ ] OXLint v1+ and ESLint v9+ integration tests green
- [ ] No rule misfires or crashes in any integration scenario
- [ ] Performance targets confirmed in CI benchmark
- [ ] reviewer-agent final approval

---

## Milestones

| Milestone | Target Batch | Criteria |
|-----------|-------------|----------|
| M1: Contracts locked | Batch 0 | All interfaces defined, fixtures created, reviewer approved |
| M2: Fast tier complete | Batch 2–3 | WMC + Halstead + LCOM unit tests all pass |
| M3: Deep tier complete | Batch 3 | CBO + DIT unit tests pass; ts-morph singleton verified |
| M4: Integration verified | Batch 4 | All E2E tests pass; both config presets confirmed |
| M5: Ready to publish | Batch 4 | Go-live checklist complete |

---

## Risk Assessment

### Risk 1: OXLint `createOnce` API changes (alpha)

**Impact:** Breaks deep tier; requires fallback implementation
**Probability:** Medium (API is alpha)
**Mitigation:** Build ESLint module-level singleton fallback in parallel (TASK-020); if `createOnce` breaks, fallback activates automatically

### Risk 2: ts-morph performance on large fixtures

**Impact:** Deep tier exceeds 10s target on 500-file benchmark
**Probability:** Low–Medium
**Mitigation:** Add `"include"` scoping option in Batch 3 if benchmark fails; benchmark runs in Batch 2 to detect early

### Risk 3: Bidirectional CBO implementation complexity

**Impact:** TASK-022 takes longer than estimated (L → XL)
**Probability:** Medium — scanning all project files for references is non-trivial with ts-morph
**Mitigation:** TASK-021 (outgoing only) ships first and is independently useful; incoming is additive

---

## Go-Live Checklist

**Agent-Executable:**
- [ ] All P0 tasks complete (19 tasks)
- [ ] All 18 E2E tests passing
- [ ] Fast tier < 1s on 500-file benchmark (CI gate)
- [ ] Deep tier < 10s on 500-file benchmark (CI gate)
- [ ] `tsc --noEmit` clean
- [ ] `npm audit` — 0 high/critical vulnerabilities
- [ ] Plugin loads in OXLint v1+ without errors
- [ ] Plugin loads in ESLint v9+ without errors

**Human Review Gates:**
- [ ] Threshold values and research citations reviewed for accuracy
- [ ] npm publish authorization
- [ ] Package name `quality-metrics` availability confirmed on npm registry

**Operational:**
- [ ] GitHub repository public
- [ ] README with install instructions, threshold rationale, research citations
- [ ] CHANGELOG.md with v1.0.0 entry

---

## Execution Summary

| Metric | Value |
|--------|-------|
| Total Batches | 5 (Batch 0 through Batch 4) |
| Total Tasks | 28 |
| Max Parallel Agents | 4 |
| Critical Path Length | 5 batches |
| Theoretical Sequential Time | ~12 batches |
| Parallelization Speedup | ~2.4x |
