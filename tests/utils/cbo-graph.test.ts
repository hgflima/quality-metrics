import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Project, type ClassDeclaration as TsMorphClassDeclaration } from 'ts-morph';

import { collectIncomingClasses, collectOutgoingClasses } from '../../src/utils/cbo-graph';

/**
 * Direct unit tests for the pure ts-morph CBO graph helpers. Exercises the
 * branches that the rule-level tests reach only transitively, and locks the
 * shape that scripts/report/collect-metrics.ts consumes (Set<string> of
 * sibling class names).
 *
 * Project is constructed in-memory per test — no fixtures on disk, no
 * project-singleton wiring (helpers are independent of the rule plumbing).
 */

let project: Project;

beforeEach(() => {
  project = new Project({ useInMemoryFileSystem: true });
});

afterEach(() => {
  // ts-morph in-memory project releases on GC; no explicit teardown needed,
  // but reassign to avoid accidental cross-test reuse.
  project = undefined as unknown as Project;
});

function getClass(filePath: string, className: string): TsMorphClassDeclaration {
  const file = project.getSourceFileOrThrow(filePath);
  return file.getClassOrThrow(className);
}

/* ──────────────────────────────────────────────────────────────────────── */
/* collectOutgoingClasses                                                   */
/* ──────────────────────────────────────────────────────────────────────── */

describe('collectOutgoingClasses', () => {
  it('returns names of all distinct external classes referenced from members', () => {
    project.createSourceFile('A.ts', 'export class A {}');
    project.createSourceFile('B.ts', 'export class B {}');
    project.createSourceFile('C.ts', 'export class C {}');
    project.createSourceFile(
      'Foo.ts',
      `import { A } from './A';
       import { B } from './B';
       import { C } from './C';
       export class Foo {
         a = new A();
         b = new B();
         use() { return new C(); }
       }`,
    );

    const out = collectOutgoingClasses(getClass('Foo.ts', 'Foo'));
    expect([...out].sort()).toEqual(['A', 'B', 'C']);
  });

  it('skips self-references (cls.getMembers references the class itself)', () => {
    project.createSourceFile(
      'Foo.ts',
      `export class Foo {
         static factory(): Foo { return new Foo(); }
       }`,
    );

    const out = collectOutgoingClasses(getClass('Foo.ts', 'Foo'));
    expect([...out]).toEqual([]);
  });

  it('skips identifiers whose definition lives in a .d.ts file', () => {
    project.createSourceFile('lib.d.ts', 'export declare class BuiltIn {}');
    project.createSourceFile(
      'Foo.ts',
      `import { BuiltIn } from './lib';
       export class Foo {
         use() { return new BuiltIn(); }
       }`,
    );

    const out = collectOutgoingClasses(getClass('Foo.ts', 'Foo'));
    expect([...out]).toEqual([]);
  });

  it('skips identifiers whose definition is not a ClassDeclaration (interfaces, type aliases)', () => {
    project.createSourceFile(
      'types.ts',
      `export interface IFoo { x: number }
       export type Bar = { y: string };`,
    );
    project.createSourceFile(
      'Foo.ts',
      `import type { IFoo, Bar } from './types';
       export class Foo {
         a: IFoo = { x: 1 };
         b: Bar = { y: 'hi' };
       }`,
    );

    const out = collectOutgoingClasses(getClass('Foo.ts', 'Foo'));
    expect([...out]).toEqual([]);
  });

  it('does not add a referenced class whose name is null (default-exported anonymous class)', () => {
    // `export default class { ... }` produces a ClassDeclaration without a name.
    // Importing via `import X from './A'` resolves X.getDefinitionNodes() to
    // that anonymous ClassDeclaration; lines 46-47 silence the missing name.
    project.createSourceFile('A.ts', 'export default class { greet() {} }');
    project.createSourceFile(
      'Foo.ts',
      `import X from './A';
       export class Foo {
         use() { return new X(); }
       }`,
    );

    const out = collectOutgoingClasses(getClass('Foo.ts', 'Foo'));
    expect([...out]).toEqual([]);
  });
});

/* ──────────────────────────────────────────────────────────────────────── */
/* collectIncomingClasses                                                   */
/* ──────────────────────────────────────────────────────────────────────── */

describe('collectIncomingClasses', () => {
  it('returns names of every other class whose body references this class', () => {
    project.createSourceFile('Foo.ts', 'export class Foo { tag = "f" }');
    project.createSourceFile(
      'B.ts',
      `import { Foo } from './Foo';
       export class B { use() { return new Foo(); } }`,
    );
    project.createSourceFile(
      'C.ts',
      `import { Foo } from './Foo';
       export class C { f: Foo = new Foo(); }`,
    );

    const incoming = collectIncomingClasses(getClass('Foo.ts', 'Foo'));
    expect([...incoming].sort()).toEqual(['B', 'C']);
  });

  it('skips heritage-clause references (extends does not count as coupling)', () => {
    project.createSourceFile('A.ts', 'export class A { x = 1 }');
    project.createSourceFile(
      'B.ts',
      `import { A } from './A';
       export class B extends A {}`,
    );

    const incoming = collectIncomingClasses(getClass('A.ts', 'A'));
    expect([...incoming]).toEqual([]);
  });

  it('skips references that live in .d.ts files', () => {
    project.createSourceFile('Foo.ts', 'export class Foo { x = 1 }');
    project.createSourceFile(
      'ambient.d.ts',
      `import { Foo } from './Foo';
       declare const f: Foo;
       export {};`,
    );

    const incoming = collectIncomingClasses(getClass('Foo.ts', 'Foo'));
    expect([...incoming]).toEqual([]);
  });

  it('skips the self-reference at the declaration site', () => {
    // `findReferencesAsNodes` includes the declaration name itself; the walker
    // resolves its containing class to `cls`, and line 63 filters it out.
    project.createSourceFile(
      'Foo.ts',
      `export class Foo {
         clone(): Foo { return new Foo(); }
       }`,
    );

    const incoming = collectIncomingClasses(getClass('Foo.ts', 'Foo'));
    expect([...incoming]).toEqual([]);
  });

  it('skips top-level references that are not contained by any class', () => {
    project.createSourceFile('Foo.ts', 'export class Foo { x = 1 }');
    project.createSourceFile(
      'consumer.ts',
      `import { Foo } from './Foo';
       export const f = new Foo();`,
    );

    const incoming = collectIncomingClasses(getClass('Foo.ts', 'Foo'));
    expect([...incoming]).toEqual([]);
  });

  it('does not add a containing class whose name is null (anonymous class expression)', () => {
    // The reference to Foo lives inside `class { ... }` (anonymous class
    // expression). The walker resolves the containing class, but
    // containing.getName() returns undefined; lines 65-66 silence the add.
    project.createSourceFile('Foo.ts', 'export class Foo { x = 1 }');
    project.createSourceFile(
      'Anon.ts',
      `import { Foo } from './Foo';
       export const X = class { use() { return new Foo(); } };`,
    );

    const incoming = collectIncomingClasses(getClass('Foo.ts', 'Foo'));
    expect([...incoming]).toEqual([]);
  });
});
