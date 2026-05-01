// Six external classes referenced by MixedClass — counted as outgoing CBO edges.

export class LogService {
  write(_msg: string): void {}
}
export class MetricService {
  incr(_name: string): void {}
}
export class CacheService {
  put(_k: string, _v: unknown): void {}
}
export class QueueService {
  enqueue(_x: unknown): void {}
}
export class TimerService {
  now(): number {
    return 0;
  }
}
export class ConfigService {
  get(_k: string): string {
    return '';
  }
}
