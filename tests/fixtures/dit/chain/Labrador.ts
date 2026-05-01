// METRICS: DIT=4. Chain: Labrador → Dog → Mammal → Animal → LivingThing.
// With max=3 this fixture triggers a diagnostic (E2E-010).
import { Dog } from './Dog';

export class Labrador extends Dog {
  retrieve(): string {
    return 'fetched';
  }
}
