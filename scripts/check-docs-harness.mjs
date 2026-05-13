import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const AXES = ['frontend', 'backend', 'assistant', 'shared', 'product', 'history'];
const ROOT_ENTRY = 'CLAUDE.md';
const BANNED_DOC_REFERENCES = [
  'DESIGN.md',
  'ARCHITECTURE.md',
  'SCHEMA.md',
  'PROJECT.md',
  'ROADMAP.md',
  'frontend/src/styles/tokens.css',
];
const INDEX_REQUIRED_HEADINGS = [
  '## 什么时候读',
  '## 先读哪几页',
  '## 高频任务快速分流',
  '## 真源与非真源',
];

const allowHistoricalLegacyMentions = new Set([
  normalize('docs/references/history/changelog.md'),
]);

const errors = [];
const warnings = [];

function normalize(p) {
  return p.split(path.sep).join('/');
}

function rel(abs) {
  return normalize(path.relative(repoRoot, abs));
}

function read(file) {
  return fs.readFileSync(path.join(repoRoot, file), 'utf8');
}

function exists(file) {
  return fs.existsSync(path.join(repoRoot, file));
}

function record(target, category, message, severity = 'error') {
  (severity === 'warning' ? warnings : errors).push({ target, category, message });
}

function collectMarkdownFiles(dir) {
  const base = path.join(repoRoot, dir);
  const out = [];
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    const next = path.join(base, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectMarkdownFiles(path.join(dir, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(rel(next));
    }
  }
  return out;
}

function parseMarkdownLinks(content) {
  const links = [];
  const re = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const match of content.matchAll(re)) {
    links.push(match[1]);
  }
  return links;
}

function parsePathLikeCodeSpans(content) {
  const out = [];
  const re = /`([^`\n]+)`/g;
  for (const match of content.matchAll(re)) {
    const value = match[1].trim();
    if (/[*<>{}]/.test(value) || /my-theme/.test(value)) continue;
    if (
      /^(assistant|backend|frontend|docs|themes|shared|scripts)\//.test(value) ||
      /^(CLAUDE|AGENTS|README)\.md$/.test(value)
    ) {
      out.push(value);
    }
  }
  return out;
}

function resolveLocalTarget(fromFile, target) {
  if (!target || target.startsWith('http') || target.startsWith('#') || target.startsWith('mailto:')) {
    return null;
  }
  const clean = target.split('#')[0];
  const resolved = path.normalize(path.join(path.dirname(fromFile), clean));
  return normalize(resolved);
}

function verifyRootEntry() {
  if (!exists(ROOT_ENTRY)) {
    record(ROOT_ENTRY, 'broken_link', '根入口 `CLAUDE.md` 缺失');
    return;
  }
  const content = read(ROOT_ENTRY);
  for (const axis of AXES) {
    const expected = `docs/references/${axis}/index.md`;
    if (!content.includes(expected)) {
      record(ROOT_ENTRY, 'outdated_reference', `根入口缺少主轴索引引用：${expected}`);
    }
  }
}

function verifyIndexes(markdownFiles) {
  for (const axis of AXES) {
    const indexFile = `docs/references/${axis}/index.md`;
    if (!exists(indexFile)) {
      record(indexFile, 'broken_link', '主轴索引缺失');
      continue;
    }
    const content = read(indexFile);
    for (const heading of INDEX_REQUIRED_HEADINGS) {
      if (!content.includes(heading)) {
        record(indexFile, 'outdated_reference', `缺少统一契约标题：${heading}`);
      }
    }
    for (const link of parseMarkdownLinks(content)) {
      const target = resolveLocalTarget(indexFile, link);
      if (!target) continue;
      if (!exists(target)) {
        record(indexFile, 'broken_link', `索引链接不存在：${link}`);
      } else if (
        target !== ROOT_ENTRY &&
        !target.startsWith(`docs/references/${axis}/`) &&
        !target.startsWith('docs/references/history/') &&
        !target.startsWith('docs/references/shared/')
      ) {
        record(indexFile, 'outdated_reference', `索引链接越过当前主轴：${link}`);
      }
    }
  }

  for (const file of markdownFiles) {
    const isIndex = file.endsWith('/index.md');
    const isLeaf = file.startsWith('docs/references/') && !isIndex;
    if (!isLeaf) continue;
    const content = read(file);
    const lines = content.split('\n').length;
    const hasRouter = content.includes('## 任务分流') || content.includes('## 快速入口');
    if (lines < 20) {
      record(file, 'structural_imbalance', `叶子文档过薄（${lines} 行），应补成可执行知识`, 'warning');
    }
    if (lines > 260 && !hasRouter) {
      record(file, 'structural_imbalance', `叶子文档过重（${lines} 行）但缺少任务分流入口`, 'warning');
    }
  }
}

function verifyLinksAndReferences(markdownFiles) {
  for (const file of markdownFiles) {
    const content = read(file);
    for (const link of parseMarkdownLinks(content)) {
      const target = resolveLocalTarget(file, link);
      if (!target) continue;
      if (!exists(target)) {
        record(file, 'broken_link', `链接目标不存在：${link}`);
      }
    }

    if (!allowHistoricalLegacyMentions.has(file)) {
      for (const codePath of parsePathLikeCodeSpans(content)) {
        if (!exists(codePath)) {
          record(file, 'outdated_reference', `内联路径已失效：\`${codePath}\``);
        }
      }
    }

    if (allowHistoricalLegacyMentions.has(file)) continue;
    for (const banned of BANNED_DOC_REFERENCES) {
      if (content.includes(banned)) {
        record(file, 'outdated_reference', `检测到已下线或过期引用：${banned}`);
      }
    }
  }
}

function main() {
  const markdownFiles = [
    ROOT_ENTRY,
    'README.md',
    'AGENTS.md',
    'frontend/README.md',
    'themes/README.md',
    ...collectMarkdownFiles('docs/references'),
    ...collectMarkdownFiles('assistant/knowledge'),
  ].filter((file, index, arr) => arr.indexOf(file) === index && exists(file));

  verifyRootEntry();
  verifyIndexes(markdownFiles);
  verifyLinksAndReferences(markdownFiles);

  if (errors.length === 0 && warnings.length === 0) {
    console.log('docs harness: OK');
    process.exit(0);
  }

  const printGroup = (title, items) => {
    if (items.length === 0) return;
    console.log(title);
    for (const item of items) {
      console.log(`- [${item.category}] ${item.target}: ${item.message}`);
    }
  };

  printGroup('Errors', errors);
  printGroup('Warnings', warnings);

  if (errors.length > 0) {
    process.exit(1);
  }
}

main();
