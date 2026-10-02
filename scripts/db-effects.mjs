/**
 * 查询层（backend/db/queries/）每个导出会不会访问数据库、是读还是写，供 check-perf-shape / check-architecture 使用
 *
 * 直接用到 db 模块、调用 prepare/exec/transaction/pragma，或调用了会访问数据库的本地函数 / 其他查询文件的导出，
 * 都算访问；SQL 文本以 SELECT 开头算读，INSERT / UPDATE / DELETE 等算写，认不出的一律算读写都有。
 */

import path from 'node:path';
import { patternNames, stringValue, walk } from './guard-common.mjs';

export const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
export const QUERY_DIR = 'backend/db/queries/';
const DB_MODULE = 'backend/db/index.js';
const DB_METHODS = new Set(['prepare', 'exec', 'transaction', 'pragma']);

export const isMethodCall = (node, names) => node?.type === 'CallExpression'
  && node.callee.type === 'MemberExpression' && !node.callee.computed && names.has(node.callee.property.name);

// 文件里由 .prepare(...) 得到的 Statement 变量名
export function statementNames(tree) {
  const names = new Set();
  for (const [node] of walk(tree)) {
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier'
        && isMethodCall(node.init, new Set(['prepare']))) names.add(node.id.name);
  }
  return names;
}

export function importTarget(file, node) {
  if (node.type !== 'ImportDeclaration' || !node.source.value.startsWith('.')) return null;
  const target = path.posix.join(path.posix.dirname(file.rel), node.source.value);
  return target.endsWith('.js') ? target : `${target}.js`;
}

export function sqlText(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral') return node.quasis.map((q) => q.value.cooked ?? '').join(' ${} ');
  return null;
}

// ─── 查询层里哪些导出真的访问数据库 ──────────────────────────────────────────
// 返回 Map<查询文件, Set<会访问数据库的导出名>>。直接用到 db 模块、调用 prepare/exec/transaction，
// 或调用了会访问数据库的本地函数 / 其他查询文件的导出，都算访问；认不出形状的导出一律算访问。
function queryShape(file) {
  const imports = new Map();
  const namespaces = new Map();
  const dbLocals = new Set();
  const locals = new Map();
  const exported = new Map();
  for (const node of file.tree.body) {
    const target = importTarget(file, node);
    if (target) {
      for (const spec of node.specifiers) {
        if (target === DB_MODULE) dbLocals.add(spec.local.name);
        else if (target.startsWith(QUERY_DIR)) {
          if (spec.type === 'ImportNamespaceSpecifier') namespaces.set(spec.local.name, { target });
          else imports.set(spec.local.name, { target, name: spec.imported?.name ?? 'default' });
        }
      }
    }
    const decl = node.type === 'ExportNamedDeclaration' ? node.declaration : node;
    if (decl?.type === 'FunctionDeclaration') {
      locals.set(decl.id.name, decl);
      if (decl !== node) exported.set(decl.id.name, decl.id.name);
    } else if (decl?.type === 'VariableDeclaration') {
      for (const d of decl.declarations) {
        const fn = FUNCTION_TYPES.has(d.init?.type) ? d.init : null;
        for (const name of patternNames(d.id)) {
          locals.set(name, fn);
          if (decl !== node) exported.set(name, name);
        }
      }
    }
    if (node.type === 'ExportNamedDeclaration' && !node.declaration) {
      for (const spec of node.specifiers) {
        const local = spec.local.name;
        if (node.source) imports.set(`#reexport:${spec.exported.name}`, { target: importTarget(file, node), name: local });
        exported.set(spec.exported.name, node.source ? `#reexport:${spec.exported.name}` : local);
      }
    } else if (node.type === 'ExportDefaultDeclaration') {
      const decl = node.declaration;
      const local = decl.id?.name ?? (decl.type === 'Identifier' ? decl.name : '#default');
      if (FUNCTION_TYPES.has(decl.type)) locals.set(local, decl);
      else if (!locals.has(local)) locals.set(local, null);
      exported.set('default', local);
    }
  }
  return { imports, namespaces, dbLocals, locals, exported, statements: statementNames(file.tree) };
}

const DB_READ = 'db-read';
export const DB_WRITE = 'db-write';
const ALL_DB_EFFECTS = new Set([DB_READ, DB_WRITE]);

function sqlEffects(node) {
  const text = sqlText(node);
  if (text === null) return new Set(ALL_DB_EFFECTS);
  if (/^\s*(SELECT|EXPLAIN)\b/i.test(text)) return new Set([DB_READ]);
  if (/^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|VACUUM|ATTACH|DETACH)\b/i.test(text)) {
    return new Set([DB_WRITE]);
  }
  return new Set(ALL_DB_EFFECTS);
}

function directEffects(fnNode, shape) {
  const effects = new Set();
  const nodes = [...walk(fnNode)];
  const parents = new Map(nodes.map(([node, parent]) => [node, parent]));
  // prepare(...) 直接接 .get / .all / .run 时由外层调用定读写（better-sqlite3 对不返回数据的语句调 get / all 会报错），
  // 这些 prepare 不再按 SQL 文本另算
  const consumedPrepares = new Set(nodes.map(([node]) => node)
    .filter((node) => isMethodCall(node, new Set(['get', 'all', 'run'])) && isMethodCall(node.callee.object, new Set(['prepare'])))
    .map((node) => node.callee.object));
  for (const [node, parent] of nodes) {
    if (node.type === 'Identifier' && shape.dbLocals.has(node.name)) {
      const call = parent?.type === 'MemberExpression' && parent.object === node ? parents.get(parent) : null;
      const isDatabaseCall = call?.type === 'CallExpression' && call.callee === parent;
      if (!isDatabaseCall) ALL_DB_EFFECTS.forEach((effect) => effects.add(effect));
    }
    if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression') continue;
    const { object, property } = node.callee;
    const method = node.callee.computed ? stringValue(property) : property.name;
    const dbObject = object.type === 'Identifier' && shape.dbLocals.has(object.name);
    const prepared = object.type === 'CallExpression' && isMethodCall(object, new Set(['prepare']));
    const statement = object.type === 'Identifier' && shape.statements.has(object.name);

    if (['get', 'all'].includes(method) && (dbObject || prepared || statement)) effects.add(DB_READ);
    else if (method === 'run' && (dbObject || prepared || statement)) effects.add(DB_WRITE);
    else if (consumedPrepares.has(node)) continue;
    else if (DB_METHODS.has(method)) sqlEffects(node.arguments[0]).forEach((effect) => effects.add(effect));
    else if (dbObject) ALL_DB_EFFECTS.forEach((effect) => effects.add(effect));
  }
  return effects;
}

function calledNames(fnNode, shape) {
  const names = new Set();
  for (const [node] of walk(fnNode)) {
    if (node.type !== 'CallExpression') continue;
    if (node.callee.type === 'Identifier') names.add(node.callee.name);
    else if (node.callee.type === 'MemberExpression' && !node.callee.computed
        && node.callee.object.type === 'Identifier' && shape.namespaces.has(node.callee.object.name)) {
      names.add(`${node.callee.object.name}.${node.callee.property.name}`);
    }
  }
  return names;
}

// 本地名 local 若导入自查询层，沿导入链找到定义处的 effect；认不出定义时保守地算读写都有
function importedEffects(shapes, effects, shape, local, seen = new Set()) {
  let ref = shape.imports.get(local);
  if (!ref) {
    const dot = local.indexOf('.');
    const namespace = dot > 0 ? shape.namespaces.get(local.slice(0, dot)) : null;
    if (namespace) ref = { target: namespace.target, name: local.slice(dot + 1) };
  }
  if (!ref) return new Set();
  const refKey = `${ref.target}:${ref.name}`;
  if (seen.has(refKey)) return new Set(ALL_DB_EFFECTS);
  const other = shapes.get(ref.target);
  if (!other) return new Set(ALL_DB_EFFECTS);
  const resolved = other.exported.get(ref.name);
  if (resolved === undefined) return new Set(ALL_DB_EFFECTS);
  const known = effects.get(ref.target).get(resolved);
  if (known) return known;
  if (other.imports.has(resolved)) return importedEffects(shapes, effects, other, resolved, new Set([...seen, refKey]));
  return new Set(ALL_DB_EFFECTS);
}

export function dbEffectsByExport(parsed) {
  const shapes = new Map(parsed.filter((f) => f.rel.startsWith(QUERY_DIR)).map((f) => [f.rel, queryShape(f)]));
  const effects = new Map();
  for (const [rel, shape] of shapes) {
    const localEffects = new Map();
    for (const [name, fn] of shape.locals) {
      localEffects.set(name, fn ? directEffects(fn, shape) : new Set(ALL_DB_EFFECTS));
    }
    effects.set(rel, localEffects);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [rel, shape] of shapes) {
      const localEffects = effects.get(rel);
      for (const [name, fn] of shape.locals) {
        if (!fn) continue;
        const current = localEffects.get(name);
        const calls = calledNames(fn, shape);
        for (const callee of calls) {
          const calledEffects = localEffects.get(callee) ?? importedEffects(shapes, effects, shape, callee);
          for (const effect of calledEffects) {
            if (!current.has(effect)) {
              current.add(effect);
              changed = true;
            }
          }
        }
      }
    }
  }

  const result = new Map();
  for (const [rel, shape] of shapes) {
    const exportedEffects = new Map();
    for (const [name, local] of shape.exported) {
      exportedEffects.set(name, effects.get(rel).get(local) ?? importedEffects(shapes, effects, shape, local));
    }
    result.set(rel, exportedEffects);
  }
  let dbReadExports = 0;
  let dbWriteExports = 0;
  for (const exports of result.values()) {
    for (const effectSet of exports.values()) {
      if (effectSet.has(DB_READ)) dbReadExports += 1;
      if (effectSet.has(DB_WRITE)) dbWriteExports += 1;
    }
  }
  return { byExport: result, dbReadExports, dbWriteExports };
}
