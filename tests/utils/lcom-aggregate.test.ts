import { describe, it, expect } from 'vitest';
import { computeLcom } from '../../src/utils/lcom-aggregate';
import type { ClassLikeNode } from '../../src/utils/ast-shared';

/* ──────────────────────────────────────────────────────────────────────── */
/* AST construction helpers — ESTree-shaped nodes for the cases under test. */
/* ──────────────────────────────────────────────────────────────────────── */

const id = (name: string) => ({ type: 'Identifier', name });
const lit = (value: unknown) => ({ type: 'Literal', value });
const block = (...body: unknown[]) => ({ type: 'BlockStatement', body });
const thisExpr = () => ({ type: 'ThisExpression' });

const thisDot = (prop: string) => ({
  type: 'MemberExpression',
  object: thisExpr(),
  property: id(prop),
  computed: false,
  optional: false,
});

const exprStmt = (expression: unknown) => ({
  type: 'ExpressionStatement',
  expression,
});

function fnExpr(...body: unknown[]): unknown {
  return {
    type: 'FunctionExpression',
    params: [],
    body: block(...body),
  };
}

function methodDef(
  key: unknown,
  value: unknown,
  opts: { kind?: string; computed?: boolean; static?: boolean } = {},
): unknown {
  return {
    type: 'MethodDefinition',
    key,
    value,
    kind: opts.kind ?? 'method',
    computed: opts.computed ?? false,
    static: opts.static ?? false,
  };
}

function classDecl(name: string | null, ...members: unknown[]): ClassLikeNode {
  return {
    type: 'ClassDeclaration',
    id: name == null ? null : id(name),
    superClass: null,
    body: { type: 'ClassBody', body: members },
  } as unknown as ClassLikeNode;
}

/** Method whose body touches each of the named `this.X` properties (one stmt per prop). */
function methodAccessing(name: string, ...props: string[]): unknown {
  const body = props.map((p) => exprStmt(thisDot(p)));
  return methodDef(id(name), fnExpr(...body));
}

/* ──────────────────────────────────────────────────────────────────────── */
/*                                  Tests                                   */
/* ──────────────────────────────────────────────────────────────────────── */

describe('computeLcom', () => {
  it('returns zero result for an empty class (early return at methods.length < 2)', () => {
    expect(computeLcom(classDecl('Empty'))).toEqual({
      lcom: 0,
      pairs: { same: 0, different: 0 },
      unrelated: [],
    });
  });

  it('returns zero result for a class with a single method (same early return)', () => {
    const node = classDecl('Greeter', methodAccessing('greet', 'name'));
    expect(computeLcom(node)).toEqual({
      lcom: 0,
      pairs: { same: 0, different: 0 },
      unrelated: [],
    });
  });

  it('counts a fully-cohesive pair as `same` (lcom=0, no unrelated)', () => {
    const node = classDecl(
      'Counter',
      methodAccessing('inc', 'count'),
      methodAccessing('reset', 'count'),
    );
    expect(computeLcom(node)).toEqual({
      lcom: 0,
      pairs: { same: 1, different: 0 },
      unrelated: [],
    });
  });

  it('counts a disjoint pair as `different` and lists it in `unrelated`', () => {
    const node = classDecl('Mixed', methodAccessing('a', 'x'), methodAccessing('b', 'y'));
    expect(computeLcom(node)).toEqual({
      lcom: 1,
      pairs: { same: 0, different: 1 },
      unrelated: [['a', 'b']],
    });
  });

  it('preserves declaration order in `unrelated` across three methods (1 same, 2 different)', () => {
    // a:{x}, b:{x}, c:{y}
    // pairs: (a,b)=same, (a,c)=different, (b,c)=different
    // lcom = max(2 - 1, 0) = 1
    const node = classDecl(
      'Three',
      methodAccessing('a', 'x'),
      methodAccessing('b', 'x'),
      methodAccessing('c', 'y'),
    );
    expect(computeLcom(node)).toEqual({
      lcom: 1,
      pairs: { same: 1, different: 2 },
      unrelated: [
        ['a', 'c'],
        ['b', 'c'],
      ],
    });
  });

  it('clamps lcom to zero when same > different (high-cohesion branch)', () => {
    // a:{x}, b:{x}, c:{x}, d:{y}
    // pairs: (a,b)=same, (a,c)=same, (b,c)=same, (a,d)=diff, (b,d)=diff, (c,d)=diff
    // same=3, different=3 → lcom=0; flip one extra share → same=4 different=2 → still 0.
    const node = classDecl(
      'Cohesive',
      methodAccessing('a', 'x'),
      methodAccessing('b', 'x'),
      methodAccessing('c', 'x'),
      methodAccessing('d', 'y'),
    );
    const result = computeLcom(node);
    expect(result.lcom).toBe(0); // Math.max(3 - 3, 0) → 0
    expect(result.pairs).toEqual({ same: 3, different: 3 });
    expect(result.unrelated).toEqual([
      ['a', 'd'],
      ['b', 'd'],
      ['c', 'd'],
    ]);
  });

  it('integrates with getMethodName for getter / setter / static / computed-literal keys', () => {
    // getter `getX` reads `this.x`; setter `setX` writes `this.x` (still a `this.x` access);
    // static `s` reads `this.y`; computed literal `'z'` reads `this.x`.
    // All four touch some `this.X`. (getX,setX)=same x; (getX,'z')=same x; (setX,'z')=same x;
    // s shares nothing → 3 different pairs against s.
    const node = classDecl(
      'Mix',
      methodDef(id('getX'), fnExpr(exprStmt(thisDot('x'))), { kind: 'get' }),
      methodDef(id('setX'), fnExpr(exprStmt(thisDot('x'))), { kind: 'set' }),
      methodDef(id('s'), fnExpr(exprStmt(thisDot('y'))), { static: true }),
      methodDef(lit('z'), fnExpr(exprStmt(thisDot('x'))), { computed: true }),
    );
    const result = computeLcom(node);
    expect(result.pairs).toEqual({ same: 3, different: 3 });
    // getMethodName resolves getX/setX/s by Identifier; 'z' via Literal value.
    expect(result.unrelated).toEqual([
      ['getX', 's'],
      ['setX', 's'],
      ['s', 'z'],
    ]);
  });
});
