# PRD: quality-metrics — OXLint Plugin for Empirically-Backed Code Quality Metrics

**Created:** 2026-05-01
**Last Updated:** 2026-05-01
**Status:** ⏳ Planning

---

## Git Strategy

**Approach:** Worktrees (recommended for parallel lanes)

| Lane | Branch | Worktree Path | Agent Type |
|------|--------|---------------|-----------|
| Base | `feature/quality-metrics` | (main checkout) | project-manager-agent |
| Lane A | `feature/quality-metrics/lane-a-plugin-core` | `.worktrees/lane-a` | coder-agent |
| Lane B | `feature/quality-metrics/lane-b-ts-morph-rules` | `.worktrees/lane-b` | coder-agent |
| Lane C | `feature/quality-metrics/lane-c-infra` | `.worktrees/lane-c` | infra-agent |
| Lane D | `feature/quality-metrics/lane-d-e2e` | `.worktrees/lane-d` | tester-agent |

### Merge Strategy

| Integration Point | Source Branches | Target | Merge Order | Verification |
|---|---|---|---|---|
| Batch 0 complete | Base | All lanes rebase | — | Contracts available in all worktrees |
| Integration | All lane branches | `feature/quality-metrics` | C → A → B → D | Full test suite passes |
| Feature complete | `feature/quality-metrics` | `main` | — | Full E2E + human review gate |

---

## Quick Navigation

### Requirements Documentation

1. [Overview & Goals](requirements/01-overview-and-goals.md)
2. [User Stories](requirements/02-user-stories.md)
3. [Technical Architecture](requirements/03-technical-architecture.md)
4. [Security & Performance](requirements/04-security-and-performance.md)
5. [E2E Test Specifications](requirements/05-e2e-test-specs.md)

### Task Assignments

1. [Task Breakdown](task_assignments/01-task-breakdown.md)
2. [Dependencies & Critical Path](task_assignments/02-dependencies-critical-path.md)
3. [Timeline Estimates](task_assignments/03-timeline-estimates.md)

---

## Feature Summary

`quality-metrics` is an OXLint-compatible JS plugin that enforces empirically-backed code quality rules derived from academic research (Chidamber & Kemerer, McCabe, Halstead). It operates in two execution tiers: fast single-file rules (WMC, Halstead, LCOM) that run on every Claude Code file-write hook, and deeper cross-file rules (CBO, DIT) powered by `ts-morph` via `createOnce` that run only at pre-commit. This tiered design maximizes feedback speed in agentic coding workflows while ensuring structural quality gates are enforced before code enters the repository.

### Core Capabilities

1. **Fast tier (< 1s)** — WMC, Halstead Volume/Effort, LCOM: single-file AST analysis, fires on every agent file write via Claude Code `PostToolUse` hook
2. **Deep tier (~3–5s)** — CBO (full bidirectional), DIT: cross-file analysis via `ts-morph` `createOnce`, fires only at pre-commit via `lint-staged`
3. **Dual-config architecture** — `oxlint.fast.json` and `oxlint.deep.json` with pre-configured hook wiring for Claude Code and `lint-staged`

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Plugin runtime | OXLint JS Plugin API (ESLint-compatible) | Rule execution environment |
| Cross-file analysis | ts-morph | TypeScript compiler API for CBO / DIT |
| Fast-tier trigger | Claude Code `PostToolUse` hook | Fires on every agent file write |
| Pre-commit trigger | lint-staged + simple-git-hooks | Fires deep rules at commit time |
| Test framework | Vitest | Unit + integration tests for rules |
| Language | TypeScript | Plugin and rule implementation |

---

## Agent Topology

| Agent Type | Count | Assigned Lanes | Primary Artifacts |
|-----------|-------|---------------|-------------------|
| coder-agent | 2 | Lanes A, B | Plugin core + ts-morph rules |
| tester-agent | 1 | Lane D | Rule test fixtures + E2E specs |
| infra-agent | 1 | Lane C | CI config, hook wiring, npm publish |
| reviewer-agent | 1 | Review gates | Code review between batches |
| project-manager-agent | 1 | Orchestration | This README |

---

## Execution Status

| Phase | Status | Progress |
|-------|--------|----------|
| Requirements & PRD | 🔄 In Progress | 100% |
| Contract Definitions (Batch 0) | ⏳ Not Started | 0% |
| Parallel Implementation | ⏳ Not Started | 0% |
| Integration | ⏳ Not Started | 0% |
| E2E Verification | ⏳ Not Started | 0% |
| npm publish | ⏳ Not Started | 0% |

---

## Document History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-05-01 | 1.0 | project-manager-agent | Initial PRD |

---

## Next Steps

1. Review and confirm PRD — resolve all `TODO` markers
2. Run Batch 0: define TypeScript contracts for plugin API and rule interfaces
3. Create worktrees and assign agents to lanes
