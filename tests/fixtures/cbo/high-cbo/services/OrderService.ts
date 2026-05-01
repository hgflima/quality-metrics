export class OrderService {
  create(user: unknown, sku: string): { id: string; sku: string } {
    return { id: 'order-1', sku };
  }
}
