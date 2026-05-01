// METRICS: DIT=0 (`implements` is excluded; no `extends` clause).
// Used by the rule unit test to confirm `implements` does not contribute
// to depth.
interface Named {
  readonly name: string;
}

export class Implementer implements Named {
  readonly name = 'shallow';
}
