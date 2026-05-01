import type { OrderController } from '../OrderController';

export class CheckoutFlow {
  constructor(private controller: OrderController) {}

  checkout(userId: string, sku: string): void {
    this.controller.process(userId, sku);
  }
}
