/**
 * 向量文件管理 — /data/vectors/prompt_entries.json
 *
 * 对外暴露：
 *   loadStore()                                        → { version, entries }
 *   upsertEntry(id, sourceId, sourceTable, vector)     → void
 *   deleteEntry(id)                                    → void
 *   search(queryVector, topK)                          → [{ id, sourceId, sourceTable, score }, ...]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.resolve(__dirname, '..', '..', 'data', 'vectors', 'prompt_entries.json');

const EMPTY_STORE = { version: 1, entries: [] };

// ─── 文件 I/O ────────────────────────────────────────────────────

function ensureDir() {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
}

export function loadStore() {
  if (!fs.existsSync(STORE_PATH)) return structuredClone(EMPTY_STORE);
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
  } catch {
    return structuredClone(EMPTY_STORE);
  }
}

function saveStore(store) {
  ensureDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store), 'utf-8');
}

// ─── 操作 ────────────────────────────────────────────────────────

/**
 * 新增或更新向量条目
 *
 * @param {string} id           向量条目自身的 UUID（写回 prompt_entries 表的 embedding_id）
 * @param {string} sourceId     对应 prompt_entries 表中的条目 id
 * @param {string} sourceTable  'global_prompt_entries' | 'world_prompt_entries' | 'character_prompt_entries'
 * @param {number[]} vector     embedding 向量
 */
export function upsertEntry(id, sourceId, sourceTable, vector) {
  const store = loadStore();
  const idx = store.entries.findIndex((e) => e.id === id);
  const entry = { id, source_id: sourceId, source_table: sourceTable, vector, updated_at: Date.now() };

  if (idx >= 0) {
    store.entries[idx] = entry;
  } else {
    store.entries.push(entry);
  }
  saveStore(store);
}

/**
 * 删除向量条目，id 不存在时静默忽略
 *
 * @param {string} id
 */
export function deleteEntry(id) {
  const store = loadStore();
  const before = store.entries.length;
  store.entries = store.entries.filter((e) => e.id !== id);
  if (store.entries.length !== before) saveStore(store);
}

// ─── 搜索 ────────────────────────────────────────────────────────

function cosineSimilarity(a, b) {
  if (a.length !== b.length) return null;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * 余弦相似度搜索，返回最相似的 topK 条目
 *
 * @param {number[]} queryVector
 * @param {number} topK
 * @returns {{ id: string, source_id: string, source_table: string, score: number }[]}
 */
export function search(queryVector, topK = 5) {
  const store = loadStore();
  if (!store.entries.length) return [];

  const scored = [];
  for (const entry of store.entries) {
    const score = cosineSimilarity(queryVector, entry.vector);
    if (score === null) continue; // 维度不一致，跳过
    scored.push({ id: entry.id, source_id: entry.source_id, source_table: entry.source_table, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
