import crypto from 'node:crypto';
import db from '../index.js';
import { updateRowFields, reorderRows } from './_update-helpers.js';

/**
 * 创建世界，返回新记录
 */
export function createWorld(data) {
  const id = crypto.randomUUID();
  const now = Date.now();
  const maxRow = db.prepare('SELECT MAX(sort_order) AS max_sort FROM worlds').get();
  const sortOrder = (maxRow?.max_sort ?? -1) + 1;
  const stmt = db.prepare(`
    INSERT INTO worlds (id, name, description, temperature, max_tokens, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    data.name,
    data.description ?? '',
    data.temperature ?? null,
    data.max_tokens ?? null,
    sortOrder,
    now,
    now,
  );
  return getWorldById(id);
}

/**
 * 根据 id 获取单个世界，不存在返回 undefined
 */
export function getWorldById(id) {
  return db.prepare('SELECT * FROM worlds WHERE id = ?').get(id);
}

/**
 * 获取所有世界，按 created_at 升序
 */
export function getAllWorlds() {
  return db.prepare('SELECT * FROM worlds ORDER BY sort_order ASC, created_at ASC').all();
}

/**
 * 批量更新世界排序（传入 [{id, sort_order}, ...] 数组）
 */
export function reorderWorlds(items) {
  reorderRows('worlds', items);
}

/**
 * 部分更新世界字段，返回更新后的记录
 */
export function updateWorld(id, patch) {
  return updateRowFields('worlds', id, patch, ['name', 'description', 'temperature', 'max_tokens', 'cover_path', 'accent_color', 'accent_source', 'onboarding_dismissed']);
}

/**
 * 硬删除世界（SQLite 外键级联自动处理子数据）
 */
export function deleteWorld(id) {
  return db.prepare('DELETE FROM worlds WHERE id = ?').run(id);
}
