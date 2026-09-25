/**
 * Turn Summary 向量文件管理 — /data/vectors/turn_summaries.json
 *
 * 对外暴露：
 *   loadStore()
 *   upsertEntry(turnRecordId, sessionId, worldId, vector)           → void
 *   deleteBySessionId(sessionId)                                    → void
 *   search(queryVector, { worldId, currentSessionId, sameSessionThreshold, crossSessionThreshold, topK })
 *     → [{ turn_record_id, session_id, score, is_same_session }, ...]
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MEMORY_RECALL_SIMILARITY_THRESHOLD,
  MEMORY_RECALL_SAME_SESSION_THRESHOLD,
} from './constants.js';
import { cosineSimilarity, createJsonVectorStore } from './json-vector-store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = process.env.WE_TURN_SUMMARY_STORE_PATH
  ? path.resolve(process.env.WE_TURN_SUMMARY_STORE_PATH)
  : path.resolve(__dirname, '..', '..', 'data', 'vectors', 'turn_summaries.json');

const store = createJsonVectorStore(STORE_PATH);
const { saveStore } = store;
export const { loadStore, deleteBySessionId } = store;

// ─── 操作 ────────────────────────────────────────────────────────

/**
 * 新增或更新向量条目
 *
 * @param {string}   turnRecordId  turn_records 表的 id
 * @param {string}   sessionId     所属 session 的 id
 * @param {string}   worldId       所属 world 的 id（用于过滤）
 * @param {number[]} vector        embedding 向量
 */
export function upsertEntry(turnRecordId, sessionId, worldId, vector) {
  const store = loadStore();
  const idx = store.entries.findIndex((e) => e.turn_record_id === turnRecordId);
  const entry = {
    turn_record_id: turnRecordId,
    session_id: sessionId,
    world_id: worldId,
    vector,
    updated_at: Date.now(),
  };

  if (idx >= 0) {
    store.entries[idx] = entry;
  } else {
    store.entries.push(entry);
  }
  saveStore(store);
}

// ─── 搜索 ────────────────────────────────────────────────────────

/**
 * 按余弦相似度搜索，限定世界，同 session / 跨 session 分别用不同阈值
 *
 * @param {number[]} queryVector
 * @param {{
 *   worldId: string,
 *   currentSessionId: string,
 *   sameSessionThreshold?: number,
 *   crossSessionThreshold?: number,
 *   topK?: number,
 *   sessionOnly?: boolean,  — true 时仅返回当前 session 的条目
 * }} options
 * @returns {{ turn_record_id: string, session_id: string, score: number, is_same_session: boolean }[]}
 */
export function search(queryVector, {
  worldId,
  currentSessionId,
  sameSessionThreshold = MEMORY_RECALL_SAME_SESSION_THRESHOLD,
  crossSessionThreshold = MEMORY_RECALL_SIMILARITY_THRESHOLD,
  topK = 5,
  sessionOnly = true,
} = {}) {
  const store = loadStore();
  if (!store.entries.length) return [];

  const scored = [];
  for (const entry of store.entries) {
    if (worldId && entry.world_id !== worldId) continue;

    const isSameSession = entry.session_id === currentSessionId;
    if (sessionOnly && !isSameSession) continue;

    const threshold = isSameSession ? sameSessionThreshold : crossSessionThreshold;

    const score = cosineSimilarity(queryVector, entry.vector);
    if (score === null) continue; // 维度不一致，跳过
    if (score < threshold) continue;

    scored.push({
      turn_record_id: entry.turn_record_id,
      session_id: entry.session_id,
      score,
      is_same_session: isSameSession,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
