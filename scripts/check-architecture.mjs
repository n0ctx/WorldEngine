#!/usr/bin/env node
/**
 * 架构边界守卫：用仓内依赖图检查层间禁止依赖
 *
 * 规则来自 CLAUDE.md 的高频硬约束和现有目录分工，见 ARCH_RULES：
 *   frontend-to-backend / backend-to-frontend  前后端只经 HTTP 通信，互不导入代码；
 *   assistant-client-entry                     写卡助手前端接入只允许经 frontend/src/core/features/assistant/；
 *   db-connection-outside-queries              数据库连接只由 backend/db/ 使用，SQL 收口到 backend/db/queries/
 *                                              （backend/server.js 启动时初始化 schema，是约定的例外）。
 * 前端 fetch 只能经 core/api 不是依赖关系，由 frontend/eslint.config.js 的 no-restricted-globals 负责。
 *
 * 现状全部为 0，所有规则都是硬规则：出现即失败，不进基线。发现按「规则:源文件 -> 目标文件」报告。
 *
 * 扫描正式代码，排除测试；排除目录与其他守卫一致（guard-common.mjs）。依赖边的认定见 import-graph.mjs，
 * 字面量仓内引用无法解析时 detector health 失败。
 *
 * 用法：
 *   node scripts/check-architecture.mjs [--root <dir>]
 *
 * 退出码：0 通过 / 1 存在违规
 */

import { collectCodeFiles, finish, isTestPath, parseArgs, scanHealth, section } from './guard-common.mjs';
import { buildImportGraph } from './import-graph.mjs';

const ARCH_RULES = [
  { rule: 'frontend-to-backend', from: /^frontend\//, to: /^backend\// },
  { rule: 'backend-to-frontend', from: /^backend\//, to: /^frontend\// },
  { rule: 'assistant-client-entry', from: /^frontend\/(?!src\/core\/features\/assistant\/)/, to: /^assistant\// },
  { rule: 'db-connection-outside-queries', from: /^(?!backend\/db\/|backend\/server\.js$)/, to: /^backend\/db\/[^/]+$/ },
];

function collectArchitecture(root) {
  const rels = collectCodeFiles(root).filter((rel) => !isTestPath(rel));
  const { parsed, parseFailures, modules, unresolvedStaticImports } = buildImportGraph(root, rels);
  const findings = new Set();
  const edges = new Set();
  for (const [source, mod] of modules) {
    for (const { target } of mod.refs) {
      edges.add(`${source} -> ${target}`);
      for (const rule of ARCH_RULES) {
        if (!rule.from.test(source) || !rule.to.test(target)) continue;
        findings.add(`${rule.rule}:${source} -> ${target}`);
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
    failures.push(section('这些依赖越过了架构边界（硬规则，不进基线）；改掉依赖方向，SQL 挪进 backend/db/queries/ 后改为调用查询函数：',
      scan.findings));
  }
  finish('架构边界守卫', failures, `解析 ${scan.parsedFileCount}/${scan.fileCount} 个正式源码文件，`
    + `${scan.moduleCount} 个模块 / ${scan.edgeCount} 条依赖边，越界 ${scan.findings.length} 处`);
}

main();
