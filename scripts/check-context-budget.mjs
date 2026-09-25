#!/usr/bin/env node
/**
 * 上下文预算守卫：文档长度 + 代码文件长度/体量，对照基线防膨胀
 *
 * 移植自 casim 的 tools/context_budget.py，指标与阈值保持一致。
 * 代码文件（.js/.jsx/.mjs/.cjs）指标：
 *   file_tokens           文件 token 数（正则近似，CJK 单字 / 标识符 / 数字 / 符号各计 1）
 *   largest_function      最大函数行数（espree AST）
 *   function_class_count  文件内函数 + 类数量
 *   internal_dependencies 仓内跨文件依赖数（相对路径 import/require 解析到实际文件）
 * 文档（.md/.txt）指标：
 *   document_tokens / document_loc           整篇 token 数 / 行数
 *   largest_section_tokens / largest_section_loc  最大章节 token 数 / 行数
 *
 * 每项指标有 (warning, hard) 两档。判定规则：
 *   - 超 warning → WARN；超 hard → FAIL
 *   - 基线里已超标的历史文件：超 hard 只 WARN（historical_hard），
 *     但相对基线增长 ≥ MIN_GROWTH 且 >20% 时 FAIL（growth）
 *   - 解析失败 → FAIL（parse_error）
 *
 * 用法：
 *   node scripts/check-context-budget.mjs [--root <dir>] [--baseline <path>] [--ignore <glob>]
 *       [--update-baseline] [--detail <path>] [--details] [--top N]
 *
 * 退出码：0 通过（含仅 WARN）/ 1 存在 FAIL 或基线版本不兼容
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const espree = require('espree');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// --root 可改为扫描别的目录（守卫自身的夹具测试用）
let ROOT = path.resolve(__dirname, '..');
const DEFAULT_BASELINE = path.join('scripts', 'context-budget-baseline.json');
const ALGORITHM_VERSION = 1;

const CODE_SUFFIXES = new Set(['.js', '.jsx', '.mjs', '.cjs']);
const DOC_SUFFIXES = new Set(['.md', '.txt']);
const RESOLVE_SUFFIXES = ['.js', '.jsx', '.mjs', '.cjs', '.json'];

// ─── 阈值（与 casim tools/context_budget.py 一致）──────────────────────────────
const THRESHOLDS = {
  file_tokens: [8000, 16000],
  largest_function: [150, 300],
  function_class_count: [25, 50],
  internal_dependencies: [10, 20],
  document_tokens: [6000, 12000],
  document_loc: [500, 1000],
  largest_section_tokens: [2500, 5000],
  largest_section_loc: [200, 400],
};

const MIN_GROWTH = {
  file_tokens: 1000,
  largest_function: 30,
  function_class_count: 5,
  internal_dependencies: 3,
  document_tokens: 100,
  document_loc: 100,
  largest_section_tokens: 100,
  largest_section_loc: 100,
};

// 目录名命中即整棵跳过；`.` 开头的目录（.git/.temp/.codegraph 等）一律跳过
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'coverage', 'build', 'test-results',
  'data', 'node-runtime', '__pycache__',
]);
const SKIP_GLOBS = ['docs/images'];

const TOKEN_RE = /[\u3400-\u9fff]|[A-Za-z_][A-Za-z0-9_]*|[^\W\d_]+|\d+(?:\.\d+)?|[^\w\s]/gu;
const HEADING_RE = /^(#{1,6})[ \t]+(.+?)\s*#*\s*$/;
const SETEXT_RE = /^[ \t]*(=+|-+)[ \t]*$/;

const TEMPLATES = {
  file_tokens: {
    primary: '这个文件作为上下文读入的代价正在变高。',
    direction: '继续往里加代码前，先确认新逻辑是否属于同一个职责。',
    avoid: '不要为了凑指标拆分内聚的代码；优先保持强相关逻辑在一起、减少不必要的依赖。',
  },
  largest_function: {
    primary: '这个函数作为一个整体理解的代价正在变高。',
    direction: '检查它是否包含可以分离的职责。',
    avoid: '只在边界清晰时抽取；不要为了降行数制造琐碎的 helper 函数。',
  },
  function_class_count: {
    primary: '这个文件里可独立导航的定义越积越多。',
    direction: '检查这些定义是否仍服务于同一个内聚职责。',
    avoid: '不要为了降数量把内聚的定义拆成包装模块。',
  },
  internal_dependencies: {
    primary: '这个模块的跨文件依赖越积越多。',
    direction: '再加依赖前，先确认职责是否放错了模块。',
    avoid: '不要通过引入包装模块来降这个数字，那只会多一跳导航。',
  },
  document_tokens: {
    primary: '这篇文档作为上下文加载的代价正在变高。',
    direction: '只在包含可独立阅读的主题时才考虑拆分。',
    avoid: '不要制造 architecture-1.md / architecture-2.md 这类编号碎片。',
  },
  document_loc: {
    primary: '这篇文档作为上下文加载的代价正在变高。',
    direction: '只在包含可独立阅读的主题时才考虑拆分。',
    avoid: '不要为了凑行数指标拆分内聚的文档。',
  },
  largest_section_tokens: {
    primary: '单个章节已经大到无法高效加载。',
    direction: '把这个主题抽成独立文档，原位置留一段摘要 + 明确链接。',
    avoid: '保留从父文档出发的清晰导航路径。',
  },
  largest_section_loc: {
    primary: '单个章节已经大到无法高效加载。',
    direction: '把这个主题抽成独立文档，原位置留一段摘要 + 明确链接。',
    avoid: '保留从父文档出发的清晰导航路径。',
  },
};

const METRIC_ORDER = [
  'file_tokens', 'document_tokens', 'largest_function', 'largest_section_tokens',
  'function_class_count', 'internal_dependencies', 'document_loc', 'largest_section_loc',
];

const FAIL_DISPLAY_LIMIT = 20;
const WARN_DISPLAY_LIMIT = 10;

// ─── 遍历与忽略 ──────────────────────────────────────────────────────────────
function matchGlob(rel, pattern) {
  const rx = new RegExp('^' + pattern.split('/').map((seg) => {
    if (seg === '**') return '.*';
    return seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '.');
  }).join('/') + '(/|$)');
  return rx.test(rel);
}

function isIgnored(rel, extraPatterns) {
  const parts = rel.split('/');
  for (const part of parts) {
    if (part.startsWith('.')) return true;
    if (SKIP_DIRS.has(part)) return true;
  }
  const name = parts[parts.length - 1];
  if (name.endsWith('.lock') || name.endsWith('.snap')) return true;
  return [...SKIP_GLOBS, ...extraPatterns].some((p) => matchGlob(rel, p));
}

function collectFiles(dir, relPrefix, extraIgnores, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      if ([...SKIP_GLOBS, ...extraIgnores].some((p) => matchGlob(rel, p))) continue;
      collectFiles(path.join(dir, entry.name), rel, extraIgnores, out);
    } else if (entry.isFile()) {
      if (isIgnored(rel, extraIgnores)) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (CODE_SUFFIXES.has(ext) || DOC_SUFFIXES.has(ext)) out.push(rel);
    }
  }
}

// ─── token 估算 ──────────────────────────────────────────────────────────────
function estimateTokens(text) {
  TOKEN_RE.lastIndex = 0;
  return (text.match(TOKEN_RE) || []).length;
}

// ─── AST 工具 ────────────────────────────────────────────────────────────────
function* walk(node, parent = null) {
  if (!node || typeof node.type !== 'string') return;
  yield [node, parent];
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'range' || key === 'parent') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) if (child && typeof child.type === 'string') yield* walk(child, node);
    } else if (value && typeof value.type === 'string') {
      yield* walk(value, node);
    }
  }
}

const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const CLASS_TYPES = new Set(['ClassDeclaration', 'ClassExpression']);

function functionName(node, parent) {
  if (node.id && node.id.name) return node.id.name;
  if (!parent) return '(匿名)';
  if (parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier') return parent.id.name;
  if ((parent.type === 'MethodDefinition' || parent.type === 'Property' || parent.type === 'PropertyDefinition')
      && parent.key) {
    return parent.key.name || parent.key.value || '(匿名)';
  }
  if (parent.type === 'AssignmentExpression' && parent.left.type === 'MemberExpression') {
    return parent.left.property.name || '(匿名)';
  }
  if (parent.type === 'ExportDefaultDeclaration') return '(default)';
  return '(匿名)';
}

function parseCode(text, rel) {
  const errors = [];
  for (const sourceType of ['module', 'script']) {
    try {
      return espree.parse(text, {
        ecmaVersion: 'latest',
        sourceType,
        ecmaFeatures: { jsx: true },
        loc: true,
      });
    } catch (err) {
      errors.push(`line ${err.lineNumber ?? '?'}: ${err.message}`);
    }
  }
  throw new Error(errors[0]);
}

// 相对路径 specifier 解析到仓内实际文件
function resolveImport(fromRel, specifier, fileSet) {
  if (!specifier.startsWith('.')) return null;
  const fromDir = path.posix.dirname(fromRel);
  const base = path.posix.normalize(path.posix.join(fromDir, specifier));
  const candidates = [base];
  for (const ext of RESOLVE_SUFFIXES) candidates.push(base + ext);
  for (const ext of RESOLVE_SUFFIXES) candidates.push(`${base}/index${ext}`);
  for (const candidate of candidates) {
    if (candidate !== fromRel && fileSet.has(candidate)) return candidate;
  }
  return null;
}

function codeInfo(rel, fileSet) {
  const text = readFileSync(path.join(ROOT, rel), 'utf8');
  const metrics = { file_tokens: estimateTokens(text) };
  let tree;
  try {
    tree = parseCode(text, rel);
  } catch (err) {
    return { path: rel, kind: 'code', metrics, parseError: err.message };
  }

  const functions = [];
  let classCount = 0;
  const dependencies = new Set();
  for (const [node, parent] of walk(tree)) {
    if (FUNCTION_TYPES.has(node.type)) {
      // MethodDefinition / Property 的函数值只计一次（在父节点处命名）
      if ((parent?.type === 'MethodDefinition' || parent?.type === 'Property') && parent.value === node) {
        functions.push({ name: functionName(node, parent), loc: node.loc.end.line - node.loc.start.line + 1 });
        continue;
      }
      if (parent?.type === 'MethodDefinition') continue;
      functions.push({ name: functionName(node, parent), loc: node.loc.end.line - node.loc.start.line + 1 });
    } else if (CLASS_TYPES.has(node.type)) {
      classCount += 1;
    } else if (node.type === 'ImportDeclaration' || node.type === 'ExportAllDeclaration'
        || (node.type === 'ExportNamedDeclaration' && node.source)) {
      const target = resolveImport(rel, node.source.value, fileSet);
      if (target) dependencies.add(target);
    } else if (node.type === 'CallExpression' && node.callee.type === 'Identifier'
        && node.callee.name === 'require' && node.arguments.length === 1
        && node.arguments[0].type === 'Literal' && typeof node.arguments[0].value === 'string') {
      const target = resolveImport(rel, node.arguments[0].value, fileSet);
      if (target) dependencies.add(target);
    }
  }

  const largest = functions.reduce((a, b) => (b.loc > a.loc ? b : a), { name: null, loc: 0 });
  metrics.largest_function = largest.loc;
  metrics.function_class_count = functions.length + classCount;
  metrics.internal_dependencies = dependencies.size;
  return {
    path: rel,
    kind: 'code',
    metrics,
    largestFunctionName: largest.name,
  };
}

// ─── 文档章节 ────────────────────────────────────────────────────────────────
function findHeadings(lines) {
  const headings = [];
  let fenced = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trimStart();
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) { fenced = !fenced; continue; }
    if (fenced) continue;
    const match = HEADING_RE.exec(line);
    if (match) {
      headings.push({ start: i, level: match[1].length, title: match[2].trim() });
      continue;
    }
    if (i > 0 && line.trim() && SETEXT_RE.test(line)) {
      const prev = lines[i - 1].trim();
      if (prev && !prev.startsWith('#') && !prev.startsWith('-') && !prev.startsWith('*')) {
        headings.push({ start: i - 1, level: line.trim().startsWith('=') ? 1 : 2, title: prev });
      }
    }
  }
  return headings;
}

function documentInfo(rel) {
  const text = readFileSync(path.join(ROOT, rel), 'utf8');
  const lines = text.split('\n');
  const headings = findHeadings(lines);
  const sections = [];
  const occurrences = new Map();
  for (let pos = 0; pos < headings.length; pos += 1) {
    const { start, level, title } = headings[pos];
    let end = lines.length;
    for (let j = pos + 1; j < headings.length; j += 1) {
      if (headings[j].level <= level) { end = headings[j].start; break; }
    }
    const baseKey = `${level}:${title}`;
    const occurrence = (occurrences.get(baseKey) || 0) + 1;
    occurrences.set(baseKey, occurrence);
    const sectionText = lines.slice(start, end).join('\n');
    sections.push({
      key: `${baseKey}:${occurrence}`,
      title,
      level,
      tokens: estimateTokens(sectionText),
      loc: end - start,
    });
  }
  return {
    path: rel,
    kind: 'document',
    metrics: { document_tokens: estimateTokens(text), document_loc: lines.length },
    sections,
  };
}

function scanRepository(extraIgnores) {
  const rels = [];
  collectFiles(ROOT, '', extraIgnores, rels);
  rels.sort();
  const fileSet = new Set(rels);
  return rels.map((rel) => {
    const ext = path.extname(rel).toLowerCase();
    return CODE_SUFFIXES.has(ext) ? codeInfo(rel, fileSet) : documentInfo(rel);
  });
}

// ─── 判定 ────────────────────────────────────────────────────────────────────
function growthIsSignificant(current, baseline, metric) {
  return current - baseline >= MIN_GROWTH[metric] && current > baseline * 1.2;
}

function metricProblem(metric, current, baselineValue, detail = null) {
  const [warning, hard] = THRESHOLDS[metric];
  const growth = baselineValue != null && growthIsSignificant(current, baselineValue, metric);
  if (current <= warning && !(baselineValue != null && baselineValue > warning && growth)) return null;
  if (current > hard) {
    const historicalHard = baselineValue != null && baselineValue > hard;
    if (!historicalHard || growth) {
      return { metric, severity: 'FAIL', current, warning, hard, baseline: baselineValue, detail, reason: growth ? 'growth' : 'hard_limit' };
    }
    return { metric, severity: 'WARN', current, warning, hard, baseline: baselineValue, detail, reason: 'historical_hard' };
  }
  if (growth) {
    return { metric, severity: 'FAIL', current, warning, hard, baseline: baselineValue, detail, reason: 'growth' };
  }
  return { metric, severity: 'WARN', current, warning, hard, baseline: baselineValue, detail, reason: 'threshold' };
}

function evaluateFile(info, baselineEntry) {
  const baselineMetrics = baselineEntry?.metrics || {};
  const problems = [];
  if (info.parseError) {
    problems.push({ metric: 'parse_error', severity: 'FAIL', current: 0, detail: info.parseError, reason: 'parse_error' });
  }
  for (const [metric, current] of Object.entries(info.metrics)) {
    const detail = metric === 'largest_function' ? info.largestFunctionName : null;
    const problem = metricProblem(metric, current, baselineMetrics[metric] ?? null, detail);
    if (problem) problems.push(problem);
  }
  const baselineSections = new Map((baselineEntry?.sections || []).map((s) => [s.key, s]));
  for (const section of info.sections || []) {
    const previous = baselineSections.get(section.key) || {};
    for (const [metric, current] of [['largest_section_tokens', section.tokens], ['largest_section_loc', section.loc]]) {
      const problem = metricProblem(metric, current, previous[metric] ?? null, section.title);
      if (problem) problems.push(problem);
    }
  }
  return problems;
}

// ─── 基线读写 ────────────────────────────────────────────────────────────────
function baselineEntryOf(info) {
  return {
    kind: info.kind,
    metrics: info.metrics,
    largest_function_name: info.largestFunctionName ?? null,
    sections: (info.sections || []).map((s) => ({
      key: s.key,
      title: s.title,
      level: s.level,
      largest_section_tokens: s.tokens,
      largest_section_loc: s.loc,
    })),
  };
}

function loadBaseline(absPath) {
  if (!existsSync(absPath)) return { version: ALGORITHM_VERSION, files: {} };
  const data = JSON.parse(readFileSync(absPath, 'utf8'));
  if (data.version !== ALGORITHM_VERSION) {
    throw new Error(`不支持的基线版本: ${data.version}`);
  }
  return data;
}

function writeBaseline(absPath, infos) {
  const files = {};
  for (const info of [...infos].sort((a, b) => a.path.localeCompare(b.path))) {
    files[info.path] = baselineEntryOf(info);
  }
  const payload = { version: ALGORITHM_VERSION, token_algorithm: 'regex-v1', files };
  mkdirSync(path.dirname(absPath), { recursive: true });
  writeFileSync(absPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

// ─── 输出 ────────────────────────────────────────────────────────────────────
function problemSortKey(p) {
  const severity = p.severity === 'FAIL' ? 1 : 0;
  const order = METRIC_ORDER.includes(p.metric) ? -METRIC_ORDER.indexOf(p.metric) : 1;
  return [severity, order, p.current];
}

function compareProblems(a, b) {
  const ka = problemSortKey(a);
  const kb = problemSortKey(b);
  for (let i = 0; i < 3; i += 1) if (ka[i] !== kb[i]) return ka[i] - kb[i];
  return 0;
}

function formatProblem(p) {
  if (p.metric === 'parse_error') return `- parse_error: ${p.detail}`;
  const threshold = p.current > (p.hard || 0) ? ` > hard ${p.hard.toLocaleString()}` : ` > warning ${p.warning.toLocaleString()}`;
  let line = `- ${p.metric}: ${p.current.toLocaleString()}${threshold}`;
  if (p.baseline != null) {
    const change = p.current - p.baseline;
    const pct = p.baseline ? ((change / p.baseline) * 100).toFixed(1) : '0.0';
    line += ` (baseline ${p.baseline.toLocaleString()}, change ${change >= 0 ? '+' : ''}${change.toLocaleString()} / ${pct}%)`;
  }
  if (p.detail) {
    const label = p.metric === 'largest_function' ? 'Function' : 'Section';
    line += ` [${label}: ${p.detail}]`;
  }
  return line;
}

function reasonText(p) {
  switch (p.reason) {
    case 'growth': return '这个已经偏大的文件相对基线显著增长。';
    case 'hard_limit': return '这个文件超过了仓库硬性上下文预算。';
    case 'historical_hard': return '该指标仍高于已接受基线中记录的 hard 上限。';
    case 'parse_error': return '文件无法做结构化分析。';
    default: return '该指标高于仓库 warning 阈值。';
  }
}

function renderDetailed(entries) {
  const blocks = [];
  for (const [info, problems] of entries) {
    const severity = problems.some((p) => p.severity === 'FAIL') ? 'FAIL' : 'WARN';
    const primary = [...problems].sort(compareProblems).pop();
    const template = TEMPLATES[primary.metric] || TEMPLATES.file_tokens;
    blocks.push([
      `[context-budget] ${severity}`,
      `File: ${info.path}`,
      'Problems:',
      ...problems.map(formatProblem),
      '',
      `主要问题：${template.primary}`,
      `原因：${reasonText(primary)}`,
      `${severity === 'FAIL' ? '要求动作' : '建议方向'}：${template.direction}`,
      `避免：${template.avoid}`,
    ].join('\n'));
  }
  return blocks.join('\n\n');
}

function render(infos, baseline, { details = false, detailFiles = new Set(), top = null } = {}) {
  const entries = [];
  for (const info of infos) {
    const problems = evaluateFile(info, baseline.files?.[info.path]);
    if (problems.length) entries.push([info, problems]);
  }
  const failFiles = entries.filter(([, ps]) => ps.some((p) => p.severity === 'FAIL'));
  const warnFiles = entries.filter(([, ps]) => !ps.some((p) => p.severity === 'FAIL'));

  if (details) {
    const body = renderDetailed(entries);
    const status = failFiles.length ? 'FAIL' : 'WARN';
    const output = body
      ? `${body}\n\n[context-budget] ${status} 汇总: ${failFiles.length} fail, ${warnFiles.length} warn`
      : '[context-budget] PASS\n未发现上下文预算违规。';
    return { output, failures: failFiles.length };
  }

  const keyOf = ([info]) => [
    info.metrics[info.kind === 'code' ? 'file_tokens' : 'document_tokens'] || 0, info.path,
  ];
  const shownFail = top == null ? failFiles.slice(0, FAIL_DISPLAY_LIMIT)
    : [...failFiles].sort((a, b) => comparePairs(keyOf(b), keyOf(a))).slice(0, top);
  const shownWarn = top == null ? warnFiles.slice(0, WARN_DISPLAY_LIMIT)
    : [...warnFiles].sort((a, b) => comparePairs(keyOf(b), keyOf(a))).slice(0, top);

  const status = failFiles.length ? 'FAIL' : warnFiles.length ? 'WARN' : 'PASS';
  const lines = [
    `[context-budget] ${status} 汇总: ${failFiles.length} fail, ${warnFiles.length} warn; `
      + `共扫描 ${infos.length} 个文件`,
    '',
    `FAIL 文件（${shownFail.length}/${failFiles.length}）:`,
  ];
  const renderRows = (rows, total) => {
    if (!rows.length) { lines.push('- 无'); return; }
    for (const [info, problems] of rows) {
      const counts = ['FAIL', 'WARN']
        .map((sev) => {
          const n = problems.filter((p) => p.severity === sev).length;
          return n ? `${n} ${sev.toLowerCase()}` : null;
        })
        .filter(Boolean).join('; ');
      const metrics = [...problems].sort(compareProblems).reverse()
        .map((p) => `${p.metric}=${p.current.toLocaleString()}`).join(', ');
      lines.push(`- ${info.path} (${counts}; ${metrics})`);
    }
    if (rows.length < total) lines.push(`... 另有 ${total - rows.length} 个`);
  };
  renderRows(shownFail, failFiles.length);
  lines.push('', `WARN 文件（${shownWarn.length}/${warnFiles.length}）:`);
  renderRows(shownWarn, warnFiles.length);

  let output = lines.join('\n');
  if (detailFiles.size) {
    const selected = entries.filter(([info]) => detailFiles.has(info.path));
    if (selected.length) output += `\n\n详情:\n${renderDetailed(selected)}`;
  }
  return { output, failures: failFiles.length };
}

function comparePairs(a, b) {
  return a[0] - b[0] || a[1].localeCompare(b[1]);
}

// ─── CLI ─────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { ignores: [], details: false, detailFiles: new Set(), top: null, updateBaseline: false, baseline: DEFAULT_BASELINE };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--update-baseline') args.updateBaseline = true;
    else if (arg === '--details') args.details = true;
    else if (arg === '--baseline') args.baseline = argv[++i];
    else if (arg === '--ignore') args.ignores.push(argv[++i]);
    else if (arg === '--detail') args.detailFiles.add(argv[++i]);
    else if (arg === '--root') ROOT = path.resolve(argv[++i]);
    else if (arg === '--top') {
      args.top = Number(argv[++i]);
      if (!Number.isInteger(args.top) || args.top < 1) {
        console.error('✖ --top 必须是正整数');
        process.exit(2);
      }
    } else {
      console.error(`✖ 未知参数: ${arg}`);
      process.exit(2);
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const baselinePath = path.isAbsolute(args.baseline) ? args.baseline : path.join(ROOT, args.baseline);
  try {
    const infos = scanRepository(args.ignores);
    if (args.updateBaseline) {
      const errors = infos.filter((info) => info.parseError);
      if (errors.length) {
        for (const info of errors) {
          console.error(`[context-budget] FAIL\nFile: ${info.path}\nProblems:\n- parse_error: ${info.parseError}`);
        }
        process.exit(1);
      }
      writeBaseline(baselinePath, infos);
      console.log(`[context-budget] 基线已更新\nFile: ${path.relative(ROOT, baselinePath)}\nFiles: ${infos.length}`);
      process.exit(0);
    }
    const baseline = loadBaseline(baselinePath);
    const { output, failures } = render(infos, baseline, {
      details: args.details,
      detailFiles: args.detailFiles,
      top: args.top,
    });
    console.log(output);
    process.exit(failures ? 1 : 0);
  } catch (err) {
    console.error(`[context-budget] FAIL\n无法扫描仓库: ${err.message}`);
    process.exit(1);
  }
}

main();
