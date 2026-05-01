import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cbo } from '../../src/rules/cbo';
import { resetProjectSingleton, setTsMorphLoader } from '../../src/project-singleton';
import type { ReportDescriptor, RuleContext } from '../../src/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HIGH_CBO_DIR = path.resolve(__dirname, '../fixtures/cbo/high-cbo');
const LOW_CBO_DIR = path.resolve(__dirname, '../fixtures/cbo/low-cbo');
const DIT_CHAIN_DIR = path.resolve(__dirname, '../fixtures/dit/chain');
const DIT_SHALLOW_DIR = path.resolve(__dirname, '../fixtures/dit/shallow');

const HIGH_CBO_TSCONFIG = path.join(HIGH_CBO_DIR, 'tsconfig.json');
const LOW_CBO_TSCONFIG = path.join(LOW_CBO_DIR, 'tsconfig.json');
const DIT_CHAIN_TSCONFIG = path.join(DIT_CHAIN_DIR, 'tsconfig.json');
const DIT_SHALLOW_TSCONFIG = path.join(DIT_SHALLOW_DIR, 'tsconfig.json');

const ORDER_CONTROLLER_PATH = path.join(HIGH_CBO_DIR, 'OrderController.ts');
const ORDER_SERVICE_PATH = path.join(HIGH_CBO_DIR, 'services/OrderService.ts');
const SIMPLE_CLASS_PATH = path.join(LOW_CBO_DIR, 'SimpleClass.ts');
const LABRADOR_PATH = path.join(DIT_CHAIN_DIR, 'Labrador.ts');
const DOG_PATH = path.join(DIT_CHAIN_DIR, 'Dog.ts');
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
  const visitors = cbo.create(context);
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

describe('rules/cbo — meta & schema', () => {
  it('exposes the OXLint/ESLint rule shape', () => {
    expect(cbo).toMatchObject({
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
    const schema = cbo.meta.schema[0] as {
      type: string;
      properties: Record<string, unknown>;
      additionalProperties: boolean;
    };
    expect(schema.type).toBe('object');
    expect(Object.keys(schema.properties).sort()).toEqual(['max', 'tsconfigPath']);
    expect(schema.additionalProperties).toBe(false);
  });

  it('exposes the documented diagnostic message template', () => {
    expect(cbo.meta.messages['tooHigh']).toContain('CBO of');
    expect(cbo.meta.messages['tooHigh']).toContain('Outgoing');
  });
});

/* ──────────────────────────────────────────────────────────────────────── */
/* Graceful degradation: ts-morph unavailable / file/class missing           */
/* ──────────────────────────────────────────────────────────────────────── */

describe('rules/cbo — graceful degradation', () => {
  it('produces no diagnostics when ts-morph fails to load', () => {
    setTsMorphLoader(() => {
      throw new Error('Cannot find module ts-morph');
    });

    const reports = runOn(
      classDecl('OrderController'),
      [{ max: 0, tsconfigPath: HIGH_CBO_TSCONFIG }],
      ORDER_CONTROLLER_PATH,
    );
    expect(reports).toEqual([]);
  });

  it('produces no diagnostics when source file is not in the project', () => {
    const reports = runOn(
      classDecl('Foo'),
      [{ max: 0, tsconfigPath: HIGH_CBO_TSCONFIG }],
      '/no/such/file.ts',
    );
    expect(reports).toEqual([]);
  });

  it('produces no diagnostics when the class is not in the source file', () => {
    const reports = runOn(
      classDecl('NotARealClass'),
      [{ max: 0, tsconfigPath: HIGH_CBO_TSCONFIG }],
      ORDER_CONTROLLER_PATH,
    );
    expect(reports).toEqual([]);
  });

  it('skips anonymous class declarations (no id)', () => {
    const reports = runOn(
      classDecl(null),
      [{ max: 0, tsconfigPath: HIGH_CBO_TSCONFIG }],
      ORDER_CONTROLLER_PATH,
    );
    expect(reports).toEqual([]);
  });

  it('skips anonymous class expressions (no id)', () => {
    const reports = runOn(
      classExpr(null),
      [{ max: 0, tsconfigPath: HIGH_CBO_TSCONFIG }],
      ORDER_CONTROLLER_PATH,
    );
    expect(reports).toEqual([]);
  });
});

/* ──────────────────────────────────────────────────────────────────────── */
/* Options handling                                                          */
/* ──────────────────────────────────────────────────────────────────────── */

describe('rules/cbo — options handling', () => {
  it('uses default max=10 when no options are supplied — OrderController CBO=12 breaches', () => {
    // OrderController CBO = 7 outgoing + 5 incoming = 12 > default 10 → fires.
    const reports = runOn(
      classDecl('OrderController'),
      [{ tsconfigPath: HIGH_CBO_TSCONFIG }],
      ORDER_CONTROLLER_PATH,
    );
    expect(reports).toHaveLength(1);
    expect(reports[0]!.data).toMatchObject({ cbo: 12, max: 10 });
  });

  it('treats malformed options (string) as missing — falls back to defaults', () => {
    // Falls back to default tsconfig (no fixture loaded), so no class found.
    const reports = runOn(
      classDecl('OrderController'),
      ['not-an-object', HIGH_CBO_TSCONFIG],
      ORDER_CONTROLLER_PATH,
    );
    expect(reports).toEqual([]);
  });

  it('respects partial options — max specified, tsconfigPath missing', () => {
    // Without tsconfigPath the default ts-morph project has no source files
    // loaded → file lookup fails → silent.
    const reports = runOn(classDecl('OrderController'), [{ max: 0 }], ORDER_CONTROLLER_PATH);
    expect(reports).toEqual([]);
  });
});

/* ──────────────────────────────────────────────────────────────────────── */
/* Outgoing edges (high-cbo fixture)                                         */
/* ──────────────────────────────────────────────────────────────────────── */

describe('rules/cbo — outgoing edges (high-cbo fixture)', () => {
  it('OrderController outgoing list — 7 expected names, sorted and deduplicated', () => {
    const reports = runOn(
      classDecl('OrderController'),
      [{ max: 0, tsconfigPath: HIGH_CBO_TSCONFIG }],
      ORDER_CONTROLLER_PATH,
    );
    expect(reports).toHaveLength(1);
    const expected = [
      'AuditLogger',
      'EmailService',
      'InventoryService',
      'NotificationService',
      'OrderService',
      'PaymentService',
      'UserRepository',
    ];
    expect(reports[0]!.data!['outgoing']).toBe(expected.join(', '));
    expect(reports[0]!.data!['outgoingCount']).toBe(7);
  });

  it('OrderService — outgoing = 0 (no class references in its body)', () => {
    // Hold incoming threshold loose (max=1) so we isolate the outgoing assertion.
    // OrderService itself has incoming = 1 (from OrderController), so at max=1
    // CBO=1 stays silent and we use a separate assertion below to prove
    // outgoingCount === 0 via the breach flow.
    const reports = runOn(
      classDecl('OrderService'),
      [{ max: 1, tsconfigPath: HIGH_CBO_TSCONFIG }],
      ORDER_SERVICE_PATH,
    );
    expect(reports).toEqual([]);

    // Drop max to 0 to force a report; assert outgoingCount === 0 explicitly.
    const breach = runOn(
      classDecl('OrderService'),
      [{ max: 0, tsconfigPath: HIGH_CBO_TSCONFIG }],
      ORDER_SERVICE_PATH,
    );
    expect(breach).toHaveLength(1);
    expect(breach[0]!.data).toMatchObject({
      outgoingCount: 0,
      outgoing: '',
      incomingCount: 1,
    });
  });
});

/* ──────────────────────────────────────────────────────────────────────── */
/* Incoming edges (high-cbo fixture)                                         */
/* ──────────────────────────────────────────────────────────────────────── */

describe('rules/cbo — incoming edges (high-cbo fixture)', () => {
  it('OrderController incoming list — 5 expected referrers, sorted and deduplicated', () => {
    const reports = runOn(
      classDecl('OrderController'),
      [{ max: 0, tsconfigPath: HIGH_CBO_TSCONFIG }],
      ORDER_CONTROLLER_PATH,
    );
    expect(reports).toHaveLength(1);
    const expected = [
      'AdminPanel',
      'CheckoutFlow',
      'MetricsCollector',
      'OrderEndToEndTest',
      'OrderRouter',
    ];
    expect(reports[0]!.data!['incoming']).toBe(expected.join(', '));
    expect(reports[0]!.data!['incomingCount']).toBe(5);
  });

  it('OrderService — incoming = 1 (referenced only by OrderController)', () => {
    const reports = runOn(
      classDecl('OrderService'),
      [{ max: 0, tsconfigPath: HIGH_CBO_TSCONFIG }],
      ORDER_SERVICE_PATH,
    );
    expect(reports).toHaveLength(1);
    expect(reports[0]!.data).toMatchObject({
      cbo: 1,
      incomingCount: 1,
      incoming: 'OrderController',
      outgoingCount: 0,
    });
  });
});

/* ──────────────────────────────────────────────────────────────────────── */
/* Bidirectional CBO (E2E-007)                                               */
/* ──────────────────────────────────────────────────────────────────────── */

describe('rules/cbo — bidirectional total (E2E-007)', () => {
  it('OrderController CBO = 12 (7 outgoing + 5 incoming) — breaches at max=11', () => {
    const reports = runOn(
      classDecl('OrderController'),
      [{ max: 11, tsconfigPath: HIGH_CBO_TSCONFIG }],
      ORDER_CONTROLLER_PATH,
    );
    expect(reports).toHaveLength(1);
    expect(reports[0]!.data).toMatchObject({
      className: 'OrderController',
      cbo: 12,
      max: 11,
      outgoingCount: 7,
      incomingCount: 5,
    });
  });

  it('strict-greater-than threshold — equality (max=12) stays silent', () => {
    const reports = runOn(
      classDecl('OrderController'),
      [{ max: 12, tsconfigPath: HIGH_CBO_TSCONFIG }],
      ORDER_CONTROLLER_PATH,
    );
    expect(reports).toEqual([]);
  });

  it('emits the documented diagnostic message — both Outgoing and Incoming lines', () => {
    const reports = runOn(
      classDecl('OrderController'),
      [{ max: 10, tsconfigPath: HIGH_CBO_TSCONFIG }],
      ORDER_CONTROLLER_PATH,
    );
    expect(reports).toHaveLength(1);
    expect(reports[0]!.message).toBe(
      "Class 'OrderController' has CBO of 12 (max: 10).\n" +
        '  Outgoing (7): AuditLogger, EmailService, InventoryService, NotificationService, OrderService, PaymentService, UserRepository\n' +
        '  Incoming (5): AdminPanel, CheckoutFlow, MetricsCollector, OrderEndToEndTest, OrderRouter',
    );
  });

  it('attaches the class node as the diagnostic location', () => {
    const node = classDecl('OrderController');
    const reports = runOn(
      node,
      [{ max: 0, tsconfigPath: HIGH_CBO_TSCONFIG }],
      ORDER_CONTROLLER_PATH,
    );
    expect(reports[0]!.node).toBe(node);
  });
});

/* ──────────────────────────────────────────────────────────────────────── */
/* Low-cbo fixture                                                           */
/* ──────────────────────────────────────────────────────────────────────── */

describe('rules/cbo — low-cbo fixture', () => {
  it('SimpleClass — CBO = 0 (no incoming, no outgoing) silent at max=0', () => {
    const reports = runOn(
      classDecl('SimpleClass'),
      [{ max: 0, tsconfigPath: LOW_CBO_TSCONFIG }],
      SIMPLE_CLASS_PATH,
    );
    expect(reports).toEqual([]);
  });
});

/* ──────────────────────────────────────────────────────────────────────── */
/* Inheritance exclusion (E2E-008)                                           */
/* ──────────────────────────────────────────────────────────────────────── */

describe('rules/cbo — inheritance is excluded from both outgoing and incoming (E2E-008)', () => {
  it('Labrador extends Dog — Dog is NOT counted as outgoing (CBO=0)', () => {
    const reports = runOn(
      classDecl('Labrador'),
      [{ max: 0, tsconfigPath: DIT_CHAIN_TSCONFIG }],
      LABRADOR_PATH,
    );
    // Labrador has no class refs in its body; `extends Dog` is the only
    // edge and it must be excluded. No class references Labrador either, so
    // both outgoing = 0 and incoming = 0 → silent.
    expect(reports).toEqual([]);
  });

  it('Dog extends Mammal — Mammal NOT outgoing AND Labrador NOT incoming (CBO=0)', () => {
    // Dog's only outgoing edge is `extends Mammal` → excluded.
    // Dog's only incoming edge is `Labrador extends Dog` (heritage clause) → excluded.
    // → CBO = 0, silent at max=0.
    const reports = runOn(
      classDecl('Dog'),
      [{ max: 0, tsconfigPath: DIT_CHAIN_TSCONFIG }],
      DOG_PATH,
    );
    expect(reports).toEqual([]);
  });

  it('Implementer implements Named — interface heritage NOT counted (CBO=0)', () => {
    const reports = runOn(
      classDecl('Implementer'),
      [{ max: 0, tsconfigPath: DIT_SHALLOW_TSCONFIG }],
      IMPLEMENTER_PATH,
    );
    // `implements Named` is an interface heritage clause; outgoing = 0.
    expect(reports).toEqual([]);
  });
});

/* ──────────────────────────────────────────────────────────────────────── */
/* Visitor wiring                                                            */
/* ──────────────────────────────────────────────────────────────────────── */

describe('rules/cbo — visitor wiring', () => {
  it('returns visitors for both ClassDeclaration and ClassExpression', () => {
    const reports: CapturedReport[] = [];
    const context: RuleContext = {
      report: (d) => reports.push(d),
      getFilename: () => ORDER_CONTROLLER_PATH,
      options: [{ max: 0, tsconfigPath: HIGH_CBO_TSCONFIG }],
    };
    const visitors = cbo.create(context);
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
    const visitors = cbo.create(context);
    expect(typeof visitors.ClassDeclaration).toBe('function');
    expect(typeof visitors.ClassExpression).toBe('function');
    // Calling them must not throw.
    expect(() => visitors.ClassDeclaration?.(classDecl('Anything'))).not.toThrow();
  });
});
