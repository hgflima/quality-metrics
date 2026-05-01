# Halstead Counting Model (locked for fixtures)

This document defines the exact token-classification model used to derive the
hand-computed reference values in the Halstead fixture files. The
`quality-metrics/halstead` rule (TASK-011/TASK-014) MUST implement this model
so that test assertions in `tests/rules/halstead.test.ts` match.

## Operators (η₁, N₁)

A token is an **operator** if it falls into one of the following groups:

1. **Reserved keywords** that direct flow or declaration:
   `function`, `return`, `if`, `else`, `for`, `while`, `do`, `switch`, `case`,
   `default`, `break`, `continue`, `throw`, `new`, `typeof`, `delete`,
   `instanceof`, `in`, `of`, `try`, `catch`, `finally`, `const`, `let`, `var`,
   `class`, `extends`, `this`, `super`, `yield`, `await`, `void`.
2. **Binary, unary, assignment, and logical operators** (token form):
   `+`, `-`, `*`, `/`, `%`, `**`,
   `=`, `+=`, `-=`, `*=`, `/=`, `%=`, `**=`, `&&=`, `||=`, `??=`,
   `==`, `===`, `!=`, `!==`,
   `<`, `>`, `<=`, `>=`,
   `&&`, `||`, `??`, `!`,
   `++`, `--`,
   `&`, `|`, `^`, `~`, `<<`, `>>`, `>>>`,
   `?`, `:` (only in ternary; see exclusions),
   `=>`,
   `?.`.
3. **Member access**: `.` (each property access expression contributes one
   `.` operator).

## Operands (η₂, N₂)

A token is an **operand** if it is:

1. An **identifier** (variable name, function name, parameter, property name in
   a member expression). Object-literal _shorthand_ properties (`{ foo }`)
   contribute the identifier exactly once.
2. A **literal**: numeric, string, template-string raw value, boolean (`true`,
   `false`), `null`, `undefined`. Each distinct literal value counts once
   toward η₂; each occurrence counts toward N₂.

## Excluded from both counts

The following tokens are **ignored** by the rule (they affect neither η nor N):

- Grouping/delimiters: `(`, `)`, `{`, `}`, `[`, `]`, `,`, `;`.
- The `:` token when used as object-literal property separator, function
  return-type annotation, or labeled-statement marker (the ternary `:` IS
  counted, see operators above).
- TypeScript type annotations and type-only constructs (`as`, `satisfies`,
  type parameters `<T>`, type aliases, interface declarations). The metric
  is computed at the JavaScript-emit level.
- Comments and whitespace.

## Formulas

```
η  = η₁ + η₂           (vocabulary)
N  = N₁ + N₂           (length)
V  = N · log₂(η)       (volume, in bits)
D  = (η₁ / 2) · (N₂ / η₂)   (difficulty)
E  = D · V             (effort)
```

When `η₂ === 0` the rule returns `D = 0`, `E = 0` (degenerate case for
operand-free fragments such as an empty function body).

---

## Worked example — `simple-fn.ts`

```ts
function add(a: number, b: number): number {
  return a + b;
}
```

Tokens (types stripped):

| Token       | Class    |
| ----------- | -------- |
| `function`  | operator |
| `add`       | operand  |
| `a` (param) | operand  |
| `b` (param) | operand  |
| `return`    | operator |
| `a`         | operand  |
| `+`         | operator |
| `b`         | operand  |

- η₁ = 3 (`function`, `return`, `+`); N₁ = 3
- η₂ = 3 (`add`, `a`, `b`); N₂ = 5 (`add`×1, `a`×2, `b`×2)
- η = 6, N = 8
- V = 8 · log₂(6) ≈ 20.68
- D = (3/2) · (5/3) ≈ 2.50
- E = D · V ≈ 51.71
