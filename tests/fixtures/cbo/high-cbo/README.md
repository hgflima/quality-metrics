# CBO fixture — `high-cbo`

| Class               | Outgoing              | Incoming                   | CBO    |
| ------------------- | --------------------- | -------------------------- | ------ |
| `OrderController`   | 7                     | 5                          | **12** |
| Each service class  | 0 (or 1 internal)     | 1 (from `OrderController`) | 1      |
| Each referrer class | 1 (`OrderController`) | 0                          | 1      |

The fixture targets `OrderController`. All other files exist only to provide
the seven outgoing dependencies and the five incoming dependencies.

**Outgoing (7):**
`OrderService`, `PaymentService`, `EmailService`, `UserRepository`,
`InventoryService`, `AuditLogger`, `NotificationService`

**Incoming (5):**
`OrderRouter`, `OrderEndToEndTest`, `CheckoutFlow`, `AdminPanel`,
`MetricsCollector`

Inheritance (`extends`/`implements`) is **not** used anywhere in this
fixture, so the rule does not have to filter inheritance edges out of the
count for these specific files. A separate fixture (TASK-extension or
inline test in `cbo.test.ts`) covers the inheritance-exclusion case
(E2E-008).

DO NOT MODIFY any file in this directory without updating the expected
values in `tests/rules/cbo.test.ts`.
