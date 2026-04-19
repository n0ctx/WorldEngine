import crypto from 'node:crypto';
import db from '../index.js';

/**
 * 创建世界，返回新记录
 */
export function createWorld(data) {
  const id = crypto.randomUUID();
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO worlds (id, name, system_prompt, post_prompt, temperature, max_tokens, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    data.name,
    data.system_prompt ?? '',
    data.post_prompt ?? '',
    data.temperature ?? null,
    data.max_tokens ?? null,
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
  return db.prepare('SELECT * FROM worlds ORDER BY created_at ASC').all();
}

/**
 * 部分更新世界字段，返回更新后的记录
 */
export function updateWorld(id, patch) {
  const allowedFields = ['name', 'system_prompt', 'post_prompt', 'temperature', 'max_tokens'];
  const sets = [];
  const values = [];

  for (const field of allowedFields) {
    if (field in patch) {
      sets.push(`${field} = ?`);
      values.push(patch[field]);
    }
  }

  if (sets.length === 0) {
    return getWorldById(id);
  }

  sets.push('updated_at = ?');
  values.push(Date.now());
  values.push(id);

  db.prepare(`UPDATE worlds SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getWorldById(id);
}

/**
 * 硬删除世界（SQLite 外键级联自动处理子数据）
 */
export function deleteWorld(id) {
  return db.prepare('DELETE FROM worlds WHERE id = ?').run(id);
}
