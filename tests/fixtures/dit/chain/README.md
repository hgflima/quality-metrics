# DIT fixture — `chain`

Five-level inheritance chain measured in cross-file references:

```
LivingThing (depth 0, DIT=0)
   ↑
Animal      (depth 1, DIT=1)
   ↑
Mammal      (depth 2, DIT=2)
   ↑
Dog         (depth 3, DIT=3)
   ↑
Labrador    (depth 4, DIT=4)
```

`Labrador` is the target case for E2E-010. With `max: 3` the rule fires
exactly once on `Labrador` reporting `dit === 4` and the chain
`Labrador → Dog → Mammal → Animal → LivingThing`.

DIT counts only `extends` edges — `implements` is excluded. The chain
contains no `implements` clauses to keep the assertion unambiguous.

DO NOT MODIFY without updating `tests/rules/dit.test.ts`.
