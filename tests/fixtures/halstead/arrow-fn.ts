// METRICS (per COUNTING_MODEL.md):
//   η₁=4 ({const, =, =>, +}), N₁=4
//   η₂=3 ({add, a, b}), N₂=5
//   η=7, N=9
//   V ≈ 25.27
//   D ≈ 3.33
//   E ≈ 84.23
// Below default thresholds → 0 diagnostics. Arrow form must match identical
// computation logic to the function-declaration form (modulo operator set).
// DO NOT MODIFY without updating tests/rules/halstead.test.ts expected values.

export const add = (a: number, b: number): number => a + b;
