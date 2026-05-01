import type { OrderController } from '../OrderController';

export class AdminPanel {
  constructor(private controller: OrderController) {}

  forceOrder(userId: string, sku: string): void {
    this.controller.process(userId, sku);
  }
}
