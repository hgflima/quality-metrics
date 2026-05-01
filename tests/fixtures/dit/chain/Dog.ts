// METRICS: DIT=3.
import { Mammal } from './Mammal';

export class Dog extends Mammal {
  bark(): string {
    return 'woof';
  }
}
