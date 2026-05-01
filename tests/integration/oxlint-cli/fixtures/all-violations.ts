// MIX-1 fixture for cross-tier separation testing.
//
// Designed to trigger all 5 rules simultaneously so that each tier's
// "must NOT fire the other tier's rules" assertion is non-vacuous:
//   - wmc      (fast): MixedClass has WMC=18 (>15)
//   - halstead (fast): processData has E>>100
//   - lcom     (fast): MixedClass has unrelated method pairs (LCOM>0)
//   - cbo      (deep): MixedClass references 6 services (outgoing) and is
//                      referenced by 5 consumers (incoming) → CBO=11>10
//   - dit      (deep): Level5 extends 4 ancestors (DIT=4>3)
//
// Threshold separation validated by oxlint-cli.test.ts MIX describe block:
//   - fast config: emits wmc + halstead + lcom diagnostics; never cbo/dit
//   - deep config: emits cbo + dit diagnostics; never wmc/halstead/lcom

import {
  LogService,
  MetricService,
  CacheService,
  QueueService,
  TimerService,
  ConfigService,
} from './external-services.js';

interface DbHandle {
  save(x: unknown): void;
}
interface MailHandle {
  send(x: string): void;
}
interface CacheHandle {
  delete(x: string): void;
}

export class MixedClass {
  private db!: DbHandle;
  private mailer!: MailHandle;
  private cache!: CacheHandle;

  constructor(
    private log: LogService,
    private metrics: MetricService,
    private cacheSvc: CacheService,
    private queue: QueueService,
    private timer: TimerService,
    private config: ConfigService,
  ) {}

  saveItem(x: number): void {
    if (x > 0) {
      if (x < 100) this.db.save(x);
    }
    this.log.write('saved');
    this.metrics.incr('save');
  }

  notify(email: string): void {
    switch (email) {
      case 'a@b.c':
        break;
      case 'd@e.f':
        break;
      case 'g@h.i':
        break;
      case 'j@k.l':
        break;
    }
    this.mailer.send(email);
    this.queue.enqueue(email);
  }

  drop(id: string): void {
    if (!id) return;
    if (id.length > 100) return;
    if (id === 'root') return;
    this.cache.delete(id);
    this.cacheSvc.put(id, null);
  }

  validate(n: number): boolean {
    if (n < 0) return false;
    if (n > 1000) return false;
    this.timer.now();
    return true;
  }

  process(flag: boolean): number {
    if (flag) return 1;
    if (!flag) return 0;
    this.config.get('mode');
    return -1;
  }
}

export function processData(
  amount: number,
  currency: string,
  method: string,
  userId: string,
  orderId: string,
): Record<string, unknown> {
  if (amount <= 0) throw new Error('Invalid amount');
  if (!currency || currency.length !== 3) throw new Error('Invalid currency');
  const rate = currency === 'USD' ? 1.0 : currency === 'EUR' ? 1.1 : 0.9;
  const converted = amount * rate;
  const fee = method === 'card' ? converted * 0.029 + 0.3 : 0;
  const total = converted + fee;
  if (total > 10000 && method !== 'wire') throw new Error('Limit exceeded');
  return { userId, orderId, total, currency, method, timestamp: Date.now() };
}

export class Level1 {}
export class Level2 extends Level1 {}
export class Level3 extends Level2 {}
export class Level4 extends Level3 {}
export class Level5 extends Level4 {
  ping(): string {
    return 'pong';
  }
}
