# Dependencies & Critical Path

## Dependency Map

```
TASK-001 (contracts) ──→ TASK-003 (cc stub) ──→ TASK-010 (cc full) ──→ TASK-013 (wmc)  ─┐
                    │                                                                       │
                    ├──→ TASK-011 (halstead util) ──────────────────→ TASK-014 (halstead) ─┼→ TASK-016 (wire fast) → TASK-017 (fast config)
                    │                                                                       │
                    └──→ TASK-012 (this-access) ──────────────────→  TASK-015 (lcom)     ─┘

TASK-001 ──→ TASK-020 (singleton) ──→ TASK-021 (cbo out) ──→ TASK-022 (cbo in) ─┐
                                  └──→ TASK-023 (dit)                             ├→ TASK-024 (wire deep) → TASK-025 (deep config)
                                                                                  ┘

TASK-002 (scaffold) ──→ TASK-040 (CI) ──→ TASK-042 (publish)
        │           └──→ TASK-041 (bench)
        │
TASK-004 (fixtures) ──→ TASK-030..033 (unit tests)  ─┐
                    └──→ TASK-041 (bench fixtures)    ├→ TASK-034 (integration tests)
                                                      └→ TASK-035 (hook tests)
```

## Dependency Table

| Task | Depends On | Blocks | Type |
|------|-----------|--------|------|
| TASK-001 | None | TASK-003, TASK-011, TASK-012, TASK-020 | — |
| TASK-002 | None | TASK-040, TASK-041 | — |
| TASK-003 | TASK-001 | TASK-010 | Hard |
| TASK-004 | TASK-001 | TASK-030..033, TASK-041 | Contract |
| TASK-010 | TASK-003 | TASK-013 | Hard |
| TASK-011 | TASK-001 | TASK-014 | Hard |
| TASK-012 | TASK-001 | TASK-015 | Hard |
| TASK-013 | TASK-010 | TASK-016 | Hard |
| TASK-014 | TASK-011 | TASK-016 | Hard |
| TASK-015 | TASK-012 | TASK-016 | Hard |
| TASK-016 | TASK-013, TASK-014, TASK-015 | TASK-017, TASK-034 | Hard |
| TASK-017 | TASK-016 | TASK-035 | Hard |
| TASK-020 | TASK-001 | TASK-021, TASK-023 | Hard |
| TASK-021 | TASK-020 | TASK-022 | Hard |
| TASK-022 | TASK-021 | TASK-024 | Hard |
| TASK-023 | TASK-020 | TASK-024 | Hard |
| TASK-024 | TASK-022, TASK-023 | TASK-025, TASK-034 | Hard |
| TASK-025 | TASK-024 | TASK-035 | Hard |
| TASK-030..033 | TASK-004 | TASK-034 | Contract |
| TASK-034 | TASK-016, TASK-024, TASK-030..033 | None | Hard |
| TASK-035 | TASK-017, TASK-025 | None | Hard |
| TASK-040 | TASK-002 | TASK-042 | Hard |
| TASK-041 | TASK-002, TASK-004 | None | Hard |
| TASK-042 | TASK-040 | None | Hard |
| TASK-043 | TASK-016, TASK-024 | None | Soft |

---

## Critical Path

**Total Duration:** 5 batches

```
START → TASK-001/002 (S) → TASK-003/004 (S/M) → TASK-010/011/012 (M) → TASK-013/014/015 (M/L) → TASK-016 (S) → TASK-034 (L) → END
```

| Task | Complexity | Batch |
|------|-----------|-------|
| TASK-001 + TASK-002 | S + S | Batch 0 |
| TASK-003 + TASK-004 | S + M | Batch 0 |
| TASK-010 + TASK-011 + TASK-012 (parallel) | M | Batch 1 |
| TASK-013 + TASK-014 + TASK-015 (parallel in Lane A) | M/L | Batch 2 |
| TASK-016 + TASK-020 (parallel A+B) | S + M | Batch 2–3 |
| TASK-022 + TASK-023 | L + M | Batch 3 |
| TASK-034 (integration tests) | L | Batch 4 |

---

## Parallel Execution Lanes

| Lane | Focus | Agent | Branch | Tasks | Starts After |
|------|-------|-------|--------|-------|-------------|
| Base | Contracts + scaffold | coder + infra | `feature/quality-metrics` | TASK-001..004 | Immediately |
| Lane A | Fast-tier rules | coder-agent | `lane-a-plugin-core` | TASK-010..017 | Batch 0 complete |
| Lane B | Deep-tier rules | coder-agent | `lane-b-ts-morph-rules` | TASK-020..025 | Batch 0 complete |
| Lane C | Infrastructure | infra-agent | `lane-c-infra` | TASK-040..043 | Batch 0 complete |
| Lane D | Tests | tester-agent | `lane-d-e2e` | TASK-030..035 | Batch 0 complete (fixtures); integration tests after Batch 3 |

### Interface Contracts (Defined in Batch 0, Unlock Parallel Work)

**Contract 1: `src/types.ts`**
- Consumed by: Lane A (rule implementations), Lane B (ts-morph rules), Lane D (test assertions)
- All rule option interfaces and metric result shapes locked here

**Contract 2: `tests/fixtures/` + expected values**
- Consumed by: Lane D (unit tests reference expected values from fixture comments)
- Fixtures frozen after Batch 0 — any change requires explicit reviewer approval

**Contract 3: `src/utils/cc.ts` stub**
- Consumed by: Lane A (TASK-013 imports it before TASK-010 is complete)
- Stub returns 1; Lane A can build WMC rule structure while waiting for full CC implementation

### Lane Execution Timeline

```
Batch 0:  [Base: contracts + scaffold + fixtures] ─────────────────────────────
Batch 1+: [Lane A: fast rules] ────────────────────────────────────────────────┐
          [Lane B: ts-morph + deep rules] ──────────────────────────────────────┤→ [Integration Batch 4]
          [Lane C: CI + benchmark + publish] ───────────────────────────────────┤
          [Lane D: unit tests (from fixtures)] ──────────────────────────────────┘
                          ↑ integration tests start after Lane A + B complete
```

---

## Parallelization Metrics

| Metric | Value |
|--------|-------|
| Total tasks | 28 |
| Max parallel lanes | 4 |
| Sequential bottleneck (critical path) | 5 batches |
| Theoretical sequential time | ~12 batches |
| Parallelization speedup | ~2.4x |
