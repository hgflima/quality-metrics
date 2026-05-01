// METRICS (per COUNTING_MODEL.md):
//   η₁=19, N₁=43
//   η₂=30, N₂=52
//   η=49, N=95
//   V ≈ 533.40
//   D ≈ 16.47
//   E ≈ 8783.5
// Above default Effort threshold (maxEffort=400) → 1 diagnostic on
// `processPayment`. Volume (≈533) is below 1000, so the Volume threshold
// alone would not trigger the rule; combined with the Effort breach the
// diagnostic must report E and D as the contributing factors.
//
// Operator distinct set (η₁=19):
//   function, if, throw, new, <=, !, ||, ., !==, ===, ?, :, =, const,
//   *, +, >, &&, return
// Operand distinct set (η₂=30): 15 identifiers + 15 literal values.
//   identifiers: processPayment, amount, currency, method, userId, orderId,
//                Error, length, rate, converted, fee, total, timestamp,
//                Date, now
//   literals:    0, 'Invalid amount', 3, 'Invalid currency', 'USD', 1.0,
//                'EUR', 1.1, 0.9, 'card', 0.029, 0.30, 10000, 'wire',
//                'Limit exceeded'
//
// DO NOT MODIFY without updating tests/rules/halstead.test.ts expected values.

export function processPayment(
  amount: number,
  currency: string,
  method: string,
  userId: string,
  orderId: string,
): Record<string, unknown> {
  if (amount <= 0) throw new Error('Invalid amount');
  if (!currency || currency.length !== 3) throw new Error('Invalid currency');
  const rate = currency === 'USD' ? 1.0 : currency === 'EUR' ? 1.1 : 0.9;
  const converted = amount * rate;
  const fee = method === 'card' ? converted * 0.029 + 0.30 : 0;
  const total = converted + fee;
  if (total > 10000 && method !== 'wire') throw new Error('Limit exceeded');
  return { userId, orderId, total, currency, method, timestamp: Date.now() };
}
