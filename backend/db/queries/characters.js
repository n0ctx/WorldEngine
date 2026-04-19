import crypto from 'node:crypto';
import db from '../index.js';

/**
 * 创建角色，sort_order 默认取当前 world 下最大值 + 1
 */
export function createCharacter(data) {
  const id = crypto.randomUUID();
  const now = Date.now();

  const maxRow = db.prepare(
    'SELECT MAX(sort_order) AS max_sort FROM characters WHERE world_id = ?',
  ).get(data.world_id);
  const sortOrder = data.sort_order ?? ((maxRow?.max_sort ?? -1) + 1);

  const stmt = db.prepare(`
    INSERT INTO characters (id, world_id, name, system_prompt, post_prompt, first_message, avatar_path, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    data.world_id,
    data.name,
    data.system_prompt ?? '',
    data.post_prompt ?? '',
    data.first_message ?? '',
    data.avatar_path ?? null,
    sortOrder,
    now,
    now,
  );
  return getCharacterById(id);
}

/**
 * 根据 id 获取单个角色
 */
export function getCharacterById(id) {
  return db.prepare('SELECT * FROM characters WHERE id = ?').get(id);
}

/**
 * 获取某世界下所有角色，按 sort_order 升序，同值按 created_at 升序
 */
export function getCharactersByWorldId(worldId) {
  return db.prepare(
    'SELECT * FROM characters WHERE world_id = ? ORDER BY sort_order ASC, created_at ASC',
  ).all(worldId);
}

/**
 * 部分更新角色字段
 */
export function updateCharacter(id, patch) {
  const allowedFields = ['name', 'system_prompt', 'post_prompt', 'first_message', 'avatar_path', 'sort_order'];
  const sets = [];
  const values = [];

  for (const field of allowedFields) {
    if (field in patch) {
      sets.push(`${field} = ?`);
      values.push(patch[field]);
    }
  }

  if (sets.length === 0) {
    return getCharacterById(id);
  }

  sets.push('updated_at = ?');
  values.push(Date.now());
  values.push(id);

  db.prepare(`UPDATE characters SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getCharacterById(id);
}

/**
 * 批量更新角色排序（传入 [{id, sort_order}, ...] 数组）
 */
export function reorderCharacters(items) {
  const stmt = db.prepare('UPDATE characters SET sort_order = ?, updated_at = ? WHERE id = ?');
  const now = Date.now();
  const update = db.transaction(() => {
    for (const item of items) {
      stmt.run(item.sort_order, now, item.id);
    }
  });
  update();
}

/**
 * 硬删除角色
 */
export function deleteCharacter(id) {
  return db.prepare('DELETE FROM characters WHERE id = ?').run(id);
}

// ─── 副作用清理辅助查询（只读） ──────────────────────────────────

/**
 * 获取某世界下所有角色的头像路径（过滤 NULL）
 * @param {string} worldId
 * @returns {string[]}
 */
export function getAvatarPathsByWorldId(worldId) {
  return db.prepare(
    'SELECT avatar_path FROM characters WHERE world_id = ? AND avatar_path IS NOT NULL',
  ).all(worldId).map((r) => r.avatar_path);
}

/**
 * 获取某角色下所有会话 id
 * @param {string} characterId
 * @returns {string[]}
 */
export function getSessionIdsByCharacterId(characterId) {
  return db.prepare('SELECT id FROM sessions WHERE character_id = ?')
    .all(characterId)
    .map((r) => r.id);
}

/**
 * 获取某世界下所有会话 id（JOIN characters）
 * @param {string} worldId
 * @returns {string[]}
 */
export function getSessionIdsByWorldId(worldId) {
  return db.prepare(`
    SELECT s.id FROM sessions s
    JOIN characters c ON s.character_id = c.id
    WHERE c.world_id = ?
  `).all(worldId).map((r) => r.id);
}
