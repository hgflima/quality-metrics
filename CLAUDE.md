# quality-metrics

OXLint/ESLint plugin enforcing five empirically-backed OO quality metrics — **WMC**, **Halstead Volume/Effort**, **LCOM**, **CBO**, **DIT** — designed for agentic coding loops where fast feedback after every file write matters more than a single end-of-day report. Audience: developers wiring quality gates into their own JS/TS projects.

## Agent Behavior

1. **Think before coding** — state assumptions, ask when ambiguous, surface tradeoffs. Don't pick silently between interpretations.
2. **Simplicity first** — minimum code that solves the problem. No speculative abstractions, no unrequested flexibility.
3. **Surgical changes** — touch only what's required. Don't refactor adjacent code. Match existing style.
4. **Goal-driven execution** — define success criteria, loop until verified. Every changed line traces to the request.

## Tech Stack

- **Language:** TypeScript 5.3 (strict, ESM-first, ships dual ESM/CJS via `tsup` shims)
- **Runtime:** Node >= 18
- **Bundler:** `tsup` → `dist/` (entry: `src/index.ts`)
- **Tests:** `vitest` — unit config (`vitest.config.ts`) + separate e2e config (`vitest.e2e.config.ts`) for the OXLint CLI integration suite. Coverage via `@vitest/coverage-v8`, gated at lines ≥ 80%.
- **Self-lint / format:** `oxlint` + `oxfmt` (the plugin lints itself by loading its own compiled bundle)
- **Deep-tier dep:** `ts-morph` is an **optional peer dependency** (`>=23.0.0`). Fast-tier rules never import it; deep-tier rules silently no-op when it's missing.
- **Report tooling:** `tsx` runs `scripts/report/` to emit `report/index.html` + `report/metrics.json` from the same pure metric helpers the rules use.

## Project Structure

```
src/
├── index.ts              — Plugin entry: `meta`, `rules`, default export
├── project-singleton.ts  — Cached ts-morph Project per (tsconfig, process); Proxy stub when unavailable
├── types.ts              — Public contracts (RuleContext, options, metrics, ProjectSingleton)
├── rules/                — Five rules: wmc, halstead, lcom (fast) · cbo, dit (deep)
└── utils/                — AST helpers (ast-shared, cc, halstead, this-access, ts-morph-rule) + pure metric helpers extracted from each rule (cbo-graph, dit-chain, lcom-aggregate, wmc-aggregate)

tests/
├── rules/                — Per-rule unit tests
├── integration/          — eslint-compat, hook-wiring, publish-workflow
├── integration/oxlint-cli/ — End-to-end CLI runs (excluded from main vitest config)
├── benchmarks/           — `perf-gate.test.ts` + `perf.bench.ts`
└── fixtures/             — Generated test fixtures + e2e tsconfig

configs/                  — Published presets (`oxlint.fast.json`, `oxlint.deep.json`)
fixtures/                 — Consumer-facing examples (`claude-settings.example.json`, `post-edit.example.sh`, `lintstagedrc.example.js`)
specs/                    — Design specs and architecture notes
scripts/report/           — CLI metric report (`tsx`-run); consumes the pure helpers in `src/utils/`
report/                   — Generated artifacts (`index.html`, `metrics.json`) from `npm run report`
.claude/hooks/post-edit.sh — Rebuilds dist + runs fast tier on edited `src/*.ts(x)`
```

The fast/deep tier split is **load-bearing** — see Key Conventions.

## Development

```bash
npm install
npm run build               # tsup → dist/ (required before lint, e2e, or oxlint runs)
npm run test                # vitest unit suite
npm run test:coverage       # vitest with v8 coverage (gates lines >= 80%)
npm run test:e2e            # builds, then runs oxlint CLI integration tests
npm run test:watch
npm run typecheck           # tsc --noEmit
npm run lint                # build + lint:fast + lint:deep
npm run lint:fast           # quality-metrics/wmc, halstead, lcom on src/
npm run lint:deep           # quality-metrics/cbo, dit on src/
npm run lint:fix            # build + oxlint --fix (fast tier only)
npm run fmt                 # oxfmt
npm run fmt:check
npm run bench               # vitest bench
npm run report              # tsx scripts/report — emits report/index.html + report/metrics.json
```

Pre-commit (via `simple-git-hooks` + `lint-staged`) runs `npm run build && npx lint-staged`, which fmt-checks and lints staged files through both tiers.

## Documentation Lookup

For any library, framework, SDK, API, CLI tool, or cloud service — including ESLint, OXLint, ts-morph, vitest, and tsup — query **context7 first**. Fall back to web search or training knowledge only when context7 returns nothing relevant.

## Key Conventions

- **Build before lint, always.** Both `oxlint.fast.json` and `oxlint.deep.json` set `"jsPlugins": ["./dist/index.js"]` — the plugin self-lints via its compiled bundle. Stale `dist/` produces stale lint results. The `post-edit.sh` hook rebuilds when any `src/*.ts` is newer than `dist/index.js`; mirror that check in any new automation.
- **Fast-tier rules MUST NOT import `ts-morph`** (directly or transitively). The import alone adds ~200ms of compiler load — incompatible with running on every `Write`/`Edit`/`MultiEdit`. Fast tier = `wmc`, `halstead`, `lcom`. If a fast-tier rule needs cross-file data, it belongs in deep tier instead.
- **Deep-tier rules go through `createDeepClassVisitor`** (`src/utils/ts-morph-rule.ts`). It acquires the singleton, gates on `ProjectSingleton.isAvailable`, resolves the class in the project, and hands a `{ classNode, className, tsmClass }` triple to the analysis callback. Don't call `getProjectSingleton` directly from a rule.
- **Never touch `singleton.project` without checking `isAvailable`.** When `ts-morph` is missing or `Project` construction fails, the singleton returns a `Proxy`-backed stub that throws on every property access. Gating is mandatory; silently no-op the rule otherwise.
- **One `Project` per `(tsconfigPath, process)` tuple.** Per-file ts-morph instantiation turns a 5s lint into a 5-minute lint on a 500-file repo. The cache key is `tsconfigPath ?? '<default>'`; same path = same Project; different paths = separate Projects.
- **Read filename via the v8/v9 fallback.** `context.filename ?? context.getFilename?.() ?? ''` (helper `getFilename` in `ts-morph-rule.ts`). OXLint and ESLint v9 expose `filename`; legacy ESLint v8 only exposes `getFilename()`.
- **Diagnostic `data` payload is part of the public contract.** Every report carries a structured `data` field (shapes documented in README.md "Diagnostic data payload"). Adding/renaming fields is a breaking change for downstream formatters and dashboards. The OXLint JSON formatter does not serialize `data` by design — keep `message` self-describing and stable.
- **No `any`.** `oxlint.fast.json` enforces `typescript/no-explicit-any: error` on this repo. Use precise types or `unknown` + narrowing.
- **`ignorePatterns` excludes `tests/`, `fixtures/`, `specs/`, `configs/`, `report/`, `scripts/`** from self-lint. Don't relax this without intent — fixtures contain deliberately-bad code used to drive tests, and `report/` holds generated artifacts.
- **Pure metric helpers stay pure.** `utils/cbo-graph.ts`, `utils/dit-chain.ts`, `utils/lcom-aggregate.ts`, `utils/wmc-aggregate.ts` answer "what is the metric for this class?" with no rule-context coupling. Rules own option parsing, thresholds, and `context.report`; helpers are reused by `scripts/report/` to generate batch reports. Don't import `RuleContext` or call `context.report` from a helper — that breaks the report path.
- **E2E tests live under a separate vitest config** (`vitest.e2e.config.ts`, 30s timeouts, forks pool). They require `dist/` to be fresh — `npm run test:e2e` always builds first; if you invoke `vitest run --config vitest.e2e.config.ts` directly, build manually beforehand.
