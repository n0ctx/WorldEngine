/**
 * 知识文件进程级缓存
 *
 * 写卡助手的 knowledge/*.md 和 prompts/*.md 在运行期基本不变，
 * 每次父/子代理调用都重新 readFile 属于纯 IO 浪费。
 * 本模块提供带 mtime 校验的惰性缓存：文件未变更时直接返回内存内容。
 */

import { readFile, stat } from 'node:fs/promises';

const cache = new Map(); // path -> { content, mtimeMs }
const inflight = new Map(); // path -> Promise<string>，并发首次加载去重

async function loadWithCache(filePath) {
  const cached = cache.get(filePath);
  let mtimeMs = 0;
  try {
    const s = await stat(filePath);
    mtimeMs = s.mtimeMs;
  } catch {
    /* 文件可能不存在，用 -1 确保不会命中旧缓存 */
    mtimeMs = -1;
  }

  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.content;
  }

  const pending = inflight.get(filePath);
  if (pending) return pending;
  const loadPromise = (async () => {
    try {
      const content = await readFile(filePath, 'utf-8');
      cache.set(filePath, { content, mtimeMs });
      return content;
    } finally {
      inflight.delete(filePath);
    }
  })();
  inflight.set(filePath, loadPromise);
  return loadPromise;
}

export function clearKnowledgeCache() {
  cache.clear();
}

export function getKnowledgeCacheSize() {
  return cache.size;
}

export { loadWithCache };
