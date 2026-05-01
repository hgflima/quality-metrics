# Overview & Goals

## Executive Summary

`quality-metrics` is a standalone npm package that provides an OXLint-compatible JS plugin implementing five code quality metrics with strong empirical correlation to software defects: WMC (Weighted Methods per Class), Halstead Volume/Effort, LCOM (Lack of Cohesion of Methods), CBO (Coupling Between Objects), and DIT (Depth of Inheritance Tree). These metrics are derived from Chidamber & Kemerer (1994), Halstead (1977), and validated by multiple systematic literature reviews (IEEE, ACM, EMSE) as among the most predictive static indicators of bug-prone code.

The plugin is designed for agentic coding environments — specifically Claude Code — where fast, granular feedback loops are critical to preventing quality debt accumulation across many files. Rules are split into two execution tiers based on computational cost: a fast tier (< 1s, single-file AST analysis) that fires on every file write, and a deep tier (~3–5s, cross-file via ts-morph) that fires only at pre-commit.

The package is ESLint-API compatible, meaning it also runs unmodified in standard ESLint setups.

## Product Vision

### Problem Statement

AI coding agents produce code at rates that make manual quality review impractical. Without automated guardrails at the file-write level, agents accumulate structural quality debt (high coupling, low cohesion, oversized classes) across dozens of files before any feedback is received. By the time a pre-commit hook fires, the agent has already written 30 files with the same structural problem — and remediation becomes expensive.

Existing linters (OXLint, ESLint) cover cyclomatic complexity and LOC, but miss the OO-structural metrics with the strongest empirical correlation to bugs: CBO, WMC, LCOM, and DIT. These require either cross-file analysis or aggregation across methods, which standard lint rules cannot perform.

### Solution Overview

A two-tier plugin architecture:
- **Fast tier**: WMC, Halstead, LCOM computed via AST traversal within a single file. Integrated into Claude Code's `PostToolUse` hook so the agent receives feedback immediately after writing each file.
- **Deep tier**: CBO (bidirectional, cross-file) and DIT (full inheritance chain) computed via `ts-morph` initialized once via `createOnce`. Integrated into `lint-staged` at pre-commit, balancing accuracy against hook latency.

### Target End-Users

- **Primary**: Development teams using Claude Code or other AI coding agents in TypeScript/JavaScript projects
- **Secondary**: Any TypeScript project team wanting OO quality metrics in their lint pipeline (ESLint or OXLint)

## Goals & Objectives

### Primary Goals

1. **Metric coverage**: Implement all 5 metrics (WMC, Halstead Volume/Effort, LCOM, CBO, DIT) as OXLint/ESLint-compatible rules with configurable thresholds
2. **Tiered execution**: Fast tier < 1s on a 500-file project; deep tier < 10s on a 500-file project
3. **Claude Code integration**: Provide ready-to-use `CLAUDE.md` hook configuration and `oxlint.fast.json` / `oxlint.deep.json` presets

### Secondary Goals

1. **ESLint compatibility**: Plugin runs unmodified in ESLint v9+ flat config
2. **Documented thresholds**: Each rule ships with empirically-sourced default thresholds and references to supporting research

## Success Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Fast tier execution time | < 1s on 500-file TS project | Benchmark in CI against fixture project |
| Deep tier execution time | < 10s on 500-file TS project | Benchmark in CI against fixture project |
| Rule correctness | 100% match against hand-computed reference values | Unit tests with verified fixtures |
| ESLint compatibility | Plugin loads and all rules fire correctly in ESLint v9 flat config | Integration test suite |
| OXLint compatibility | Plugin loads and all rules fire correctly in OXLint v1+ | Integration test suite |

### Success Criteria

**Must Have (Launch Blockers):**
- [ ] All 5 rules implemented and passing unit tests with ≥ 95% correctness against reference values
- [ ] Fast tier (WMC, Halstead, LCOM) executes in < 1s on the 500-file benchmark fixture
- [ ] Deep tier (CBO, DIT) executes in < 10s on the 500-file benchmark fixture
- [ ] Plugin loads in both OXLint v1+ and ESLint v9+ without errors
- [ ] `oxlint.fast.json`, `oxlint.deep.json`, and `CLAUDE.md` hook snippet ship with the package

**Should Have (Post-Launch):**
- [ ] Auto-fix suggestions for WMC violations (extract method hint)
- [ ] VS Code extension integration via OXLint language server

## Scope

### In Scope

- OXLint JS plugin implementing: WMC, Halstead Volume, Halstead Effort, LCOM, CBO, DIT
- `createOnce` pattern for ts-morph initialization (CBO, DIT rules)
- Dual config files: `oxlint.fast.json` (fast tier) and `oxlint.deep.json` (deep tier)
- `lint-staged` configuration example
- Claude Code `CLAUDE.md` hook snippet
- Unit tests per rule with verified fixtures
- Integration tests for OXLint and ESLint compatibility
- CI benchmark suite for performance targets
- README with threshold rationale and research citations

### Out of Scope

- Readability Score (requires ML model — not implementable in lint)
- Process metrics / git churn (requires git history — not in scope for lint plugin)
- SonarQube integration or reporting UI
- Rules for languages other than JavaScript/TypeScript
- Auto-fix implementation (beyond hints) — post-launch

### Future Considerations

- Readability approximation via proxy metrics (identifier length, nesting depth)
- Rust-native implementations contributed to OXLint core

## Constraints

### Technical Constraints

- **OXLint JS Plugin API (alpha)**: `createOnce` and `before`/`after` lifecycle hooks are alpha-stage. Rules must degrade gracefully if these APIs are unavailable
- **ts-morph initialization cost**: Loading a full TypeScript project takes 2–8s depending on size. The deep tier must use `createOnce` to avoid per-file reinitializat — this is not optional
- **ESLint API surface**: `createOnce` is an OXLint-specific API. In ESLint, the equivalent must use module-level singleton initialization

### Business Constraints

- **Agent Capacity**: 2 coder-agents, 1 tester-agent, 1 infra-agent available in parallel
- **Timeline**: No hard deadline; quality over speed

## Assumptions

1. **OXLint JS Plugin alpha API is stable enough**: `createOnce` must remain functional. If removed, the deep tier falls back to ESLint-only mode. Risk: medium.
2. **ts-morph can load projects within time budget**: Projects > 1000 files may exceed the 10s target. Mitigation: benchmark early; add `include` filtering if needed.
3. **Target codebases use TypeScript**: LCOM and CBO rely on `this.property` access patterns and import resolution — both work best with typed TS code.

## Dependencies

### External

- **OXLint JS Plugin API**: Alpha — `createOnce` lifecycle required for CBO/DIT. Monitor for breaking changes.
- **ts-morph**: Stable. Used for cross-file type graph in deep tier.
- **TypeScript compiler (via ts-morph)**: Must be installed in consumer project.

### Internal

- None — this is a greenfield package.
