import type { OrderController } from '../OrderController';

export class MetricsCollector {
  constructor(private controller: OrderController) {}

  observe(userId: string, sku: string): void {
    this.controller.process(userId, sku);
  }
}
