/**
 * log-retention.js — 本地日志按天数 / 总量清理
 *
 * 只删命名符合格式的文件，单个文件删除失败跳过；不写日志（logger.js 依赖本模块）。
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAIN_LOG_RE = /^worldengine-\d{4}-\d{2}-\d{2}\.log$/;
const RAW_LOG_RE = /^\d{4}-\d{2}-\d{2}T.+\.json$/;

async function listLogFiles(dir, pattern) {
  let names;
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const files = [];
  // 按文件名排序：两种日志的文件名都以日期 / 时间戳开头，字典序即时间序
  for (const name of names.filter((n) => pattern.test(n)).sort()) {
    const filePath = path.join(dir, name);
    try {
      const stat = await fs.stat(filePath);
      files.push({ filePath, mtimeMs: stat.mtimeMs, size: stat.size });
    } catch { /* 已被删除 */ }
  }
  return files;
}

async function removeFiles(files) {
  let removed = 0;
  for (const file of files) {
    try {
      await fs.unlink(file.filePath);
      removed += 1;
    } catch { /* 已被删除或无权限 */ }
  }
  return removed;
}

/**
 * 删除 maxAgeDays 天前的文件，再按总量从最旧的删到不超过 maxBytes。
 *
 * @returns {Promise<{ removed: number, keptBytes: number }>}
 */
async function pruneLogDir(dir, { pattern, maxAgeDays, maxBytes = Infinity, now = Date.now() }) {
  const files = await listLogFiles(dir, pattern);
  const cutoff = now - maxAgeDays * DAY_MS;
  const expired = files.filter((f) => f.mtimeMs < cutoff);
  const kept = files.filter((f) => f.mtimeMs >= cutoff);

  let keptBytes = kept.reduce((sum, f) => sum + f.size, 0);
  const overflow = [];
  for (const file of kept) {
    if (keptBytes <= maxBytes) break;
    overflow.push(file);
    keptBytes -= file.size;
  }

  const removed = await removeFiles([...expired, ...overflow]);
  return { removed, keptBytes };
}

export function pruneMainLogs(logsDir, { maxAgeDays, now }) {
  return pruneLogDir(logsDir, { pattern: MAIN_LOG_RE, maxAgeDays, now });
}

export function pruneRawLogs(rawDir, { maxAgeDays, maxBytes, now }) {
  return pruneLogDir(rawDir, { pattern: RAW_LOG_RE, maxAgeDays, maxBytes, now });
}
