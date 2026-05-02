/**
 * Halstead Volume / Effort rule.
 *
 * For every function-like node (`FunctionDeclaration`, `FunctionExpression`,
 * `ArrowFunctionExpression`) the rule computes the function's Halstead
 * metrics via `computeHalstead`. If the resulting Volume exceeds
 * `options.maxVolume` OR the resulting Effort exceeds `options.maxEffort`,
 * a single diagnostic is emitted on the function node.
 *
 * Definition (Halstead, 1977):
 * V = N · log₂(η)
 * D = (η₁ / 2) · (N₂ / η₂)
 * E = D · V
 *
 * Each function is measured in isolation — the helper stops at nested
 * function-like boundaries so an outer function's measurement never includes
 * tokens from a nested arrow / function inside it. The visitor still fires
 * separately on each nested function, so each gets its own report.
 *
 * Diagnostic format (per docs/mvp/03-technical-architecture.md):
 * "Function 'processOrder' exceeds Halstead thresholds.
 * Volume: 1240 (max: 1000) | Effort: 520 (max: 400) | Difficulty: 18.4"
 */

import { computeHalstead } from '../utils/halstead.js';
import { getMethodName, isAstNode, type AstNode } from '../utils/ast-shared.js';
import type { HalsteadOptions, RuleContext } from '../types.js';

const DEFAULT_MAX_VOLUME = 1000;
const DEFAULT_MAX_EFFORT = 400;

/**
 * Resolve a human-readable name for a function-like node.
 *
 * Preference order:
 *
 * 1. The function's own `id` (named FunctionDeclaration / FunctionExpression).
 * 2. The enclosing binding context exposed via `node.parent` (set by the ESLint / OXLint traversal):
 *
 *    - `VariableDeclarator` with an `Identifier` id
 *    - `AssignmentExpression` to an `Identifier` or `MemberExpression`
 *    - `MethodDefinition` / `PropertyDefinition` / `Property` / `ObjectProperty`
 * 3. `<anonymous>` as a final fallback.
 */
export function getFunctionName(node: AstNode): string {
  const ownId = node['id'];
  if (isAstNode(ownId) && ownId.type === 'Identifier' && typeof ownId['name'] === 'string') {
    return ownId['name'];
  }

  const parent = node['parent'];
  if (!isAstNode(parent)) return '<anonymous>';

  switch (parent.type) {
    case 'VariableDeclarator': {
      const idNode = parent['id'];
      if (isAstNode(idNode) && idNode.type === 'Identifier' && typeof idNode['name'] === 'string') {
        return idNode['name'];
      }
      return '<anonymous>';
    }
    case 'AssignmentExpression': {
      const left = parent['left'];
      if (isAstNode(left)) {
        if (left.type === 'Identifier' && typeof left['name'] === 'string') {
          return left['name'];
        }
        if (left.type === 'MemberExpression') {
          const prop = left['property'];
          if (isAstNode(prop) && prop.type === 'Identifier' && typeof prop['name'] === 'string') {
            return prop['name'];
          }
        }
      }
      return '<anonymous>';
    }
    case 'MethodDefinition':
    case 'PropertyDefinition':
    case 'Property':
    case 'ObjectProperty':
      return getMethodName(parent['key'], Boolean(parent['computed']));
    default:
      return '<anonymous>';
  }
}

function roundInt(n: number): number {
  return Math.round(n);
}

function roundOneDecimal(n: number): number {
  return Math.round(n * 10) / 10;
}

export const halstead = {
  meta: {
    type: 'suggestion' as const,
    docs: {
      description:
        'enforce maximum Halstead Volume and Effort per function — flag functions that exceed either threshold',
    },
    schema: [
      {
        type: 'object',
        properties: {
          maxVolume: { type: 'number', minimum: 0 },
          maxEffort: { type: 'number', minimum: 0 },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      tooHigh:
        "Function '{{functionName}}' exceeds Halstead thresholds.\n  Volume: {{volume}} (max: {{maxVolume}}) | Effort: {{effort}} (max: {{maxEffort}}) | Difficulty: {{difficulty}}",
    },
  },
  create(context: RuleContext) {
    const userOptions = context.options[0];
    const options: HalsteadOptions =
      userOptions != null && typeof userOptions === 'object'
        ? {
            maxVolume: DEFAULT_MAX_VOLUME,
            maxEffort: DEFAULT_MAX_EFFORT,
            ...(userOptions as Partial<HalsteadOptions>),
          }
        : { maxVolume: DEFAULT_MAX_VOLUME, maxEffort: DEFAULT_MAX_EFFORT };

    const check = (node: unknown): void => {
      if (!isAstNode(node)) return;

      const metrics = computeHalstead(node);
      const volumeExceeded = metrics.volume > options.maxVolume;
      const effortExceeded = metrics.effort > options.maxEffort;
      if (!volumeExceeded && !effortExceeded) return;

      const functionName = getFunctionName(node);
      const volume = roundInt(metrics.volume);
      const effort = roundInt(metrics.effort);
      const difficulty = roundOneDecimal(metrics.difficulty);

      context.report({
        node,
        message: `Function '${functionName}' exceeds Halstead thresholds.\n  Volume: ${volume} (max: ${options.maxVolume}) | Effort: ${effort} (max: ${options.maxEffort}) | Difficulty: ${difficulty}`,
        data: {
          functionName,
          volume,
          effort,
          difficulty,
          maxVolume: options.maxVolume,
          maxEffort: options.maxEffort,
        },
      });
    };

    return {
      FunctionDeclaration: check,
      FunctionExpression: check,
      ArrowFunctionExpression: check,
    };
  },
};

export default halstead;
