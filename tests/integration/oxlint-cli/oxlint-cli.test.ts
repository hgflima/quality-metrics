import { describe, it, expect } from 'vitest';
import { diagnosticsForRule, runOxlint } from './helpers.js';

const FAST = 'tests/integration/oxlint-cli/oxlint.fast.test.json';
const DEEP = 'tests/integration/oxlint-cli/oxlint.deep.test.json';

describe('oxlint CLI × quality-metrics — fast tier', () => {
  it('FT-1: WMC fires on high-wmc.ts (WMC=17 > max 15)', async () => {
    const r = await runOxlint(FAST, 'tests/fixtures/wmc/high-wmc.ts');
    expect(r.exitCode).not.toBe(0);
    const wmc = diagnosticsForRule(r.diagnostics, 'wmc');
    expect(wmc).toHaveLength(1);
    expect(wmc[0].message).toMatch(/Class 'OrderService' has WMC of 17 \(max: 15\)/);
    expect(wmc[0].message).toMatch(/validate\(CC=3\)/);
  });

  it('FT-2: WMC silent on low-wmc.ts (WMC=4)', async () => {
    const r = await runOxlint(FAST, 'tests/fixtures/wmc/low-wmc.ts');
    const wmc = diagnosticsForRule(r.diagnostics, 'wmc');
    expect(wmc).toHaveLength(0);
  });

  it('FT-3: Halstead fires on complex-fn.ts (E≈8783 > 100)', async () => {
    const r = await runOxlint(FAST, 'tests/fixtures/halstead/complex-fn.ts');
    expect(r.exitCode).not.toBe(0);
    const h = diagnosticsForRule(r.diagnostics, 'halstead');
    expect(h.length).toBeGreaterThanOrEqual(1);
    const processPayment = h.find((d) => d.message.includes("Function 'processPayment'"));
    expect(processPayment).toBeDefined();
    expect(processPayment!.message).toMatch(/Effort: \d+/);
    expect(processPayment!.message).toMatch(/Volume: \d+/);
  });

  it('FT-4: Halstead silent on simple-fn.ts (E≈51.7 < 100, V≈20.7 < 200)', async () => {
    const r = await runOxlint(FAST, 'tests/fixtures/halstead/simple-fn.ts');
    const h = diagnosticsForRule(r.diagnostics, 'halstead');
    expect(h).toHaveLength(0);
  });

  it('FT-5: LCOM fires on low-cohesion.ts (LCOM=3 > 0)', async () => {
    const r = await runOxlint(FAST, 'tests/fixtures/lcom/low-cohesion.ts');
    expect(r.exitCode).not.toBe(0);
    const lcom = diagnosticsForRule(r.diagnostics, 'lcom');
    expect(lcom).toHaveLength(1);
    expect(lcom[0].message).toMatch(/Class 'MixedService' has LCOM of 3 \(max: 0\)/);
    expect(lcom[0].message).toMatch(/\(saveUser, sendWelcome\)/);
    expect(lcom[0].message).toMatch(/\(saveUser, invalidateSession\)/);
    expect(lcom[0].message).toMatch(/\(sendWelcome, invalidateSession\)/);
  });

  it('FT-6: LCOM silent on high-cohesion.ts (LCOM=0)', async () => {
    const r = await runOxlint(FAST, 'tests/fixtures/lcom/high-cohesion.ts');
    const lcom = diagnosticsForRule(r.diagnostics, 'lcom');
    expect(lcom).toHaveLength(0);
  });
});

describe('oxlint CLI × quality-metrics — deep tier', () => {
  it('DT-1: CBO fires on OrderController.ts (12 > 10, bidirectional)', async () => {
    const r = await runOxlint(DEEP, 'tests/fixtures/cbo/high-cbo/OrderController.ts');
    expect(r.exitCode).not.toBe(0);
    const cbo = diagnosticsForRule(r.diagnostics, 'cbo');
    expect(cbo).toHaveLength(1);
    expect(cbo[0].message).toMatch(/Class 'OrderController' has CBO of 12 \(max: 10\)/);
    expect(cbo[0].message).toMatch(/Outgoing \(7\):/);
    expect(cbo[0].message).toMatch(/Incoming \(5\):/);
  });

  it('DT-2: CBO silent on low-cbo/SimpleClass.ts', async () => {
    const r = await runOxlint(DEEP, 'tests/fixtures/cbo/low-cbo/SimpleClass.ts');
    const cbo = diagnosticsForRule(r.diagnostics, 'cbo');
    expect(cbo).toHaveLength(0);
  });

  it('DT-3: DIT fires on Labrador.ts (DIT=4 > 3, cross-file chain)', async () => {
    const r = await runOxlint(DEEP, 'tests/fixtures/dit/chain/Labrador.ts');
    expect(r.exitCode).not.toBe(0);
    const dit = diagnosticsForRule(r.diagnostics, 'dit');
    expect(dit).toHaveLength(1);
    expect(dit[0].message).toMatch(/Class 'Labrador' has DIT of 4 \(max: 3\)/);
    expect(dit[0].message).toMatch(/Chain: Labrador → Dog → Mammal → Animal → LivingThing/);
  });
});

describe('oxlint CLI × quality-metrics — cross-tier separation (MIX-1)', () => {
  const target = 'tests/integration/oxlint-cli/fixtures/all-violations.ts';

  it('fast tier emits only wmc/halstead/lcom on MIX-1', async () => {
    const r = await runOxlint(FAST, target);
    expect(r.exitCode).not.toBe(0);

    expect(diagnosticsForRule(r.diagnostics, 'wmc').length).toBeGreaterThanOrEqual(1);
    expect(diagnosticsForRule(r.diagnostics, 'lcom').length).toBeGreaterThanOrEqual(1);
    expect(diagnosticsForRule(r.diagnostics, 'halstead').length).toBeGreaterThanOrEqual(1);

    expect(diagnosticsForRule(r.diagnostics, 'cbo')).toHaveLength(0);
    expect(diagnosticsForRule(r.diagnostics, 'dit')).toHaveLength(0);
  });

  it('deep tier emits only cbo + dit on MIX-1 (never wmc/halstead/lcom)', async () => {
    const r = await runOxlint(DEEP, target);
    expect(r.exitCode).not.toBe(0);

    const cbo = diagnosticsForRule(r.diagnostics, 'cbo');
    expect(cbo).toHaveLength(1);
    expect(cbo[0].message).toMatch(/Class 'MixedClass' has CBO of 11 \(max: 10\)/);

    const dit = diagnosticsForRule(r.diagnostics, 'dit');
    expect(dit).toHaveLength(1);
    expect(dit[0].message).toMatch(/Class 'Level5' has DIT of 4/);

    expect(diagnosticsForRule(r.diagnostics, 'wmc')).toHaveLength(0);
    expect(diagnosticsForRule(r.diagnostics, 'halstead')).toHaveLength(0);
    expect(diagnosticsForRule(r.diagnostics, 'lcom')).toHaveLength(0);
  });
});
