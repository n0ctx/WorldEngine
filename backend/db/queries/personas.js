import crypto from 'node:crypto';
import db from '../index.js';

/**
 * 获取某世界下所有 persona，每条记录附带 is_active 布尔标记。
 * is_active = 1 当且仅当该 persona.id === worlds.active_persona_id；
 * 若 worlds.active_persona_id 为 NULL，则最早创建的 persona 视为 active。
 */
export function getPersonasByWorldId(worldId) {
  const world = db.prepare('SELECT active_persona_id FROM worlds WHERE id = ?').get(worldId);
  if (!world) return [];

  const personas = db.prepare('SELECT * FROM personas WHERE world_id = ? ORDER BY sort_order ASC, created_at ASC').all(worldId);
  if (personas.length === 0) return personas;

  // active_persona_id 为 NULL 时，最早创建的 persona 为 active
  const activeId = world.active_persona_id ?? personas[0].id;
  return personas.map((p) => ({ ...p, is_active: p.id === activeId ? 1 : 0 }));
}

/**
 * 根据 world_id 获取当前激活的 persona（供兼容旧接口使用）。
 * 若 active_persona_id 为 NULL，返回最早创建的 persona；
 * 若世界下无任何 persona，返回 undefined。
 */
export function getPersonaByWorldId(worldId) {
  const world = db.prepare('SELECT active_persona_id FROM worlds WHERE id = ?').get(worldId);
  if (!world) return undefined;

  if (world.active_persona_id) {
    const p = db.prepare('SELECT * FROM personas WHERE id = ?').get(world.active_persona_id);
    if (p) return p;
  }
  // fallback：最早创建的 persona
  return db.prepare('SELECT * FROM personas WHERE world_id = ? ORDER BY created_at ASC LIMIT 1').get(worldId);
}

/**
 * 根据 id 获取单条 persona。
 */
export function getPersonaById(id) {
  return db.prepare('SELECT * FROM personas WHERE id = ?').get(id);
}

/**
 * 创建新 persona。
 */
export function createPersona(worldId, data = {}) {
  const id = crypto.randomUUID();
  const now = Date.now();

  const maxRow = db.prepare(
    'SELECT MAX(sort_order) AS max_sort FROM personas WHERE world_id = ?',
  ).get(worldId);
  const sortOrder = data.sort_order ?? ((maxRow?.max_sort ?? -1) + 1);

  db.prepare(`
    INSERT INTO personas (id, world_id, name, description, system_prompt, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, worldId, data.name ?? '', data.description ?? '', data.system_prompt ?? '', sortOrder, now, now);
  return db.prepare('SELECT * FROM personas WHERE id = ?').get(id);
}

/**
 * 按 id 更新 persona 字段（name / system_prompt / avatar_path）。
 */
export function updatePersonaById(id, data = {}) {
  const patch = {};
  if ('name' in data) patch.name = data.name;
  if ('description' in data) patch.description = data.description;
  if ('system_prompt' in data) patch.system_prompt = data.system_prompt;
  if ('avatar_path' in data) patch.avatar_path = data.avatar_path;
  if ('sort_order' in data) patch.sort_order = data.sort_order;
  if (Object.keys(patch).length === 0) return db.prepare('SELECT * FROM personas WHERE id = ?').get(id);

  const sets = Object.keys(patch).map((k) => `${k} = ?`);
  sets.push('updated_at = ?');
  const values = [...Object.values(patch), Date.now(), id];
  db.prepare(`UPDATE personas SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return db.prepare('SELECT * FROM personas WHERE id = ?').get(id);
}

/**
 * 删除 persona。若该世界下仅剩一条 persona，抛出 Error 禁止删除。
 * 若被删除的是 active persona，同时将 worlds.active_persona_id 置 NULL。
 */
export function deletePersonaById(id) {
  const persona = db.prepare('SELECT * FROM personas WHERE id = ?').get(id);
  if (!persona) throw new Error('玩家卡不存在');

  const count = db.prepare('SELECT COUNT(*) AS c FROM personas WHERE world_id = ?').get(persona.world_id);
  if (count.c <= 1) throw new Error('至少需要保留一张玩家卡');

  const world = db.prepare('SELECT active_persona_id FROM worlds WHERE id = ?').get(persona.world_id);
  if (world?.active_persona_id === id) {
    db.prepare('UPDATE worlds SET active_persona_id = NULL WHERE id = ?').run(persona.world_id);
  }
  db.prepare('DELETE FROM personas WHERE id = ?').run(id);
}

/**
 * 将指定 persona 设为 active（更新 worlds.active_persona_id）。
 */
export function setActivePersona(worldId, personaId) {
  db.prepare('UPDATE worlds SET active_persona_id = ? WHERE id = ?').run(personaId, worldId);
}

/**
 * Upsert persona（旧接口保留兼容：每个 world 最多一个 persona 语义下的 upsert）。
 * 现在改为：若已有任意 persona，则更新最老的那条；否则创建新条。
 */
export function upsertPersona(worldId, data = {}) {
  const existing = getPersonaByWorldId(worldId);
  if (existing) {
    return updatePersonaById(existing.id, data);
  }
  return createPersona(worldId, data);
}

/**
 * 批量更新玩家卡排序（传入 [{id, sort_order}, ...] 数组）
 */
export function reorderPersonas(items) {
  const stmt = db.prepare('UPDATE personas SET sort_order = ?, updated_at = ? WHERE id = ?');
  const now = Date.now();
  const update = db.transaction(() => {
    for (const item of items) {
      stmt.run(item.sort_order, now, item.id);
    }
  });
  update();
}

/**
 * 获取某世界 persona 的头像路径，不存在或无头像返回 null
 */
export function getPersonaAvatarPathByWorldId(worldId) {
  const persona = getPersonaByWorldId(worldId);
  return persona?.avatar_path ?? null;
}
