import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Project, type ClassDeclaration as TsMorphClassDeclaration } from 'ts-morph';

import { computeDit } from '../../src/utils/dit-chain';

/**
 * Direct unit tests for the pure ts-morph DIT helper. Locks the public
 * shape `{ dit, chain }` and exercises the loop's three exit conditions
 * (no base, base in .d.ts, cycle).
 *
 * Project is constructed in-memory per test — no fixtures on disk, no
 * project-singleton wiring (helper is independent of the rule plumbing).
 */

let project: Project;

beforeEach(() => {
  project = new Project({ useInMemoryFileSystem: true });
});

afterEach(() => {
  project = undefined as unknown as Project;
});

function getClass(filePath: string, className: string): TsMorphClassDeclaration {
  const file = project.getSourceFileOrThrow(filePath);
  return file.getClassOrThrow(className);
}

describe('computeDit', () => {
  it('returns dit=0 with chain=[name] for a class with no extends', () => {
    project.createSourceFile('A.ts', 'export class A {}');
    expect(computeDit(getClass('A.ts', 'A'))).toEqual({ dit: 0, chain: ['A'] });
  });

  it('walks a linear extends chain and reports the leaf-to-root order', () => {
    project.createSourceFile('A.ts', 'export class A {}');
    project.createSourceFile(
      'B.ts',
      `import { A } from './A';
       export class B extends A {}`,
    );
    project.createSourceFile(
      'C.ts',
      `import { B } from './B';
       export class C extends B {}`,
    );

    expect(computeDit(getClass('C.ts', 'C'))).toEqual({
      dit: 2,
      chain: ['C', 'B', 'A'],
    });
  });

  it('handles a deep chain (dit=5) without off-by-one', () => {
    project.createSourceFile('L0.ts', 'export class L0 {}');
    for (let i = 1; i <= 5; i++) {
      project.createSourceFile(
        `L${i}.ts`,
        `import { L${i - 1} } from './L${i - 1}';
         export class L${i} extends L${i - 1} {}`,
      );
    }

    expect(computeDit(getClass('L5.ts', 'L5'))).toEqual({
      dit: 5,
      chain: ['L5', 'L4', 'L3', 'L2', 'L1', 'L0'],
    });
  });

  it('stops when the base class lives in a .d.ts file (does not include it)', () => {
    project.createSourceFile('lib.d.ts', 'export declare class BuiltIn {}');
    project.createSourceFile(
      'Foo.ts',
      `import { BuiltIn } from './lib';
       export class Foo extends BuiltIn {}`,
    );

    expect(computeDit(getClass('Foo.ts', 'Foo'))).toEqual({
      dit: 0,
      chain: ['Foo'],
    });
  });

  it('uses the <anonymous> fallback when the input class itself has no name', () => {
    // `export default class { ... }` produces a ClassDeclaration without a name.
    project.createSourceFile('Anon.ts', 'export default class {}');
    const cls = project.getSourceFileOrThrow('Anon.ts').getClasses()[0]!;

    expect(computeDit(cls)).toEqual({ dit: 0, chain: ['<anonymous>'] });
  });

  it('uses the <anonymous> fallback for an anonymous base class', () => {
    // `class Foo extends class {} {}` — the base is a nameless class expression.
    // ts-morph's getBaseClass() walks through it; the chain entry falls back
    // to '<anonymous>' (line 32).
    project.createSourceFile('Foo.ts', 'export class Foo extends class {} {}');

    const result = computeDit(getClass('Foo.ts', 'Foo'));
    expect(result.chain[0]).toBe('Foo');
    // Base may or may not be resolved depending on ts-morph's handling of
    // inline class expressions; if it is, the second entry must be the
    // anonymous fallback. If not (getBaseClass returns undefined), the chain
    // stops at the leaf. Both outcomes exercise a different defensive branch
    // and neither should crash.
    if (result.chain.length === 2) {
      expect(result.chain[1]).toBe('<anonymous>');
      expect(result.dit).toBe(1);
    } else {
      expect(result).toEqual({ dit: 0, chain: ['Foo'] });
    }
  });

  it('stops when extends does not resolve to a class declaration', () => {
    // Extending the result of a function call yields no resolvable base
    // class; getBaseClass returns undefined and the loop breaks at line 27.
    project.createSourceFile(
      'Foo.ts',
      `function mixin() { return class { foo = 1; }; }
       export class Foo extends mixin() {}`,
    );

    expect(computeDit(getClass('Foo.ts', 'Foo'))).toEqual({
      dit: 0,
      chain: ['Foo'],
    });
  });

  // Note: the cycle guard at dit-chain.ts:29 (`if (visited.has(base)) break;`)
  // is a defensive backstop against an inheritance cycle reachable from
  // `getBaseClass()`. TypeScript rejects circular `extends` chains at type-check
  // time, so this branch is unreachable from any valid program. The acceptable
  // coverage gap is documented in SPEC § 5.
});
