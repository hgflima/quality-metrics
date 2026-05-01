// METRICS: LCOM=0 (no method pairs to evaluate)
// Single-method classes have C(1,2)=0 pairs → P=Q=0 → LCOM=0.
// Covers E2E-006 (single-method edge case).
// DO NOT MODIFY without updating tests/rules/lcom.test.ts expected values.

export class Greeter {
  private name: string = 'world';

  greet(): string {
    return `Hello, ${this.name}!`;
  }
}
