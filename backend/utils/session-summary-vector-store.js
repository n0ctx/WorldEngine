/**
 * Session Summary 向量文件管理 — /data/vectors/session_summaries.json
 *
 * 对外暴露：
 *   loadStore()                                                            → { version, entries }
 *   deleteBySessionId(sessionId)                                           → void
 *   search(queryVector, { worldId, excludeSessionId, topK })               → [{ summary_id, session_id, score }, ...]
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEMORY_RECALL_SIMILARITY_THRESHOLD } from './constants.js';
import { cosineSimilarity, createJsonVectorStore } from './json-vector-store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = process.env.WE_DATA_DIR
  ? path.resolve(process.env.WE_DATA_DIR, 'vectors', 'session_summaries.json')
  : path.resolve(__dirname, '..', '..', 'data', 'vectors', 'session_summaries.json');

export const { loadStore, deleteBySessionId } = createJsonVectorStore(STORE_PATH);

// ─── 搜索 ────────────────────────────────────────────────────────

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
