// METRICS: WMC=4, methods=[add(1), sub(1), mul(1), div(1)]
// DO NOT MODIFY without updating tests/rules/wmc.test.ts expected values.
//
// Each method has zero decision points, so CC = 1.
// WMC = 1 + 1 + 1 + 1 = 4

export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  sub(a: number, b: number): number {
    return a - b;
  }

  mul(a: number, b: number): number {
    return a * b;
  }

  div(a: number, b: number): number {
    return a / b;
  }
}
