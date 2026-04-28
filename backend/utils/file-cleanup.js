/**
 * file-cleanup.js — 上传文件删除工具
 *
 * 对外暴露：
 *   UPLOADS_DIR                    — /data/uploads/ 的绝对路径
 *   unlinkUploadFile(relativePath) → Promise<void>
 *   unlinkUploadFiles(relativePaths) → Promise<void>
 *
 * - relativePath 为 null / 空 → 直接 return（静默）
 * - 文件不存在（ENOENT）→ 静默忽略
 * - 其它错误 → 记录 warn，不抛
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger, formatMeta } from './logger.js';

const log = createLogger('file');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = process.env.WE_DATA_DIR
  ? path.resolve(process.env.WE_DATA_DIR, 'uploads')
  : path.resolve(__dirname, '..', '..', 'data', 'uploads');

/**
 * 删除单个上传文件
 *
 * @param {string|null|undefined} relativePath  相对于 UPLOADS_DIR 的路径，如 'avatars/abc.png'
 */
export async function unlinkUploadFile(relativePath) {
  if (!relativePath) return;
  const fullPath = path.resolve(UPLOADS_DIR, relativePath);
  try {
    await fs.unlink(fullPath);
  } catch (err) {
    if (err.code === 'ENOENT') return; // 文件已不存在，静默
    log.warn(`UNLINK FAIL  ${formatMeta({ path: relativePath, error: err.message })}`);
  }
}

/**
 * 批量删除上传文件（串行，便于日志可读）
 *
 * @param {string[]|null|undefined} relativePaths
 */
export async function unlinkUploadFiles(relativePaths) {
  if (!relativePaths || relativePaths.length === 0) return;
  for (const p of relativePaths) {
    await unlinkUploadFile(p);
  }
}
