// Five external classes that reference MixedClass — counted as incoming CBO edges.

import { MixedClass } from './all-violations.js';

export class ConsumerA {
  constructor(private mix: MixedClass) {}
  go(): void {
    this.mix.validate(1);
  }
}

export class ConsumerB {
  constructor(private mix: MixedClass) {}
  go(): void {
    this.mix.process(true);
  }
}

export class ConsumerC {
  constructor(private mix: MixedClass) {}
  go(): void {
    this.mix.drop('id');
  }
}

export class ConsumerD {
  constructor(private mix: MixedClass) {}
  go(): void {
    this.mix.notify('e@m.l');
  }
}

export class ConsumerE {
  constructor(private mix: MixedClass) {}
  go(): void {
    this.mix.saveItem(7);
  }
}
