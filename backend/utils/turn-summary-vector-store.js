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

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MEMORY_RECALL_SIMILARITY_THRESHOLD,
  MEMORY_RECALL_SAME_SESSION_THRESHOLD,
} from './constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = process.env.WE_TURN_SUMMARY_STORE_PATH
  ? path.resolve(process.env.WE_TURN_SUMMARY_STORE_PATH)
  : path.resolve(__dirname, '..', '..', 'data', 'vectors', 'turn_summaries.json');

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

/**
 * 删除某 session 对应的所有向量条目，不存在时静默忽略
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
  sessionOnly = false,
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
