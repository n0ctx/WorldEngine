// 只读参考文档：assistant/docs/*.md，外加由前端样式实时生成的 token 清单。

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fail } from './common.js';
import { renderTokenDoc } from './tokens.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, '../../docs');
const GENERATED = { 'theme-tokens': { summary: '可用的 --we-* 主题 token 及默认值', render: renderTokenDoc } };

function docFiles() {
  if (!existsSync(DOCS_DIR)) return [];
  return readdirSync(DOCS_DIR).filter((f) => f.endsWith('.md')).sort();
}

// 文档首行 "# 标题" 作为清单里的一句话用途。
export function listDocs() {
  const rows = docFiles().map((file) => {
    const firstLine = readFileSync(path.join(DOCS_DIR, file), 'utf-8').split('\n')[0].replace(/^#\s*/, '');
    return `doc:${file.replace(/\.md$/, '')} — ${firstLine}`;
  });
  for (const [name, doc] of Object.entries(GENERATED)) rows.push(`doc:${name} — ${doc.summary}`);
  return rows;
}

export function readDoc(name) {
  if (GENERATED[name]) return GENERATED[name].render();
  const file = `${name}.md`;
  if (!docFiles().includes(file)) fail(`文档 doc:${name} 不存在。可用文档：\n${listDocs().join('\n')}`);
  return readFileSync(path.join(DOCS_DIR, file), 'utf-8');
}

export function searchDocs(needle) {
  const hits = [];
  for (const file of docFiles()) {
    const lines = readFileSync(path.join(DOCS_DIR, file), 'utf-8').split('\n');
    for (const line of lines) {
      if (line.toLowerCase().includes(needle)) hits.push({ ref: `doc:${file.replace(/\.md$/, '')}`, text: line.trim() });
    }
  }
  return hits;
}
