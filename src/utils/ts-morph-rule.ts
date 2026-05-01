/**
 * Shared wiring for deep-tier (ts-morph backed) class rules.
 *
 * `cbo` and `dit` both:
 * 1. acquire the project singleton (no-op when ts-morph is unavailable),
 * 2. read the linted file path from the rule context (v8/v9 fallback),
 * 3. resolve the named class in the ts-morph project,
 * 4. run a per-rule analysis and possibly report.
 *
 * `createDeepClassVisitor` factors out steps 1–3 so each rule's `create` body
 * is just its analysis logic.
 */

import { getProjectSingleton } from '../project-singleton.js';
import { getClassName, isClassLikeNode, type ClassLikeNode } from './ast-shared.js';
import type { RuleContext } from '../types.js';
import type { ClassDeclaration as TsMorphClassDeclaration, Project } from 'ts-morph';

/**
 * Resolve a class declaration in a ts-morph project by file path + class name.
 * Returns `null` when the file is not in the project or the class is not found.
 */
export function findTsMorphClass(
  project: Project,
  filePath: string,
  className: string,
): TsMorphClassDeclaration | null {
  const sf = project.getSourceFile(filePath);
  if (!sf) return null;
  return sf.getClass(className) ?? null;
}

/**
 * Read the linted file path from the rule context.
 * ESLint v9+ exposes `context.filename` (property); legacy v8 exposes
 * `getFilename()`. OXLint matches the v9+ shape. Read both so deep-tier rules
 * work under any host runtime.
 */
export function getFilename(context: RuleContext): string {
  return context.filename ?? context.getFilename?.() ?? '';
}

export interface ClassVisitor {
  ClassDeclaration: (node: unknown) => void;
  ClassExpression: (node: unknown) => void;
}

interface AnalyzeArgs {
  classNode: ClassLikeNode;
  className: string;
  tsmClass: TsMorphClassDeclaration;
}

const NOOP_VISITOR: ClassVisitor = {
  ClassDeclaration: () => {},
  ClassExpression: () => {},
};

/**
 * Build the AST visitor shared by deep-tier class rules. Returns a no-op
 * visitor when ts-morph is unavailable or no filename is in scope (e.g. virtual
 * input). Otherwise narrows each visited node to a named class declaration,
 * resolves it in the ts-morph project, and hands it to `analyze`.
 */
export function createDeepClassVisitor(
  context: RuleContext,
  tsconfigPath: string | undefined,
  analyze: (args: AnalyzeArgs) => void,
): ClassVisitor {
  const singleton = getProjectSingleton(tsconfigPath);
  if (!singleton.isAvailable) return NOOP_VISITOR;

  const filename = getFilename(context);
  if (!filename) return NOOP_VISITOR;

  const project = singleton.project;

  const check = (node: unknown): void => {
    if (!isClassLikeNode(node)) return;
    const className = getClassName(node);
    if (!className) return;
    const tsmClass = findTsMorphClass(project, filename, className);
    if (!tsmClass) return;
    analyze({ classNode: node, className, tsmClass });
  };

  return { ClassDeclaration: check, ClassExpression: check };
}
