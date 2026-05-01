// METRICS: DIT=1 (extends a local root).
import { Standalone } from './Standalone';

export class OneLevel extends Standalone {
  doubleValue(): number {
    return this.value * 2;
  }
}
