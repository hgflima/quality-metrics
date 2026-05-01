// METRICS: LCOM=0, P=0, Q=6
// Every method accesses `this.count`. All C(4,2)=6 method pairs share at
// least one property → Q=6, P=0, LCOM1 = max(0 - 6, 0) = 0.
// DO NOT MODIFY without updating tests/rules/lcom.test.ts expected values.

export class Counter {
  private count: number = 0;

  increment(): void {
    this.count++;
  }

  decrement(): void {
    this.count--;
  }

  reset(): void {
    this.count = 0;
  }

  getValue(): number {
    return this.count;
  }
}
