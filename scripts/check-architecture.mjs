#!/usr/bin/env node
/**
 * 架构边界守卫：用仓内依赖图检查层间禁止依赖
 *
 * 规则来自 CLAUDE.md 的高频硬约束和现有目录分工，见 ARCH_RULES：
 *   frontend-to-backend / backend-to-frontend  前后端只经 HTTP 通信，互不导入代码；
 *   assistant-client-entry                     写卡助手前端接入只允许经 frontend/src/core/features/assistant/；
 *   db-connection-outside-queries              数据库连接只由 backend/db/ 使用，SQL 收口到 backend/db/queries/
 *                                              （backend/server.js 启动时初始化 schema，是约定的例外）；
 *   upward-to-routes / upward-to-app / db-to-upper
 *                                              后端分层自上而下：接口层 routes → 流程层 app → 业务层
 *                                              services / memory / prompts（同层可互相调用）→ 数据层 db；
 *                                              llm / utils / hooks / middleware 是底层工具。下层不依赖上层，
 *                                              db 只依赖 db 与 utils；
 *   db-write-outside-services                  接口层和写卡助手服务端写库要经业务层（校验、日志、连带清理都在那里），
 *                                              不直接导入查询层的写函数；读函数不限。写函数的认定见 db-effects.mjs。
 *                                              助手任务表由 assistant/server/task-store.js 直接管理，是约定的例外。
 * 前端 fetch 只能经 core/api 不是依赖关系，由 frontend/eslint.config.js 的 no-restricted-globals 负责。
 *
 * 现状全部为 0，所有规则都是硬规则：出现即失败，不进基线。发现按「规则:源文件 -> 目标文件」报告，写函数另带「#函数名」。
 *
 * 扫描正式代码，排除测试；排除目录与其他守卫一致（guard-common.mjs）。依赖边的认定见 import-graph.mjs，
 * 字面量仓内引用无法解析时 detector health 失败。
 *
 * 用法：
 *   node scripts/check-architecture.mjs [--root <dir>]
 *
 * 退出码：0 通过 / 1 存在违规
 */

import { DB_WRITE, QUERY_DIR, dbEffectsByExport } from './db-effects.mjs';
import { collectCodeFiles, finish, isTestPath, parseArgs, scanHealth, section } from './guard-common.mjs';
import { ALL, buildImportGraph } from './import-graph.mjs';

const BELOW_ROUTES = /^backend\/(app|services|memory|prompts|llm|db|utils|hooks|middleware)\//;
const BELOW_APP = /^backend\/(services|memory|prompts|llm|db|utils|hooks|middleware)\//;

const ARCH_RULES = [
  { rule: 'frontend-to-backend', from: /^frontend\//, to: /^backend\// },
  { rule: 'backend-to-frontend', from: /^backend\//, to: /^frontend\// },
  { rule: 'assistant-client-entry', from: /^frontend\/(?!src\/core\/features\/assistant\/)/, to: /^assistant\// },
  { rule: 'db-connection-outside-queries', from: /^(?!backend\/db\/|backend\/server\.js$)/, to: /^backend\/db\/[^/]+$/ },
  { rule: 'upward-to-routes', from: BELOW_ROUTES, to: /^backend\/routes\// },
  { rule: 'upward-to-app', from: BELOW_APP, to: /^backend\/app\// },
  { rule: 'db-to-upper', from: /^backend\/db\//, to: /^backend\/(?!db\/|utils\/)/ },
];

const WRITE_BYPASS_FROM = /^(backend\/routes|assistant\/server)\//;
// 写卡助手自己的任务表没有对应的业务层，由 task-store 管理，是约定的例外
const OWN_TABLE_STORES = new Map([['assistant/server/task-store.js', 'backend/db/queries/assistant-tasks.js']]);

// source 从查询层 target 导入的写函数名
function importedWrites(target, names, writeEffects) {
  const exports = writeEffects.get(target);
  if (!exports) return [];
  const imported = names.includes(ALL) ? [...exports.keys()] : names;
  return imported.filter((name) => exports.get(name)?.has(DB_WRITE));
}

function collectArchitecture(root) {
  const rels = collectCodeFiles(root).filter((rel) => !isTestPath(rel));
  const { parsed, parseFailures, modules, unresolvedStaticImports } = buildImportGraph(root, rels);
  const writeEffects = dbEffectsByExport(parsed).byExport;
  const findings = new Set();
  const edges = new Set();
  for (const [source, mod] of modules) {
    for (const { target, names } of mod.refs) {
      edges.add(`${source} -> ${target}`);
      for (const rule of ARCH_RULES) {
        if (!rule.from.test(source) || !rule.to.test(target)) continue;
        findings.add(`${rule.rule}:${source} -> ${target}`);
      }
      if (!WRITE_BYPASS_FROM.test(source) || !target.startsWith(QUERY_DIR) || OWN_TABLE_STORES.get(source) === target) continue;
      for (const name of importedWrites(target, names, writeEffects)) {
        findings.add(`db-write-outside-services:${source} -> ${target}#${name}`);
      }
    }
  }
  return {
    fileCount: rels.length, parsedFileCount: parsed.length, moduleCount: modules.size, edgeCount: edges.size,
    parseFailures, unresolvedStaticImports, findings: [...findings].sort(),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2), null);
  const scan = collectArchitecture(args.root);
  const failures = scanHealth({ ...scan, emptyMessage: '没有扫到任何正式源码文件，扫描范围可能失效' });
  if (scan.findings.length) {
    failures.push(section('这些依赖越过了架构边界（硬规则，不进基线）；改掉依赖方向；SQL 挪进 backend/db/queries/ 后改为调用查询函数；写库改为调用业务层：',
      scan.findings));
  }
  finish('架构边界守卫', failures, `解析 ${scan.parsedFileCount}/${scan.fileCount} 个正式源码文件，`
    + `${scan.moduleCount} 个模块 / ${scan.edgeCount} 条依赖边，越界 ${scan.findings.length} 处`);
}

main();
