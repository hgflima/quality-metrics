# User Stories

## End-User Personas

### Primary Persona: AI-Augmented TypeScript Developer

**Profile:**
- Role: Senior developer or tech lead using Claude Code or similar agent for > 50% of daily coding
- Technical Proficiency: High
- Context: Working on a medium-to-large TypeScript codebase; concerned about structural quality degradation from high-volume agent output

**Goals:**
- Catch structural quality issues (high coupling, low cohesion, oversized classes) as early as possible in the agent's coding loop
- Avoid expensive refactoring cycles caused by accumulated quality debt across many agent-generated files

**Pain Points:**
- Current linters only catch CC and LOC — missing the OO metrics with the strongest empirical bug-correlation
- Pre-commit hooks run too late: agent has already written 30 files with the same problem before receiving any feedback

### Secondary Persona: ESLint/OXLint Plugin Consumer

**Profile:**
- Role: Any TypeScript developer who wants OO quality metrics in their existing lint setup
- Technical Proficiency: Medium–High
- Context: Not necessarily using AI agents; wants better structural quality gates in CI

---

## User Stories

### Epic 1: Fast-Tier Rules (Single-File, Claude Code Hook)

#### Story US-001: WMC rule enforcement

**As a** developer using Claude Code
**I want** OXLint to flag classes whose total cyclomatic complexity exceeds a threshold
**So that** the agent receives immediate feedback after writing an oversized class and can refactor before writing more files

**Priority:** P0

**Acceptance Criteria:**
- [ ] Given a TypeScript class where the sum of CC across all methods exceeds `max` (default: 20), when OXLint runs, then a diagnostic is reported at the class declaration node with the computed WMC value and the threshold
- [ ] Given a class with WMC ≤ `max`, when OXLint runs, then no diagnostic is reported
- [ ] Given a `max` option set to a custom value in `.oxlintrc.json`, when OXLint runs, then the custom threshold is used
- [ ] Given a class with zero methods, when OXLint runs, then WMC = 0 and no diagnostic is reported

**Complexity:** M
**E2E Test Refs:** E2E-001, E2E-002

**Technical Notes:**
- Visit `ClassDeclaration` and `ClassExpression`; accumulate CC for each `MethodDefinition` child
- CC per method = count of `IfStatement`, `ForStatement`, `WhileStatement`, `DoWhileStatement`, `SwitchCase`, `CatchClause`, `LogicalExpression` (&&, ||, ??) nodes + 1
- Report on `ClassDeclaration:exit` after accumulation

---

#### Story US-002: Halstead Volume and Effort enforcement

**As a** developer using Claude Code
**I want** OXLint to flag functions whose Halstead Effort exceeds a threshold
**So that** functions that are cognitively expensive to maintain are identified immediately after being written

**Priority:** P0

**Acceptance Criteria:**
- [ ] Given a function where Halstead Effort `E = D × V` exceeds `maxEffort` (default: 400), when OXLint runs, then a diagnostic is reported at the function node with computed E, V, and D values
- [ ] Given a function where Halstead Volume `V = N × log₂(η)` exceeds `maxVolume` (default: 1000), when OXLint runs, then a diagnostic is reported even if Effort is within threshold
- [ ] Given a function within both thresholds, when OXLint runs, then no diagnostic is reported
- [ ] Given an arrow function assigned to a variable, when OXLint runs, then it is treated the same as a named function

**Complexity:** L
**E2E Test Refs:** E2E-003, E2E-004

**Technical Notes:**
- Operators: `BinaryExpression`, `LogicalExpression`, `AssignmentExpression`, `UnaryExpression`, `UpdateExpression`, `MemberExpression`, `CallExpression`, `ConditionalExpression`, keywords (`if`, `for`, `while`, `return`, `new`, `typeof`, `instanceof`)
- Operands: `Identifier`, `Literal`, `TemplateLiteral`
- Count distinct (η1, η2) and total (N1, N2) occurrences within the function scope only — do not include nested function bodies

---

#### Story US-003: LCOM enforcement

**As a** developer using Claude Code
**I want** OXLint to flag classes with low method cohesion
**So that** classes violating Single Responsibility Principle are caught immediately

**Priority:** P0

**Acceptance Criteria:**
- [ ] Given a class where LCOM1 = max(P − Q, 0) > 0 (default threshold), when OXLint runs, then a diagnostic is reported with computed LCOM value and list of method pairs that do not share attributes
- [ ] Given a class where all method pairs share at least one `this.property` access, when OXLint runs, then LCOM = 0 and no diagnostic is reported
- [ ] Given a `maxLcom` option set to a custom integer, when OXLint runs, then the custom threshold is respected
- [ ] Given a class with only one method, when OXLint runs, then LCOM = 0 (no pairs to evaluate) and no diagnostic is reported

**Complexity:** L
**E2E Test Refs:** E2E-005, E2E-006

**Technical Notes:**
- For each method, collect all `this.X` MemberExpression identifiers accessed within the method body (non-recursive — do not descend into nested functions)
- Build pair matrix: for each (mi, mj) pair, P++ if no shared attributes, Q++ if ≥ 1 shared attribute
- LCOM1 = max(P − Q, 0)

---

### Epic 2: Deep-Tier Rules (Cross-File, ts-morph, Pre-Commit)

#### Story US-004: CBO rule enforcement (full bidirectional)

**As a** developer running pre-commit
**I want** OXLint to flag classes whose coupling count exceeds a threshold
**So that** highly coupled classes are blocked from entering the repository

**Priority:** P0

**Acceptance Criteria:**
- [ ] Given a TypeScript class that references N distinct external classes in field declarations, method parameters, return types, and local variable types, when OXLint + ts-morph runs at pre-commit, then if N > `max` (default: 10), a diagnostic is reported with the computed CBO value and the list of coupled types
- [ ] Given a class that is referenced by M other classes in the project, when combined with its own N outgoing references and N + M > `max`, then a diagnostic is reported (bidirectional count)
- [ ] Given a class that only references primitive types and built-in globals, when OXLint runs, then CBO = 0 and no diagnostic is reported
- [ ] Given ts-morph fails to initialize (missing tsconfig, memory error), when OXLint runs, then the rule emits a warning-level meta-diagnostic and skips CBO checks rather than crashing the lint run

**Complexity:** XL
**E2E Test Refs:** E2E-007, E2E-008, E2E-009

**Technical Notes:**
- Uses `ts-morph` via `createOnce` — instantiated once per lint run, shared across all files
- Outgoing: collect all type references in class body via ts-morph `getType().getSymbol()` — filter to project-local symbols only (exclude node_modules)
- Incoming: use ts-morph `ReferenceFinder` or `findReferencesAsNodes` on the class symbol — count distinct referencing classes
- Inheritance (`extends`) excluded from CBO count per Chidamber & Kemerer definition

---

#### Story US-005: DIT rule enforcement (full inheritance chain)

**As a** developer running pre-commit
**I want** OXLint to flag classes with deep inheritance hierarchies
**So that** inheritance chains that increase complexity and test difficulty are blocked from entering the repository

**Priority:** P1

**Acceptance Criteria:**
- [ ] Given a TypeScript class with DIT > `max` (default: 5, per Chidamber & Kemerer), when OXLint + ts-morph runs, then a diagnostic is reported with the computed DIT value and the full inheritance chain as context
- [ ] Given a class with DIT ≤ `max`, when OXLint runs, then no diagnostic is reported
- [ ] Given an inheritance chain that crosses file boundaries (class B extends A from another file), when OXLint + ts-morph runs, then the full cross-file chain is resolved correctly
- [ ] Given a circular inheritance (TypeScript error), when OXLint runs, then the rule handles the cycle gracefully without infinite loop and reports a meta-diagnostic

**Complexity:** L
**E2E Test Refs:** E2E-010, E2E-011

**Technical Notes:**
- Uses `ts-morph` via `createOnce` (shared with CBO rule)
- Traverse `getBaseClass()` recursively until null; count steps
- DIT does not include interface implementations — only class `extends` chain

---

### Epic 3: Configuration & Integration

#### Story US-006: Dual config presets

**As a** developer setting up the plugin
**I want** ready-to-use `oxlint.fast.json` and `oxlint.deep.json` config files
**So that** I can integrate the two tiers into Claude Code and lint-staged with minimal manual configuration

**Priority:** P0

**Acceptance Criteria:**
- [ ] Given the package is installed, when the user copies `oxlint.fast.json` from the package, then running `oxlint --config oxlint.fast.json` activates only WMC, Halstead, and LCOM rules
- [ ] Given the package is installed, when the user copies `oxlint.deep.json` from the package, then running `oxlint --config oxlint.deep.json` activates only CBO and DIT rules
- [ ] Given both configs, when `oxlint.fast.json` is run, then it completes in < 1s on the 500-file benchmark fixture
- [ ] Given both configs, when `oxlint.deep.json` is run, then it completes in < 10s on the 500-file benchmark fixture

**Complexity:** S
**E2E Test Refs:** E2E-012

---

#### Story US-007: Claude Code hook integration

**As a** Claude Code user
**I want** a ready-to-use `CLAUDE.md` hook snippet that runs the fast tier on every file write
**So that** the agent receives quality feedback immediately without manual setup

**Priority:** P0

**Acceptance Criteria:**
- [ ] Given the snippet is added to `CLAUDE.md`, when Claude Code writes a `.ts` or `.tsx` file via `PostToolUse`, then `oxlint --config oxlint.fast.json` is run against the written file
- [ ] Given a lint violation in the written file, when the hook fires, then the diagnostic is visible in Claude Code's output and the agent can read it before writing the next file
- [ ] Given a file with no violations, when the hook fires, then the hook exits 0 and does not block the agent

**Complexity:** S
**E2E Test Refs:** E2E-013

---

#### Story US-008: lint-staged integration

**As a** developer using git pre-commit hooks
**I want** a ready-to-use `lint-staged` configuration that runs the deep tier at commit time
**So that** CBO and DIT violations are blocked before code enters the repository

**Priority:** P0

**Acceptance Criteria:**
- [ ] Given the provided `.lintstagedrc.js` example, when `git commit` is run, then both `oxlint.fast.json` and `oxlint.deep.json` are executed against staged `.ts` / `.tsx` files
- [ ] Given a CBO violation in a staged file, when the commit runs, then the commit is blocked and the diagnostic is displayed
- [ ] Given all staged files pass both configs, when the commit runs, then the commit proceeds normally

**Complexity:** S
**E2E Test Refs:** E2E-014

---

### Epic 4: ESLint Compatibility

#### Story US-009: ESLint v9 flat config compatibility

**As a** developer not using OXLint
**I want** to use this plugin in a standard ESLint v9 flat config setup
**So that** I can get the same quality metrics without migrating to OXLint

**Priority:** P1

**Acceptance Criteria:**
- [ ] Given an ESLint v9 flat config that imports the plugin, when `eslint .` is run, then all 5 rules fire correctly on TypeScript files
- [ ] Given the `createOnce` lifecycle (OXLint-specific), when running in ESLint, then CBO and DIT rules fall back to module-level singleton initialization without errors
- [ ] Given ESLint and OXLint running side-by-side via `eslint-plugin-oxlint`, when both are configured, then no rule double-fires

**Complexity:** M
**E2E Test Refs:** E2E-015, E2E-016

---

## User Flows

### Flow 1: Agent writes a file → fast feedback loop

| Step | Agent Action | System Response | Verification |
|------|-------------|----------------|-------------|
| 1 | Agent writes `UserService.ts` via Claude Code | `PostToolUse` hook fires | Hook exit code captured |
| 2 | Hook runs `oxlint --config oxlint.fast.json UserService.ts` | OXLint executes WMC, Halstead, LCOM rules | < 1s elapsed |
| 3 | WMC violation found (WMC = 32, max = 20) | Diagnostic printed to stdout | Diagnostic contains class name, computed value, threshold |
| 4 | Agent reads diagnostic in tool output | Agent can refactor `UserService.ts` before writing next file | No new files written with same violation |

### Flow 2: Developer commits → deep tier gate

| Step | Action | System Response | Verification |
|------|--------|----------------|-------------|
| 1 | Developer runs `git commit` | lint-staged fires on staged `.ts` files | Both configs run |
| 2 | `oxlint.fast.json` runs (fast tier) | WMC, Halstead, LCOM checked | < 1s per file |
| 3 | `oxlint.deep.json` runs (deep tier) | ts-morph initializes once, CBO + DIT checked across all staged files | < 10s total |
| 4 | CBO violation found | Commit blocked, diagnostic shown | Exit code 1 returned to git |
| 5 | Developer fixes violation | Re-runs `git commit` | All checks pass, commit proceeds |

## Edge Cases & Error Scenarios

### Scenario 1: ts-morph fails to find tsconfig.json

**Context:** Consumer project has non-standard tsconfig location or no tsconfig
**Expected Behavior:** Deep tier rules emit a single warning-level meta-diagnostic explaining the issue, then skip CBO/DIT checks for all files in this run. Fast tier runs normally.
**Error Message:** `[quality-metrics] ts-morph could not locate tsconfig.json. CBO and DIT rules are disabled for this run. Set "tsconfigPath" in oxlint.deep.json to fix this.`
**Recovery:** User sets explicit `tsconfigPath` option in `oxlint.deep.json`

### Scenario 2: Circular inheritance chain

**Context:** TypeScript class hierarchy has a circular `extends` (which TypeScript itself would flag as an error)
**Expected Behavior:** DIT rule detects the cycle after N iterations (max depth = 50), reports a meta-diagnostic, and skips DIT reporting for that class
**Error Message:** `[quality-metrics/dit] Circular inheritance detected in class chain starting at ClassName. DIT check skipped.`

### Scenario 3: ts-morph project runs out of memory on very large codebase

**Context:** Project has > 2000 TypeScript files
**Expected Behavior:** ts-morph initialization may fail with OOM. Rule catches the error, emits a warning, and disables deep tier for this run. Does not crash OXLint process.
**Recovery:** User can add `"include"` patterns to `oxlint.deep.json` to scope ts-morph to relevant directories only.
