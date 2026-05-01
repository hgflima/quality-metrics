import type { OrderController } from '../OrderController';

export class OrderEndToEndTest {
  constructor(private controller: OrderController) {}

  run(): void {
    this.controller.process('user-1', 'sku-1');
  }
}
