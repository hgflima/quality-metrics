// METRICS: LCOM=3, P=3, Q=0
// Each method touches a single, distinct field. Pair analysis:
//   (saveUser, sendWelcome)        — share ∅          → P++
//   (saveUser, invalidateSession)  — share ∅          → P++
//   (sendWelcome, invalidateSession) — share ∅        → P++
// LCOM1 = max(P - Q, 0) = max(3, 0) = 3
// DO NOT MODIFY without updating tests/rules/lcom.test.ts expected values.

interface Database { save(user: User): void }
interface Mailer { send(email: string): void }
interface Cache { delete(id: string): void }
interface User { id: string; name: string }

export class MixedService {
  private db!: Database;
  private mailer!: Mailer;
  private cache!: Cache;

  saveUser(user: User): void {
    this.db.save(user);
  }

  sendWelcome(email: string): void {
    this.mailer.send(email);
  }

  invalidateSession(id: string): void {
    this.cache.delete(id);
  }
}
