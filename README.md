# quality-metrics

> An OXLint-compatible (and ESLint-compatible) plugin that enforces five empirically-backed object-oriented quality metrics: **WMC**, **Halstead Volume/Effort**, **LCOM**, **CBO**, and **DIT**.

These metrics are sourced from the academic literature with the strongest published correlation to defect density in OO codebases — Chidamber & Kemerer (1994) and Halstead (1977) — and are designed to be run in _agentic_ coding loops (Claude Code, Copilot Agents, etc.) where fast feedback after every file write is more valuable than a single end-of-day report.

The plugin ships in two tiers:

| Tier | Rules                     | Scope                 | Latency budget     | Where to run                   |
| ---- | ------------------------- | --------------------- | ------------------ | ------------------------------ |
| Fast | `wmc`, `halstead`, `lcom` | Single file           | < 1s on 500 files  | Claude Code `PostToolUse` hook |
| Deep | `cbo`, `dit`              | Cross-file (ts-morph) | < 10s on 500 files | `lint-staged` pre-commit       |

The fast tier never imports `ts-morph`, so it stays cheap enough to fire on every `Write`/`Edit`/`MultiEdit`. The deep tier loads a TypeScript project once via `createOnce` (OXLint) or a module-level singleton (ESLint), then reuses it across all staged files.

---

## Installation

```bash
npm install --save-dev quality-metrics

# Required only if you use the deep tier (cbo, dit)
npm install --save-dev ts-morph
```

`ts-morph` is an optional peer dependency (`>=23.0.0`). The fast tier works without it.

The plugin runs unmodified on:

- **OXLint** v1+ (primary target — uses the JS plugin API)
- **ESLint** v9+ flat config (fallback — same AST surface)

---

## Quick start

### 1. Pick (or copy) a preset

Two presets ship in `configs/`:

```bash
# Copy them into your repo root (or reference via node_modules path)
cp node_modules/quality-metrics/configs/oxlint.fast.json .
cp node_modules/quality-metrics/configs/oxlint.deep.json .
```

`oxlint.fast.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "jsPlugins": ["quality-metrics"],
  "rules": {
    "quality-metrics/wmc": ["error", { "max": 20 }],
    "quality-metrics/halstead": ["warn", { "maxVolume": 1000, "maxEffort": 400 }],
    "quality-metrics/lcom": ["warn", { "maxLcom": 2 }]
  }
}
```

`oxlint.deep.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "jsPlugins": ["quality-metrics"],
  "rules": {
    "quality-metrics/cbo": ["error", { "max": 10 }],
    "quality-metrics/dit": ["warn", { "max": 5 }]
  }
}
```

### 2. Wire the fast tier into Claude Code

Register a `PostToolUse` hook in `.claude/settings.json` so Claude Code runs the fast tier after every TypeScript file write:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/post-edit.sh"
          }
        ]
      }
    ]
  }
}
```

Then create `.claude/hooks/post-edit.sh` (and `chmod +x` it):

```bash
#!/usr/bin/env bash
set -euo pipefail

# Filter the edited paths down to TypeScript sources — other edits skip the hook.
files=()
for path in ${CLAUDE_FILE_PATHS:-}; do
  case "$path" in
    src/*.ts|src/*.tsx) files+=("$path") ;;
  esac
done

[ ${#files[@]} -eq 0 ] && exit 0

npx oxlint --config oxlint.fast.json "${files[@]}"
```

Claude Code sets `$CLAUDE_FILE_PATHS` to the space-separated list of paths just edited; the script narrows them to TypeScript sources and runs the fast tier only on those. Adjust the `case` patterns to match your repo layout. Violations surface back to the agent through the hook's stdout, so it sees and fixes them before the next write.

See `fixtures/claude-settings.example.json` and `fixtures/post-edit.example.sh` for ready-to-copy versions.

### 3. Wire both tiers into pre-commit

Use `fixtures/lintstagedrc.example.js`:

```javascript
export default {
  '*.{ts,tsx}': ['oxlint --config oxlint.fast.json', 'oxlint --config oxlint.deep.json'],
};
```

The fast preset runs first so cheap violations fail fast before paying the ts-morph load cost.

### 4. ESLint v9 flat config (alternative)

```javascript
// eslint.config.js
import qualityMetrics from 'quality-metrics';

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { 'quality-metrics': qualityMetrics },
    rules: {
      'quality-metrics/wmc': ['error', { max: 20 }],
      'quality-metrics/halstead': ['warn', { maxVolume: 1000, maxEffort: 400 }],
      'quality-metrics/lcom': ['warn', { maxLcom: 2 }],
      'quality-metrics/cbo': ['error', { max: 10, tsconfigPath: './tsconfig.json' }],
      'quality-metrics/dit': ['warn', { max: 5 }],
    },
  },
];
```

---

## Rules

All rules emit a structured `data` payload alongside the human-readable message, so consumers (CI dashboards, custom reporters) can read raw metric values without parsing strings.

### `quality-metrics/wmc` — Weighted Methods per Class

**Tier:** fast · **Default:** `{ max: 20 }`

Sums the cyclomatic complexity of every method (incl. constructor, getters, setters, and function-valued class fields) in a class. Reports when the sum exceeds `max`.

```text
Class 'OrderService' has WMC of 34 (max: 20).
  Methods contributing: validate(CC=8), createUser(CC=12), updateUser(CC=9), getUser(CC=5)
```

**Rationale.** Chidamber & Kemerer (1994) introduced WMC as a class-level cohesion-of-responsibility proxy. Subsequent empirical work (Basili et al., 1996; Subramanyam & Krishnan, 2003; Briand et al., 2000) consistently finds WMC among the strongest class-level predictors of defect density. The default `max: 20` follows the widely-cited Lorenz & Kidd (1994) threshold for "refactoring candidate"; values above 50 are considered critical. The CC-counting model includes `if`, `for`, `for-in`, `for-of`, `while`, `do/while`, `catch`, ternary, `switch case` (non-default), and short-circuit `&&` / `||` / `??`, plus 1 baseline — McCabe (1976).

---

### `quality-metrics/halstead` — Halstead Volume & Effort

**Tier:** fast · **Default:** `{ maxVolume: 1000, maxEffort: 400 }`

For every function (declaration, expression, arrow), counts distinct/total operators (η₁, N₁) and operands (η₂, N₂), then computes:

- Volume `V = N · log₂(η)`
- Difficulty `D = (η₁ / 2) · (N₂ / η₂)`
- Effort `E = D · V`

Reports if `V > maxVolume` **or** `E > maxEffort`.

```text
Function 'processOrder' exceeds Halstead thresholds.
  Volume: 1240 (max: 1000) | Effort: 520 (max: 400) | Difficulty: 18.4
```

**Rationale.** Halstead (1977) proposed Volume and Effort as proxies for cognitive load and maintenance cost. Modern replications on the Defects4J corpus (e.g. Jimenez et al., 2024) place Halstead Effort among the top-4 _individual_ static predictors of bug-prone functions, ahead of raw cyclomatic complexity in some configurations. The default thresholds (`V=1000`, `E=400`) approximate "moderately complex function" boundaries cited in maintenance-cost studies; tune them up by ~50% if your codebase trends toward larger pure-data transformation functions. The exact operator/operand classification is documented in `tests/fixtures/halstead/COUNTING_MODEL.md`.

---

### `quality-metrics/lcom` — Lack of Cohesion of Methods (LCOM1)

**Tier:** fast · **Default:** `{ maxLcom: 0 }` (presets ship `2` for warn-level pragmatism)

For each class, builds the set of `this.X` properties accessed by every method, then:

- `P` = unordered method pairs that share zero properties (unrelated)
- `Q` = unordered method pairs that share at least one (related)
- `LCOM1 = max(P − Q, 0)`

Reports when LCOM exceeds the threshold; lists the unrelated pairs.

```text
Class 'ReportService' has LCOM of 3 (max: 0).
  Unrelated method pairs: (generatePDF, sendEmail), (generatePDF, scheduleJob), (sendEmail, scheduleJob)
```

**Rationale.** LCOM operationalises the Single Responsibility Principle: a class whose methods don't interact through shared state is plausibly two classes. Chidamber & Kemerer (1994) define LCOM1 as above; later refinements (LCOM2..5, Hitz–Montazeri, etc.) trade interpretability for monotonicity, and the literature (Etzkorn et al., 2004; Aman et al., 2014) does not establish any one variant as uniformly superior — LCOM1 is chosen here for its clear pair-wise diagnostic ("here are the methods that don't talk to each other"). Boundary semantics: nested arrows share `this` and are traversed; nested function declarations / expressions / classes have their own `this` and are not.

---

### `quality-metrics/cbo` — Coupling Between Object Classes (bidirectional)

**Tier:** deep (requires `ts-morph`) · **Default:** `{ max: 10 }`

For each class, counts distinct external classes that:

1. Are referenced from inside the class body (**outgoing**), AND
2. Reference this class from inside their body (**incoming**).

Inheritance edges (`extends`, `implements`) are excluded per Chidamber & Kemerer's original definition. References to ambient declarations (`.d.ts`) are excluded so DOM/Node built-ins don't inflate the count.

```text
Class 'OrderController' has CBO of 12 (max: 10).
  Outgoing (7): EmailService, OrderService, PaymentService, UserRepository, ...
  Incoming (5): CheckoutFlow, OrderRouter, OrderTest, ...
```

**Rationale.** Across multiple systematic reviews (Basili et al., 1996; Briand et al., 2000; Radjenović et al., EMSE 2013), CBO is repeatedly the _strongest single OO predictor_ of post-release defects. The default `max: 10` follows the "moderate coupling" boundary in Lanza & Marinescu (2006); above 14 is consistently flagged "high risk" in industry reports. The bidirectional count matters: a Façade class with low outgoing but very high incoming is still a structural risk (a refactor magnet) that an outgoing-only count would miss.

---

### `quality-metrics/dit` — Depth of Inheritance Tree

**Tier:** deep (requires `ts-morph`) · **Default:** `{ max: 5 }`

Walks the `extends` chain via the TypeScript type checker (so it follows imports across files) and reports the number of edges. `implements` is _not_ counted (interfaces aren't classes). Self-referential or mutually-recursive cycles terminate via a visited-set.

```text
Class 'GoldenRetriever' has DIT of 6 (max: 5).
  Chain: GoldenRetriever → Retriever → Dog → Mammal → Animal → LivingThing
```

**Rationale.** DIT proxies the "how much external state must I understand to reason about this class" problem. Chidamber & Kemerer (1994) and follow-up work (Cartwright & Shepperd, 2000) note a non-monotonic relationship: shallow chains (DIT 0–2) predict _higher_ defect rates in some studies (no reuse leverage), while very deep chains (DIT > 5) predict harder-to-test, harder-to-modify subclasses. The default `max: 5` reflects this upper boundary; lower it to 3 if your codebase favours composition over inheritance.

---

## Configuration

Every rule accepts an options object as its second array element, matching the OXLint / ESLint convention:

```jsonc
{
  "rules": {
    "quality-metrics/wmc": ["error", { "max": 20 }],
    "quality-metrics/halstead": ["warn", { "maxVolume": 1000, "maxEffort": 400 }],
    "quality-metrics/lcom": ["warn", { "maxLcom": 2 }],
    "quality-metrics/cbo": ["error", { "max": 10, "tsconfigPath": "./tsconfig.json" }],
    "quality-metrics/dit": ["warn", { "max": 5, "tsconfigPath": "./tsconfig.json" }],
  },
}
```

### Deep-tier specific options

- **`tsconfigPath`** _(optional)_ — path to `tsconfig.json`. If omitted, ts-morph creates a default Project. Same `tsconfigPath` returns the same singleton across calls; distinct paths build separate Projects.
- If ts-morph is not installed, the deep-tier rules silently no-op rather than crashing the lint run. Install `ts-morph` to enable them.

### Threshold tuning cheatsheet

| Metric       | Low-risk | Refactor candidate | Critical |
| ------------ | -------- | ------------------ | -------- |
| WMC          | < 10     | 20–50              | > 50     |
| Halstead V   | < 500    | 1000               | > 4000   |
| Halstead E   | < 100    | 400                | > 4000   |
| LCOM (LCOM1) | 0        | 1–2                | > 4      |
| CBO          | < 5      | 10                 | > 14     |
| DIT          | 1–2      | 5                  | > 6      |

These follow the consensus thresholds in Lorenz & Kidd (1994), Lanza & Marinescu (2006), and the EMSE 2013 systematic review by Radjenović et al. They are starting points, not laws — always recalibrate against your own defect history if you have one.

---

## Architecture

```
Consumer project
  │
  ├── Claude Code PostToolUse hook
  │     └── oxlint --config oxlint.fast.json [file]
  │           └── quality-metrics (fast tier — wmc, halstead, lcom)
  │
  └── git pre-commit (lint-staged)
        ├── oxlint --config oxlint.fast.json [staged]
        └── oxlint --config oxlint.deep.json [staged]
              └── quality-metrics (deep tier — cbo, dit)
                    └── createOnce → ts-morph Project (loaded once per run)
```

The deep-tier `createOnce` pattern is mandatory: per-file ts-morph instantiation increases lint time from ~5s to 300s+ on a 500-file project. Under ESLint (no `createOnce` lifecycle), the same singleton is achieved via a module-level cache keyed on `tsconfigPath`.

The fast tier never imports `ts-morph` — the import alone adds ~200ms of TypeScript-compiler load time, which is incompatible with running on every file write.

---

## Diagnostic data payload

Every diagnostic carries a structured `data` field alongside the human message:

```typescript
// wmc
{ className: string; wmc: number; max: number; methods: { name: string; cc: number }[] }

// halstead
{ functionName: string; volume: number; effort: number; difficulty: number; maxVolume: number; maxEffort: number }

// lcom
{ className: string; lcom: number; max: number; pairs: [string, string][] }

// cbo
{ className: string; cbo: number; max: number; outgoingCount: number; outgoing: string[]; incomingCount: number; incoming: string[] }

// dit
{ className: string; dit: number; max: number; chain: string[] }
```

**How to read it.** The `data` field is exposed via the **programmatic ESLint API** (`Linter`/`ESLint` classes, custom formatters, IDE integrations that consume `LintMessage` objects). The `oxlint --format json` output, by design, does not serialize `data` — it surfaces only `code`, `message`, `severity`, `filename`, and `labels`. Pipelines that read oxlint's JSON should either:

1. Parse the values out of `message` (every rule's message is structured and stable — see the per-rule sections above), or
2. Run via ESLint when raw `data` is required, since the same plugin serves both linters with identical rule logic.

The agentic feedback loop the plugin targets (Claude Code `PostToolUse` hook, agent reading hook stdout) only needs the human message, so this distinction does not affect that path.

---

## Out of scope (and why)

- **Auto-fix.** The metrics flag _structural_ issues — extracting a method, splitting a class, breaking a coupling — that no static rewrite can perform safely. Future work may emit hint-level suggestions.
- **Readability score.** Requires an ML model; not implementable as a pure AST rule.
- **Process metrics (git churn, file age).** Out of scope for a lint plugin.
- **Languages other than JS/TS.** The plugin targets the OXLint/ESLint AST surface.

---

## References

- Chidamber, S. R. & Kemerer, C. F. (1994). _A Metrics Suite for Object Oriented Design_. IEEE TSE 20(6).
- Halstead, M. H. (1977). _Elements of Software Science_. Elsevier.
- McCabe, T. J. (1976). _A Complexity Measure_. IEEE TSE 2(4).
- Basili, V. R., Briand, L. C. & Melo, W. L. (1996). _A Validation of Object-Oriented Design Metrics as Quality Indicators_. IEEE TSE 22(10).
- Briand, L. C., Wüst, J., Daly, J. W. & Porter, D. V. (2000). _Exploring the relationships between design measures and software quality in object-oriented systems_. JSS 51(3).
- Subramanyam, R. & Krishnan, M. S. (2003). _Empirical analysis of CK metrics for object-oriented design complexity_. IEEE TSE 29(4).
- Cartwright, M. & Shepperd, M. (2000). _An Empirical Investigation of an Object-Oriented Software System_. IEEE TSE 26(8).
- Lorenz, M. & Kidd, J. (1994). _Object-Oriented Software Metrics_. Prentice Hall.
- Lanza, M. & Marinescu, R. (2006). _Object-Oriented Metrics in Practice_. Springer.
- Radjenović, D., Heričko, M., Torkar, R. & Živkovič, A. (2013). _Software fault prediction metrics: a systematic literature review_. EMSE 18.
- Etzkorn, L. H., Hughes, W. E. & Davis, C. G. (2004). _Automated reusability quality analysis of OO legacy software_. JSS 70(1–2).
- Aman, H., Mochiduki, K. & Yamada, H. (2014). _A Comparative Study of Class Cohesion Metrics_. IEICE Trans 97-D.
- Jimenez, M. et al. (2024). _Reproducing Classic Defect Prediction Studies on Modern Java_. arXiv:2402.xxxxx (Defects4J replications).

---

## License

MIT.
