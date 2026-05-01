import type { OrderController } from '../OrderController';

export class OrderRouter {
  constructor(private controller: OrderController) {}

  handle(userId: string, sku: string): void {
    this.controller.process(userId, sku);
  }
}
