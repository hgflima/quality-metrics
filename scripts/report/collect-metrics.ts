/**
 * Walk every `src/**\/*.ts` file, parse it to an ESTree-compatible AST, and
 * compute the five metrics for each class + every top-level function.
 *
 * Fast-tier (WMC, Halstead, LCOM) is computed from AST alone via the helpers
 * already used by the rules. Deep-tier (CBO, DIT) reuses the plugin's
 * `ProjectSingleton` so the same ts-morph Project is loaded once for all
 * files. When ts-morph is unavailable the deep fields stay `null` per
 * entity — the script still produces a useful report.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@typescript-eslint/typescript-estree';

import { computeWmc } from '../../src/utils/wmc-aggregate.js';
import { computeLcom } from '../../src/utils/lcom-aggregate.js';
import { computeHalstead } from '../../src/utils/halstead.js';
import { isClassLikeNode, getClassName, type ClassLikeNode } from '../../src/utils/ast-shared.js';
import { getProjectSingleton } from '../../src/project-singleton.js';
import { findTsMorphClass } from '../../src/utils/ts-morph-rule.js';
import { collectOutgoingClasses, collectIncomingClasses } from '../../src/utils/cbo-graph.js';
import { computeDit } from '../../src/utils/dit-chain.js';
import { getFunctionName } from '../../src/utils/ast-shared.js';

import type { ClassEntity, FunctionEntity, FileReport } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(__filename, '../../..');
const SRC_DIR = join(REPO_ROOT, 'src');

interface RawEntity {
  classes: ClassEntity[];
  functions: FunctionEntity[];
}

export interface CollectOptions {
  /** When true, deep-tier (CBO/DIT) is skipped — useful for fast smoke runs. */
  fastOnly?: boolean;
}

export function collectAll(options: CollectOptions = {}): FileReport[] {
  const files = listSourceFiles();

  const singleton = options.fastOnly ? null : getProjectSingleton(undefined);
  const tsmAvailable = singleton?.isAvailable === true;
  if (singleton && tsmAvailable) {
    // Eagerly add every src file so cross-file references resolve in CBO.
    for (const f of files) singleton.project.addSourceFileAtPathIfExists(f);
  }

  const reports: FileReport[] = [];
  for (const filePath of files) {
    const source = readFileSync(filePath, 'utf8');
    const ast = parseSource(source, filePath);
    if (!ast) continue;

    const { classes, functions } = walkProgram(ast, filePath);

    if (tsmAvailable && singleton) {
      for (const cls of classes) {
        const tsmClass = findTsMorphClass(singleton.project, filePath, cls.name);
        if (!tsmClass) continue;
        const outgoing = collectOutgoingClasses(tsmClass);
        const incoming = collectIncomingClasses(tsmClass);
        const { dit, chain } = computeDit(tsmClass);
        cls.cbo = {
          value: outgoing.size + incoming.size,
          outgoing: [...outgoing].sort(),
          incoming: [...incoming].sort(),
        };
        cls.dit = { value: dit, chain };
      }
    }

    reports.push({
      path: relative(REPO_ROOT, filePath),
      coverage: null,
      classes,
      functions,
    });
  }

  return reports;
}

function listSourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (st.isFile() && full.endsWith('.ts') && !full.endsWith('.d.ts')) out.push(full);
    }
  };
  walk(SRC_DIR);
  return out.sort();
}

function parseSource(source: string, filePath: string): unknown {
  try {
    return parse(source, {
      jsx: false,
      loc: true,
      range: true,
      // Preserve `parent` so `getFunctionName` can resolve names from the
      // enclosing VariableDeclarator / Property / etc.
      // typescript-estree does not set parent by default — we walk it ourselves.
    });
  } catch (err) {
    console.warn(`[report] failed to parse ${filePath}: ${describe(err)}`);
    return null;
  }
}

interface AstNode {
  type: string;
  loc?: { start: { line: number }; end: { line: number } };
  parent?: AstNode;
  [key: string]: unknown;
}

function walkProgram(program: unknown, filePath: string): RawEntity {
  const classes: ClassEntity[] = [];
  const functions: FunctionEntity[] = [];

  const setParents = (node: AstNode, parent: AstNode | undefined): void => {
    node.parent = parent;
    for (const key of Object.keys(node)) {
      if (key === 'parent' || key === 'loc' || key === 'range') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item === 'object' && 'type' in item) {
            setParents(item as AstNode, node);
          }
        }
      } else if (child && typeof child === 'object' && 'type' in (child as object)) {
        setParents(child as AstNode, node);
      }
    }
  };

  const root = program as AstNode;
  setParents(root, undefined);

  const body = root['body'];
  if (!Array.isArray(body)) return { classes, functions };

  const visit = (node: AstNode, isTopLevel: boolean): void => {
    if (isClassLikeNode(node)) {
      const name = getClassName(node as unknown as ClassLikeNode) ?? '<anonymous>';
      const { wmc, methods } = computeWmc(node as unknown as ClassLikeNode);
      const { lcom, pairs, unrelated } = computeLcom(node as unknown as ClassLikeNode);
      classes.push({
        name,
        filePath,
        loc: locOf(node),
        wmc: { value: wmc, methods },
        lcom: {
          value: lcom,
          pairs,
          unrelated: unrelated.map(([a, b]) => [a, b] as [string, string]),
        },
        cbo: null,
        dit: null,
        coverage: null,
      });
      // Don't descend into class bodies for top-level function collection —
      // methods are accounted for by WMC/LCOM, not as separate functions.
      return;
    }

    if (
      isTopLevel &&
      (node.type === 'FunctionDeclaration' ||
        node.type === 'VariableDeclaration' ||
        node.type === 'ExportNamedDeclaration' ||
        node.type === 'ExportDefaultDeclaration')
    ) {
      const fns = extractTopLevelFunctions(node);
      for (const fn of fns) {
        const metrics = computeHalstead(fn);
        functions.push({
          name: getFunctionName(fn as never),
          filePath,
          loc: locOf(fn),
          halstead: {
            volume: round(metrics.volume),
            effort: round(metrics.effort),
            difficulty: round1(metrics.difficulty),
          },
          coverage: null,
        });
      }
    }
  };

  for (const stmt of body) {
    if (stmt && typeof stmt === 'object' && 'type' in stmt) {
      visit(stmt as AstNode, true);
    }
  }

  return { classes, functions };
}

const FUNCTION_LIKE = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

function extractTopLevelFunctions(node: AstNode): AstNode[] {
  const out: AstNode[] = [];

  if (node.type === 'FunctionDeclaration') {
    out.push(node);
    return out;
  }

  if (node.type === 'VariableDeclaration') {
    const decls = node['declarations'];
    if (Array.isArray(decls)) {
      for (const d of decls) {
        const init = (d as AstNode)['init'];
        if (init && typeof init === 'object' && 'type' in init) {
          const initNode = init as AstNode;
          if (FUNCTION_LIKE.has(initNode.type)) out.push(initNode);
        }
      }
    }
    return out;
  }

  if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration') {
    const decl = node['declaration'];
    if (decl && typeof decl === 'object' && 'type' in decl) {
      out.push(...extractTopLevelFunctions(decl as AstNode));
    }
  }

  return out;
}

function locOf(node: AstNode): { start: number; end: number } {
  if (node.loc) {
    return { start: node.loc.start.line, end: node.loc.end.line };
  }
  return { start: 0, end: 0 };
}

function round(n: number): number {
  return Math.round(n);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
