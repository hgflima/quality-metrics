# E2E Test Specifications

## Story-to-Test Traceability Matrix

| Story | E2E Test IDs | Description |
|-------|-------------|-------------|
| US-001 (WMC) | E2E-001, E2E-002 | WMC violation detection + threshold configuration |
| US-002 (Halstead) | E2E-003, E2E-004 | Halstead Volume + Effort violation detection |
| US-003 (LCOM) | E2E-005, E2E-006 | LCOM violation detection + single-method edge case |
| US-004 (CBO) | E2E-007, E2E-008, E2E-009 | CBO bidirectional, error handling |
| US-005 (DIT) | E2E-010, E2E-011 | DIT cross-file chain + cycle handling |
| US-006 (configs) | E2E-012 | Dual config preset correctness |
| US-007 (Claude Code) | E2E-013 | PostToolUse hook integration |
| US-008 (lint-staged) | E2E-014 | Pre-commit gate integration |
| US-009 (ESLint compat) | E2E-015, E2E-016 | ESLint v9 flat config |

---

## Test Specifications

### E2E-001: WMC violation detected above threshold

**Story:** US-001
**Type:** Rule unit test

**Fixture (`fixtures/wmc/high-wmc.ts`):**
```typescript
class OrderService {
  validate(x: number) {        // CC = 3
    if (x > 0) {
      if (x < 100) return true;
    }
    return false;
  }
  create(type: string) {       // CC = 5
    switch(type) {
      case 'a': break;
      case 'b': break;
      case 'c': break;
      case 'd': break;
    }
  }
  update(id: string, data: any) { // CC = 4
    if (!id) return;
    if (!data) return;
    if (data.locked) return;
    return data;
  }
  delete(id: string) {         // CC = 2
    if (!id) throw new Error();
  }
  list(page: number) {         // CC = 3
    if (page < 1) page = 1;
    if (page > 100) page = 100;
    return page;
  }
}
// WMC = 3+5+4+2+3 = 17
```

**Given:** `max: 15`
**When:** OXLint runs `quality-metrics/wmc` against `high-wmc.ts`
**Then:**
- Exactly 1 diagnostic reported
- `diagnostic.message` contains `WMC of 17` and `max: 15`
- `diagnostic.node` points to `ClassDeclaration` for `OrderService`
- `diagnostic.data.wmc === 17`

---

### E2E-002: WMC no violation below threshold

**Fixture:** Same `high-wmc.ts` above
**Given:** `max: 20`
**When:** OXLint runs
**Then:** 0 diagnostics reported

---

### E2E-003: Halstead Effort violation

**Fixture (`fixtures/halstead/complex-fn.ts`):**
```typescript
function processPayment(
  amount: number, currency: string, method: string,
  userId: string, orderId: string
) {
  if (amount <= 0) throw new Error('Invalid amount');
  if (!currency || currency.length !== 3) throw new Error('Invalid currency');
  const rate = currency === 'USD' ? 1.0 : currency === 'EUR' ? 1.1 : 0.9;
  const converted = amount * rate;
  const fee = method === 'card' ? converted * 0.029 + 0.30 : 0;
  const total = converted + fee;
  if (total > 10000 && method !== 'wire') throw new Error('Limit exceeded');
  return { userId, orderId, total, currency, method, timestamp: Date.now() };
}
```

**Given:** `maxEffort: 400`
**When:** OXLint runs
**Then:**
- 1 diagnostic reported with `effort > 400`
- Diagnostic includes computed E, V, D values

---

### E2E-004: Halstead no violation for simple function

**Fixture (`fixtures/halstead/simple-fn.ts`):**
```typescript
function add(a: number, b: number): number {
  return a + b;
}
```

**Given:** Default thresholds
**When:** OXLint runs
**Then:** 0 diagnostics

---

### E2E-005: LCOM violation — three unrelated method groups

**Fixture (`fixtures/lcom/low-cohesion.ts`):**
```typescript
class MixedService {
  private db: Database;
  private mailer: Mailer;
  private cache: Cache;

  saveUser(user: User) {
    this.db.save(user); // accesses: db
  }
  sendWelcome(email: string) {
    this.mailer.send(email); // accesses: mailer
  }
  invalidateSession(id: string) {
    this.cache.delete(id); // accesses: cache
  }
}
// P=3 (all pairs share no attributes), Q=0 → LCOM1 = 3
```

**Given:** `maxLcom: 0`
**When:** OXLint runs
**Then:**
- 1 diagnostic with `lcom === 3`
- Diagnostic lists unrelated pairs: `(saveUser, sendWelcome)`, `(saveUser, invalidateSession)`, `(sendWelcome, invalidateSession)`

---

### E2E-006: LCOM = 0 for single-method class

**Fixture:** Class with exactly one method
**Given:** Any threshold
**When:** OXLint runs
**Then:** 0 diagnostics (no pairs to evaluate)

---

### E2E-007: CBO violation — bidirectional count exceeds threshold

**Fixture:**
- `fixtures/cbo/high-cbo/OrderController.ts` — references 7 external classes
- `fixtures/cbo/high-cbo/other-files/` — 5 files that reference `OrderController`

**Given:** `max: 10`, ts-morph initialized with fixture tsconfig
**When:** OXLint deep tier runs
**Then:**
- 1 diagnostic on `OrderController` with `cbo === 12` (7 outgoing + 5 incoming)
- Diagnostic lists outgoing and incoming types separately

---

### E2E-008: CBO — inheritance excluded from count

**Fixture:** Class that extends one class and implements two interfaces; no other dependencies
**Given:** `max: 5`
**When:** OXLint deep tier runs
**Then:** `cbo === 0` (inheritance/implementation not counted per C&K definition), 0 diagnostics

---

### E2E-009: CBO — ts-morph initialization failure handled gracefully

**Given:** `tsconfigPath` points to a non-existent file
**When:** OXLint deep tier runs
**Then:**
- 1 meta-diagnostic (warning severity) explaining ts-morph could not initialize
- 0 rule diagnostics (CBO/DIT skipped gracefully)
- OXLint process exits 0 (warning, not error)

---

### E2E-010: DIT cross-file chain

**Fixture:**
- `fixtures/dit/chain/LivingThing.ts` — base class
- `fixtures/dit/chain/Animal.ts` — extends LivingThing
- `fixtures/dit/chain/Mammal.ts` — extends Animal
- `fixtures/dit/chain/Dog.ts` — extends Mammal
- `fixtures/dit/chain/Labrador.ts` — extends Dog

**Given:** `max: 3`
**When:** OXLint deep tier runs against `Labrador.ts`
**Then:**
- 1 diagnostic with `dit === 4`
- Diagnostic includes full chain: `Labrador → Dog → Mammal → Animal → LivingThing`

---

### E2E-011: DIT circular inheritance — graceful handling

**Fixture:** Two classes that `extend` each other (TypeScript error scenario)
**When:** OXLint deep tier runs
**Then:**
- 1 meta-diagnostic (warning) indicating cycle detected
- No infinite loop; process completes within 5s

---

### E2E-012: Dual config preset correctness

**Test:** Integration test — run both configs against a file that violates all 5 rules

**Given:** `oxlint.fast.json` runs against the file
**Then:** Only WMC, Halstead, LCOM diagnostics reported (0 CBO, 0 DIT)

**Given:** `oxlint.deep.json` runs against the same file
**Then:** Only CBO, DIT diagnostics reported (0 WMC, 0 Halstead, 0 LCOM)

---

### E2E-013: Claude Code PostToolUse hook

**Test:** Shell integration test (runs in CI)

**Given:** The `CLAUDE.md` hook snippet is active and a TypeScript file with a WMC violation is written
**When:** The hook fires (`oxlint --config oxlint.fast.json $FILE`)
**Then:**
- Process exits 1
- Stdout contains WMC diagnostic with class name and computed value
- Execution time < 500ms

---

### E2E-014: lint-staged pre-commit integration

**Test:** Shell integration test using `git` in a temp repo

**Given:** A staged TypeScript file with a CBO violation, `.lintstagedrc.js` configured with both configs
**When:** `git commit` is attempted
**Then:**
- Commit is blocked (exit code 1)
- CBO diagnostic visible in terminal output
- No files are committed to the repo

---

### E2E-015: ESLint v9 flat config compatibility

**Given:** An ESLint v9 flat config importing the plugin
**When:** `eslint .` runs against a TypeScript file with WMC and LCOM violations
**Then:**
- Both WMC and LCOM diagnostics fire correctly
- No plugin load errors or crashes
- Output format matches ESLint standard diagnostic format

---

### E2E-016: No double-firing with eslint-plugin-oxlint

**Given:** Both ESLint + `eslint-plugin-oxlint` and OXLint running on the same file
**When:** Both linters run
**Then:**
- Each rule fires exactly once (not duplicated across both linters)
- `eslint-plugin-oxlint` disables ESLint rules that OXLint covers natively (not the quality-metrics rules, which are plugin-only)

---

## Test Data Fixtures

### Fixture Project Structure

```
tests/
└── fixtures/
    ├── wmc/
    │   ├── high-wmc.ts          # WMC = 17 (verified by hand computation)
    │   ├── low-wmc.ts           # WMC = 4
    │   └── zero-methods.ts      # WMC = 0
    ├── halstead/
    │   ├── complex-fn.ts        # E > 400 (hand-computed)
    │   ├── simple-fn.ts         # E < 100
    │   └── arrow-fn.ts          # Arrow function — same computation
    ├── lcom/
    │   ├── low-cohesion.ts      # LCOM = 3
    │   ├── high-cohesion.ts     # LCOM = 0
    │   └── single-method.ts    # LCOM = 0 (no pairs)
    ├── cbo/
    │   ├── high-cbo/            # Multi-file fixture for bidirectional CBO
    │   │   ├── tsconfig.json
    │   │   ├── OrderController.ts
    │   │   └── other-files/
    │   └── low-cbo/
    │       ├── tsconfig.json
    │       └── SimpleClass.ts
    └── dit/
        ├── chain/               # 5-level inheritance chain
        │   ├── tsconfig.json
        │   └── *.ts
        └── shallow/
            └── *.ts
```

### Reference Values (Hand-Computed, Locked)

All fixture files have their expected metric values documented in comments and locked in unit test assertions. Any change to a fixture file must update the expected values in the corresponding test.

```typescript
// tests/fixtures/wmc/high-wmc.ts
// METRICS: WMC=17, methods=[validate(3), create(5), update(4), delete(2), list(3)]
// DO NOT MODIFY without updating tests/rules/wmc.test.ts expected values
```
