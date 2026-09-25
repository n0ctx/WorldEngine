/**
 * file-cleanup.js — 上传文件删除工具
 *
 * 对外暴露：
 *   unlinkUploadFile(relativePath) → Promise<void>
 *   unlinkUploadFiles(relativePaths) → Promise<void>
 *   updateWithAvatarCleanup(patch, readAvatarPath, update) → Promise<更新结果>
 *
 * - relativePath 为 null / 空 → 直接 return（静默）
 * - 文件不存在（ENOENT）→ 静默忽略
 * - 其它错误 → 记录 warn，不抛
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { createLogger, formatMeta } from './logger.js';
import { UPLOADS_DIR } from './data-dir.js';

const log = createLogger('file');


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

/**
 * 执行 update()；patch 改了 avatar_path 时，更新后删除旧头像文件
 *
 * @param {object} patch
 * @param {() => string|null|undefined} readAvatarPath  读取更新前的 avatar_path
 * @param {() => T} update
 * @returns {Promise<T>}
 * @template T
 */
export async function updateWithAvatarCleanup(patch, readAvatarPath, update) {
  const oldAvatarPath = 'avatar_path' in patch ? readAvatarPath() : undefined;
  const updated = update();
  if (oldAvatarPath && oldAvatarPath !== patch.avatar_path) {
    await unlinkUploadFile(oldAvatarPath);
  }
  return updated;
}
