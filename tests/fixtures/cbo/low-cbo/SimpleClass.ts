// METRICS: CBO=0 (no outgoing, no incoming dependencies)
// Self-contained class operating only on built-in types and primitives.
// DO NOT MODIFY without updating tests/rules/cbo.test.ts expected values.

export class SimpleClass {
  private message: string;

  constructor(message: string) {
    this.message = message;
  }

  greet(): string {
    return this.message;
  }
}
