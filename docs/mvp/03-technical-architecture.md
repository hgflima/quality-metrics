# Technical Architecture

## Technology Stack

| Technology | Version | Purpose | Justification |
|-----------|---------|---------|---------------|
| TypeScript | ≥ 5.0 | Plugin implementation | Type safety, ts-morph compatibility |
| OXLint JS Plugin API | ≥ 1.0 | Rule execution (primary) | Target runtime; `createOnce` lifecycle |
| ESLint | ≥ 9.0 | Rule execution (secondary) | Compatibility fallback; same AST API |
| ts-morph | ≥ 23.0 | Cross-file type analysis (CBO, DIT) | TypeScript compiler API wrapper |
| Vitest | ≥ 2.0 | Unit + integration testing | Fast, TypeScript-native |
| tsup | ≥ 8.0 | Build / bundling | ESM + CJS dual output |

---

## System Architecture

### High-Level Architecture

```
Consumer project
  │
  ├── Claude Code PostToolUse hook
  │     └── oxlint --config oxlint.fast.json [file]
  │           └── quality-metrics plugin (fast tier)
  │                 ├── rule: quality-metrics/wmc
  │                 ├── rule: quality-metrics/halstead
  │                 └── rule: quality-metrics/lcom
  │
  └── git pre-commit (lint-staged)
        ├── oxlint --config oxlint.fast.json [staged files]
        │     └── quality-metrics plugin (fast tier)
        └── oxlint --config oxlint.deep.json [staged files]
              └── quality-metrics plugin (deep tier)
                    ├── createOnce → ts-morph Project (initialized once)
                    ├── rule: quality-metrics/cbo  (uses shared Project)
                    └── rule: quality-metrics/dit  (uses shared Project)
```

**Architecture Pattern:** Plugin (stateless per-file for fast tier; shared-state via `createOnce` for deep tier)

### Key Design Decisions

1. **`createOnce` for ts-morph**: The TypeScript project must be loaded once per lint run, not once per file. OXLint's `createOnce` hook provides this. In ESLint, a module-level singleton achieves the same result.
2. **Separate config files**: Fast and deep tiers are intentionally split into two config files. This allows Claude Code hooks to run only the fast tier (no ts-morph cost) while pre-commit runs both.
3. **Bidirectional CBO**: CBO counts both outgoing (what the class uses) and incoming (what uses the class) references. This requires a full project scan — only feasible in the deep tier.

---

## Plugin Structure

```
quality-metrics/
├── src/
│   ├── index.ts                  # Plugin entry point — exports plugin object
│   ├── types.ts                  # Shared TypeScript interfaces
│   ├── utils/
│   │   ├── cc.ts                 # Cyclomatic complexity helper (used by WMC)
│   │   ├── halstead.ts           # Halstead operator/operand counting
│   │   └── this-access.ts        # this.property extraction helper (used by LCOM)
│   ├── rules/
│   │   ├── wmc.ts                # Fast tier — WMC rule
│   │   ├── halstead.ts           # Fast tier — Halstead rule
│   │   ├── lcom.ts               # Fast tier — LCOM rule
│   │   ├── cbo.ts                # Deep tier — CBO rule (ts-morph)
│   │   └── dit.ts                # Deep tier — DIT rule (ts-morph)
│   └── project-singleton.ts      # ts-morph Project singleton (createOnce + ESLint fallback)
├── configs/
│   ├── oxlint.fast.json          # Config preset: WMC + Halstead + LCOM only
│   └── oxlint.deep.json          # Config preset: CBO + DIT only (ts-morph)
├── fixtures/
│   ├── claude-md-hook.md         # CLAUDE.md snippet for Claude Code PostToolUse
│   └── lintstagedrc.example.js   # lint-staged config example
├── tests/
│   ├── rules/
│   │   ├── wmc.test.ts
│   │   ├── halstead.test.ts
│   │   ├── lcom.test.ts
│   │   ├── cbo.test.ts
│   │   └── dit.test.ts
│   ├── integration/
│   │   ├── oxlint-compat.test.ts
│   │   └── eslint-compat.test.ts
│   └── benchmarks/
│       └── perf.bench.ts         # Vitest bench — fast < 1s, deep < 10s
├── package.json
├── tsconfig.json
└── README.md
```

---

## TypeScript Interfaces (Contracts — Batch 0)

```typescript
// src/types.ts

export interface RuleContext {
  report(descriptor: ReportDescriptor): void;
  getFilename(): string;
  options: unknown[];
}

export interface WmcOptions {
  max: number; // default: 20
}

export interface HalsteadOptions {
  maxVolume: number;  // default: 1000
  maxEffort: number;  // default: 400
}

export interface LcomOptions {
  maxLcom: number; // default: 0 (any lack of cohesion flagged)
}

export interface CboOptions {
  max: number;        // default: 10
  tsconfigPath?: string;
}

export interface DitOptions {
  max: number;        // default: 5
  tsconfigPath?: string;
}

export interface HalsteadMetrics {
  eta1: number;  // distinct operators
  eta2: number;  // distinct operands
  N1: number;    // total operators
  N2: number;    // total operands
  vocabulary: number;  // eta = eta1 + eta2
  length: number;      // N = N1 + N2
  volume: number;      // V = N * log2(eta)
  difficulty: number;  // D = (eta1/2) * (N2/eta2)
  effort: number;      // E = D * V
}

export interface ClassMethodAttributes {
  methodName: string;
  accessedProperties: Set<string>; // this.X identifiers
}

export interface ProjectSingleton {
  project: import('ts-morph').Project;
  isAvailable: boolean;
  error?: string;
}
```

---

## Rule Specifications

### Rule: `quality-metrics/wmc`

**Tier:** Fast
**Default threshold:** `max: 20`
**Research basis:** Chidamber & Kemerer (1994); WMC > 20 indicates refactoring candidate; > 50 critical

```json
// .oxlintrc.json usage
{
  "rules": {
    "quality-metrics/wmc": ["error", { "max": 20 }]
  }
}
```

**Diagnostic format:**
```
quality-metrics/wmc: Class 'UserService' has WMC of 34 (max: 20).
  Methods contributing: validate(CC=8), createUser(CC=12), updateUser(CC=9), getUser(CC=5)
```

---

### Rule: `quality-metrics/halstead`

**Tier:** Fast
**Default thresholds:** `maxVolume: 1000`, `maxEffort: 400`
**Research basis:** Halstead (1977); Effort among top-4 individual bug predictors (Defects4J 2024)

```json
{
  "rules": {
    "quality-metrics/halstead": ["error", { "maxVolume": 1000, "maxEffort": 400 }]
  }
}
```

**Diagnostic format:**
```
quality-metrics/halstead: Function 'processOrder' exceeds Halstead thresholds.
  Volume: 1240 (max: 1000) | Effort: 520 (max: 400) | Difficulty: 18.4
```

---

### Rule: `quality-metrics/lcom`

**Tier:** Fast
**Default threshold:** `maxLcom: 0` (any cohesion gap flagged)
**Research basis:** Chidamber & Kemerer (1994); LCOM > 0 indicates SRP violation risk

```json
{
  "rules": {
    "quality-metrics/lcom": ["warn", { "maxLcom": 2 }]
  }
}
```

**Diagnostic format:**
```
quality-metrics/lcom: Class 'ReportService' has LCOM of 3 (max: 0).
  Unrelated method pairs: (generatePDF, sendEmail), (generatePDF, scheduleJob), (sendEmail, scheduleJob)
```

---

### Rule: `quality-metrics/cbo`

**Tier:** Deep (ts-morph required)
**Default threshold:** `max: 10`
**Research basis:** Chidamber & Kemerer; strongest predictor in OO systems; > 14 high risk

```json
{
  "rules": {
    "quality-metrics/cbo": ["error", { "max": 10, "tsconfigPath": "./tsconfig.json" }]
  }
}
```

**Diagnostic format:**
```
quality-metrics/cbo: Class 'OrderController' has CBO of 14 (max: 10).
  Outgoing (8): OrderService, PaymentService, EmailService, UserRepository, ...
  Incoming (6): OrderRouter, OrderTest, CheckoutFlow, ...
```

---

### Rule: `quality-metrics/dit`

**Tier:** Deep (ts-morph required)
**Default threshold:** `max: 5`
**Research basis:** Chidamber & Kemerer; DIT > 5 moderate-to-high risk

```json
{
  "rules": {
    "quality-metrics/dit": ["warn", { "max": 5 }]
  }
}
```

**Diagnostic format:**
```
quality-metrics/dit: Class 'GoldenRetriever' has DIT of 6 (max: 5).
  Chain: GoldenRetriever → Retriever → Dog → Mammal → Animal → LivingThing
```

---

## Config Presets

### `oxlint.fast.json`

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "jsPlugins": ["quality-metrics"],
  "rules": {
    "quality-metrics/wmc":      ["error", { "max": 20 }],
    "quality-metrics/halstead": ["warn",  { "maxVolume": 1000, "maxEffort": 400 }],
    "quality-metrics/lcom":     ["warn",  { "maxLcom": 2 }]
  }
}
```

### `oxlint.deep.json`

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "jsPlugins": ["quality-metrics"],
  "rules": {
    "quality-metrics/cbo": ["error", { "max": 10 }],
    "quality-metrics/dit": ["warn",  { "max": 5  }]
  }
}
```

---

## Claude Code Hook Snippet (`CLAUDE.md`)

```markdown
## Hooks

### PostToolUse: Lint on file write

After writing any TypeScript file, run the fast quality metrics tier:

\`\`\`bash
# Triggered by: Write, Edit, MultiEdit tools on *.ts / *.tsx files
oxlint --config oxlint.fast.json "$FILE"
\`\`\`

If violations are found, fix them before writing the next file.
```

---

## lint-staged Configuration (`.lintstagedrc.js`)

```javascript
export default {
  '*.{ts,tsx}': [
    'oxlint --config oxlint.fast.json',
    'oxlint --config oxlint.deep.json',
  ],
}
```

---

## Deployment Architecture

### Package Distribution

| Environment | Purpose |
|---|---|
| npm registry | Primary distribution as `quality-metrics` package |
| GitHub releases | Source + changelog |

### CI/CD Pipeline

1. **Build**: `tsup` → ESM + CJS dual output in `dist/`
2. **Test**: `vitest run` (unit + integration) + `vitest bench` (performance)
3. **Compatibility check**: Run integration tests against OXLint v1+ and ESLint v9+
4. **Publish**: `npm publish` on tag push (manual gate)

### Versioning

Semantic versioning. Breaking changes in rule behavior (threshold changes, diagnostic format changes) are minor bumps. New rules are minor. Bug fixes are patch.
