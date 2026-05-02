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
import { getFunctionName, isAstNode } from '../utils/ast-shared.js';
import type { HalsteadOptions, RuleContext } from '../types.js';

const DEFAULT_MAX_VOLUME = 1000;
const DEFAULT_MAX_EFFORT = 400;

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
