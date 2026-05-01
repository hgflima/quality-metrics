// METRICS (per COUNTING_MODEL.md):
//   η₁=3, N₁=3, η₂=3, N₂=5
//   η=6, N=8
//   V ≈ 20.68
//   D ≈ 2.50
//   E ≈ 51.71
// Below default thresholds (maxVolume=1000, maxEffort=400) → 0 diagnostics.
// DO NOT MODIFY without updating tests/rules/halstead.test.ts expected values.

export function add(a: number, b: number): number {
  return a + b;
}
