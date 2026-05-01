import { OrderService } from './services/OrderService';
import { PaymentService } from './services/PaymentService';
import { EmailService } from './services/EmailService';
import { UserRepository } from './services/UserRepository';
import { InventoryService } from './services/InventoryService';
import { AuditLogger } from './services/AuditLogger';
import { NotificationService } from './services/NotificationService';

export class OrderController {
  constructor(
    private orders: OrderService,
    private payments: PaymentService,
    private emails: EmailService,
    private users: UserRepository,
    private inventory: InventoryService,
    private audit: AuditLogger,
    private notifications: NotificationService,
  ) {}

  process(userId: string, sku: string): void {
    const user = this.users.findById(userId);
    this.inventory.reserve(sku);
    const order = this.orders.create(user, sku);
    this.payments.charge(order);
    this.emails.sendReceipt(user, order);
    this.notifications.notify(user, order);
    this.audit.log('order.process', { userId, sku });
  }
}
