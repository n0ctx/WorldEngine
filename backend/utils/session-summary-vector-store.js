/**
 * Session Summary 向量文件管理 — /data/vectors/session_summaries.json
 *
 * 对外暴露：
 *   loadStore()                                                            → { version, entries }
 *   deleteBySessionId(sessionId)                                           → void
 *   search(queryVector, { worldId, excludeSessionId, topK })               → [{ summary_id, session_id, score }, ...]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEMORY_RECALL_SIMILARITY_THRESHOLD } from './constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = process.env.WE_DATA_DIR
  ? path.resolve(process.env.WE_DATA_DIR, 'vectors', 'session_summaries.json')
  : path.resolve(__dirname, '..', '..', 'data', 'vectors', 'session_summaries.json');

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
 * 删除某 session 对应的向量条目，不存在时静默忽略
 *
 * @param {string} sessionId
 */
export function deleteBySessionId(sessionId) {
  const store = loadStore();
  const before = store.entries.length;
  store.entries = store.entries.filter((e) => e.session_id !== sessionId);
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
 * 按余弦相似度搜索，限定世界并排除当前 session
 *
 * @param {number[]} queryVector
 * @param {{ worldId: string, excludeSessionId: string, topK?: number }} options
 * @returns {{ summary_id: string, session_id: string, score: number }[]}
 */
export function search(queryVector, { worldId, excludeSessionId, topK = 5 } = {}) {
  const store = loadStore();
  if (!store.entries.length) return [];

  const scored = [];
  for (const entry of store.entries) {
    if (worldId && entry.world_id !== worldId) continue;
    if (excludeSessionId && entry.session_id === excludeSessionId) continue;

    const score = cosineSimilarity(queryVector, entry.vector);
    if (score === null) continue; // 维度不一致，跳过
    if (score < MEMORY_RECALL_SIMILARITY_THRESHOLD) continue;

    scored.push({ summary_id: entry.summary_id, session_id: entry.session_id, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
