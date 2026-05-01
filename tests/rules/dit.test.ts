import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { dit } from '../../src/rules/dit';
import { resetProjectSingleton, setTsMorphLoader } from '../../src/project-singleton';
import type { ReportDescriptor, RuleContext } from '../../src/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIT_CHAIN_DIR = path.resolve(__dirname, '../fixtures/dit/chain');
const DIT_SHALLOW_DIR = path.resolve(__dirname, '../fixtures/dit/shallow');

const DIT_CHAIN_TSCONFIG = path.join(DIT_CHAIN_DIR, 'tsconfig.json');
const DIT_SHALLOW_TSCONFIG = path.join(DIT_SHALLOW_DIR, 'tsconfig.json');

const LABRADOR_PATH = path.join(DIT_CHAIN_DIR, 'Labrador.ts');
const DOG_PATH = path.join(DIT_CHAIN_DIR, 'Dog.ts');
const MAMMAL_PATH = path.join(DIT_CHAIN_DIR, 'Mammal.ts');
const ANIMAL_PATH = path.join(DIT_CHAIN_DIR, 'Animal.ts');
const LIVING_THING_PATH = path.join(DIT_CHAIN_DIR, 'LivingThing.ts');
const ONE_LEVEL_PATH = path.join(DIT_SHALLOW_DIR, 'OneLevel.ts');
const STANDALONE_PATH = path.join(DIT_SHALLOW_DIR, 'Standalone.ts');
const IMPLEMENTER_PATH = path.join(DIT_SHALLOW_DIR, 'Implementer.ts');

/* ──────────────────────────────────────────────────────────────────────── */
/* Test scaffolding                                                          */
/* ──────────────────────────────────────────────────────────────────────── */

interface CapturedReport extends ReportDescriptor {}

function makeContext(
  options: unknown[],
  filename: string,
): { context: RuleContext; reports: CapturedReport[] } {
  const reports: CapturedReport[] = [];
  const context: RuleContext = {
    report(descriptor: ReportDescriptor): void {
      reports.push(descriptor);
    },
    getFilename(): string {
      return filename;
    },
    options,
  };
  return { context, reports };
}

function runOn(node: unknown, options: unknown[], filename: string): CapturedReport[] {
  const { context, reports } = makeContext(options, filename);
  const visitors = dit.create(context);
  if (!node || typeof node !== 'object') return reports;
  const t = (node as { type?: string }).type;
  if (t === 'ClassDeclaration') visitors.ClassDeclaration?.(node);
  else if (t === 'ClassExpression') visitors.ClassExpression?.(node);
  return reports;
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Minimal ESTree nodes — just enough for the rule to read `type` + `id.name`. */
/* The rule's analysis runs through ts-morph (not the ESTree subtree).        */
/* ──────────────────────────────────────────────────────────────────────── */

function classDecl(name: string | null): unknown {
  return {
    type: 'ClassDeclaration',
    id: name == null ? null : { type: 'Identifier', name },
    superClass: null,
    body: { type: 'ClassBody', body: [] },
  };
}

function classExpr(name: string | null): unknown {
  return {
    type: 'ClassExpression',
    id: name == null ? null : { type: 'Identifier', name },
    superClass: null,
    body: { type: 'ClassBody', body: [] },
  };
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Lifecycle: keep the singleton clean between tests.                        */
/* ──────────────────────────────────────────────────────────────────────── */

beforeEach(() => {
  setTsMorphLoader(null);
  resetProjectSingleton();
});

afterEach(() => {
  setTsMorphLoader(null);
  resetProjectSingleton();
});

/* ──────────────────────────────────────────────────────────────────────── */
/* Meta + schema shape                                                       */
/* ──────────────────────────────────────────────────────────────────────── */

describe('rules/dit — meta & schema', () => {
  it('exposes the OXLint/ESLint rule shape', () => {
    expect(dit).toMatchObject({
      meta: {
        type: 'suggestion',
        docs: { description: expect.any(String) },
        schema: expect.any(Array),
        messages: expect.any(Object),
      },
      create: expect.any(Function),
    });
  });

  it('declares the expected schema with both options', () => {
    const schema = dit.meta.schema[0] as {
      type: string;
      properties: Record<string, unknown>;
      additionalProperties: boolean;
    };
    expect(schema.type).toBe('object');
    expect(Object.keys(schema.properties).sort()).toEqual(['max', 'tsconfigPath']);
    expect(schema.additionalProperties).toBe(false);
  });

  it('exposes the documented diagnostic message template', () => {
    expect(dit.meta.messages['tooHigh']).toContain('DIT of');
    expect(dit.meta.messages['tooHigh']).toContain('Chain');
  });
});

/* ──────────────────────────────────────────────────────────────────────── */
/* Graceful degradation: ts-morph unavailable / file/class missing           */
/* ──────────────────────────────────────────────────────────────────────── */

describe('rules/dit — graceful degradation', () => {
  it('produces no diagnostics when ts-morph fails to load', () => {
    setTsMorphLoader(() => {
      throw new Error('Cannot find module ts-morph');
    });

    const reports = runOn(
      classDecl('Labrador'),
      [{ max: 0, tsconfigPath: DIT_CHAIN_TSCONFIG }],
      LABRADOR_PATH,
    );
    expect(reports).toEqual([]);
  });

  it('produces no diagnostics when source file is not in the project', () => {
    const reports = runOn(
      classDecl('Foo'),
      [{ max: 0, tsconfigPath: DIT_CHAIN_TSCONFIG }],
      '/no/such/file.ts',
    );
    expect(reports).toEqual([]);
  });

  it('produces no diagnostics when the class is not in the source file', () => {
    const reports = runOn(
      classDecl('NotARealClass'),
      [{ max: 0, tsconfigPath: DIT_CHAIN_TSCONFIG }],
      LABRADOR_PATH,
    );
    expect(reports).toEqual([]);
  });

  it('skips anonymous class declarations (no id)', () => {
    const reports = runOn(
      classDecl(null),
      [{ max: 0, tsconfigPath: DIT_CHAIN_TSCONFIG }],
      LABRADOR_PATH,
    );
    expect(reports).toEqual([]);
  });

  it('skips anonymous class expressions (no id)', () => {
    const reports = runOn(
      classExpr(null),
      [{ max: 0, tsconfigPath: DIT_CHAIN_TSCONFIG }],
      LABRADOR_PATH,
    );
    expect(reports).toEqual([]);
  });
});

/* ──────────────────────────────────────────────────────────────────────── */
/* Options handling                                                          */
/* ──────────────────────────────────────────────────────────────────────── */

describe('rules/dit — options handling', () => {
  it('uses default max=5 when no options are supplied — Labrador DIT=4 stays silent', () => {
    // Labrador DIT = 4; default max = 5; 4 <= 5 → silent.
    const reports = runOn(
      classDecl('Labrador'),
      [{ tsconfigPath: DIT_CHAIN_TSCONFIG }],
      LABRADOR_PATH,
    );
    expect(reports).toEqual([]);
  });

  it('treats malformed options (string) as missing — falls back to defaults', () => {
    // Falls back to default tsconfig (no fixture loaded), so no class found.
    const reports = runOn(
      classDecl('Labrador'),
      ['not-an-object', DIT_CHAIN_TSCONFIG],
      LABRADOR_PATH,
    );
    expect(reports).toEqual([]);
  });

  it('respects partial options — max specified, tsconfigPath missing', () => {
    // Without tsconfigPath the default ts-morph project has no source files
    // loaded → file lookup fails → silent.
    const reports = runOn(classDecl('Labrador'), [{ max: 0 }], LABRADOR_PATH);
    expect(reports).toEqual([]);
  });

  it('honors explicit max = 0 to surface any inheritance edge', () => {
    // Animal DIT = 1; max = 0 → fires.
    const reports = runOn(
      classDecl('Animal'),
      [{ max: 0, tsconfigPath: DIT_CHAIN_TSCONFIG }],
      ANIMAL_PATH,
    );
    expect(reports).toHaveLength(1);
    expect(reports[0]!.data).toMatchObject({ dit: 1, max: 0 });
  });
});

/* ──────────────────────────────────────────────────────────────────────── */
/* Cross-file inheritance chain (E2E-010)                                    */
/* ──────────────────────────────────────────────────────────────────────── */

describe('rules/dit — cross-file chain (E2E-010)', () => {
  it('Labrador DIT = 4 — breaches at max=3 and reports the full chain', () => {
    const reports = runOn(
      classDecl('Labrador'),
      [{ max: 3, tsconfigPath: DIT_CHAIN_TSCONFIG }],
      LABRADOR_PATH,
    );
    expect(reports).toHaveLength(1);
    expect(reports[0]!.data).toMatchObject({
      className: 'Labrador',
      dit: 4,
      max: 3,
      chain: 'Labrador → Dog → Mammal → Animal → LivingThing',
    });
  });

  it('emits the documented diagnostic message — single-line chain', () => {
    const reports = runOn(
      classDecl('Labrador'),
      [{ max: 3, tsconfigPath: DIT_CHAIN_TSCONFIG }],
      LABRADOR_PATH,
    );
    expect(reports).toHaveLength(1);
    expect(reports[0]!.message).toBe(
      "Class 'Labrador' has DIT of 4 (max: 3).\n" +
        '  Chain: Labrador → Dog → Mammal → Animal → LivingThing',
    );
  });

  it('strict-greater-than threshold — equality (max=4) stays silent', () => {
    const reports = runOn(
      classDecl('Labrador'),
      [{ max: 4, tsconfigPath: DIT_CHAIN_TSCONFIG }],
      LABRADOR_PATH,
    );
    expect(reports).toEqual([]);
  });

  it('Dog DIT = 3 — chain: Dog → Mammal → Animal → LivingThing', () => {
    const reports = runOn(
      classDecl('Dog'),
      [{ max: 0, tsconfigPath: DIT_CHAIN_TSCONFIG }],
      DOG_PATH,
    );
    expect(reports).toHaveLength(1);
    expect(reports[0]!.data).toMatchObject({
      dit: 3,
      chain: 'Dog → Mammal → Animal → LivingThing',
    });
  });

  it('Mammal DIT = 2 — chain: Mammal → Animal → LivingThing', () => {
    const reports = runOn(
      classDecl('Mammal'),
      [{ max: 0, tsconfigPath: DIT_CHAIN_TSCONFIG }],
      MAMMAL_PATH,
    );
    expect(reports).toHaveLength(1);
    expect(reports[0]!.data).toMatchObject({
      dit: 2,
      chain: 'Mammal → Animal → LivingThing',
    });
  });

  it('Animal DIT = 1 — chain: Animal → LivingThing', () => {
    const reports = runOn(
      classDecl('Animal'),
      [{ max: 0, tsconfigPath: DIT_CHAIN_TSCONFIG }],
      ANIMAL_PATH,
    );
    expect(reports).toHaveLength(1);
    expect(reports[0]!.data).toMatchObject({
      dit: 1,
      chain: 'Animal → LivingThing',
    });
  });

  it('LivingThing DIT = 0 — root class, silent at max=0', () => {
    const reports = runOn(
      classDecl('LivingThing'),
      [{ max: 0, tsconfigPath: DIT_CHAIN_TSCONFIG }],
      LIVING_THING_PATH,
    );
    expect(reports).toEqual([]);
  });

  it('attaches the class node as the diagnostic location', () => {
    const node = classDecl('Labrador');
    const reports = runOn(node, [{ max: 0, tsconfigPath: DIT_CHAIN_TSCONFIG }], LABRADOR_PATH);
    expect(reports[0]!.node).toBe(node);
  });
});

/* ──────────────────────────────────────────────────────────────────────── */
/* Shallow / no-extends fixtures                                             */
/* ──────────────────────────────────────────────────────────────────────── */

describe('rules/dit — shallow fixtures', () => {
  it('Standalone DIT = 0 — no extends, silent at max=0', () => {
    const reports = runOn(
      classDecl('Standalone'),
      [{ max: 0, tsconfigPath: DIT_SHALLOW_TSCONFIG }],
      STANDALONE_PATH,
    );
    expect(reports).toEqual([]);
  });

  it('OneLevel DIT = 1 — extends a local root', () => {
    const reports = runOn(
      classDecl('OneLevel'),
      [{ max: 0, tsconfigPath: DIT_SHALLOW_TSCONFIG }],
      ONE_LEVEL_PATH,
    );
    expect(reports).toHaveLength(1);
    expect(reports[0]!.data).toMatchObject({
      dit: 1,
      chain: 'OneLevel → Standalone',
    });
  });

  it('Implementer with `implements` only — DIT = 0 (interfaces excluded)', () => {
    // `implements Named` must not contribute to depth.
    const reports = runOn(
      classDecl('Implementer'),
      [{ max: 0, tsconfigPath: DIT_SHALLOW_TSCONFIG }],
      IMPLEMENTER_PATH,
    );
    expect(reports).toEqual([]);
  });
});

/* ──────────────────────────────────────────────────────────────────────── */
/* Visitor wiring                                                            */
/* ──────────────────────────────────────────────────────────────────────── */

describe('rules/dit — visitor wiring', () => {
  it('returns visitors for both ClassDeclaration and ClassExpression', () => {
    const reports: CapturedReport[] = [];
    const context: RuleContext = {
      report: (d) => reports.push(d),
      getFilename: () => LABRADOR_PATH,
      options: [{ max: 0, tsconfigPath: DIT_CHAIN_TSCONFIG }],
    };
    const visitors = dit.create(context);
    expect(typeof visitors.ClassDeclaration).toBe('function');
    expect(typeof visitors.ClassExpression).toBe('function');
  });

  it('returns no-op visitors when ts-morph is unavailable (avoids visitor-key crashes)', () => {
    setTsMorphLoader(() => {
      throw new Error('boom');
    });
    const context: RuleContext = {
      report: () => {},
      getFilename: () => '/x.ts',
      options: [],
    };
    const visitors = dit.create(context);
    expect(typeof visitors.ClassDeclaration).toBe('function');
    expect(typeof visitors.ClassExpression).toBe('function');
    expect(() => visitors.ClassDeclaration?.(classDecl('Anything'))).not.toThrow();
  });
});
