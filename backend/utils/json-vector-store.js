/**
 * json-vector-store.js — 以单个 JSON 文件存放向量条目的读写与余弦相似度
 *
 * 被 session-summary-vector-store.js / turn-summary-vector-store.js 引用。
 */

import fs from 'node:fs';
import path from 'node:path';

const EMPTY_STORE = { version: 1, entries: [] };

/**
 * @param {string} storePath  JSON 文件绝对路径
 */
export function createJsonVectorStore(storePath) {
  function loadStore() {
    if (!fs.existsSync(storePath)) return structuredClone(EMPTY_STORE);
    try {
      return JSON.parse(fs.readFileSync(storePath, 'utf-8'));
    } catch {
      return structuredClone(EMPTY_STORE);
    }
  }

  function saveStore(store) {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify(store), 'utf-8');
  }

  /** 删除某 session 对应的所有向量条目，不存在时静默忽略 */
  function deleteBySessionId(sessionId) {
    const store = loadStore();
    const before = store.entries.length;
    store.entries = store.entries.filter((e) => e.session_id !== sessionId);
    if (store.entries.length !== before) saveStore(store);
  }

  return { loadStore, saveStore, deleteBySessionId };
}

/** 余弦相似度；维度不一致时返回 null */
export function cosineSimilarity(a, b) {
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
