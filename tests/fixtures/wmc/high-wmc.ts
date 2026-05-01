// METRICS: WMC=17, methods=[validate(3), create(5), update(4), delete(2), list(3)]
// DO NOT MODIFY without updating tests/rules/wmc.test.ts expected values.
//
// Cyclomatic Complexity per method (count of decision points + 1):
//   validate(x):  1 base + 2 IfStatement                     = 3
//   create(type): 1 base + 4 SwitchCase                      = 5
//   update(...):  1 base + 3 IfStatement                     = 4
//   delete(id):   1 base + 1 IfStatement                     = 2
//   list(page):   1 base + 2 IfStatement                     = 3
//   ──────────────────────────────────────────────────────────
//   WMC = 3 + 5 + 4 + 2 + 3 = 17

export class OrderService {
  validate(x: number): boolean {
    if (x > 0) {
      if (x < 100) return true;
    }
    return false;
  }

  create(type: string): void {
    switch (type) {
      case 'a': break;
      case 'b': break;
      case 'c': break;
      case 'd': break;
    }
  }

  update(id: string, data: { locked?: boolean } | null): unknown {
    if (!id) return;
    if (!data) return;
    if (data.locked) return;
    return data;
  }

  delete(id: string): void {
    if (!id) throw new Error('id required');
  }

  list(page: number): number {
    if (page < 1) page = 1;
    if (page > 100) page = 100;
    return page;
  }
}
