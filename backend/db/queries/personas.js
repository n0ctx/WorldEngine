import crypto from 'node:crypto';
import db from '../index.js';

/**
 * Upsert persona（每个 world 最多一个 persona）
 * 若已存在则更新，不存在则插入
 */
export function upsertPersona(worldId, data = {}) {
  const existing = db.prepare('SELECT * FROM personas WHERE world_id = ?').get(worldId);
  const now = Date.now();

  if (existing) {
    const patch = {};
    if ('name' in data) patch.name = data.name;
    if ('system_prompt' in data) patch.system_prompt = data.system_prompt;
    if (Object.keys(patch).length === 0) return existing;

    const sets = Object.keys(patch).map((k) => `${k} = ?`);
    sets.push('updated_at = ?');
    const values = [...Object.values(patch), now, existing.id];
    db.prepare(`UPDATE personas SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return db.prepare('SELECT * FROM personas WHERE id = ?').get(existing.id);
  } else {
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO personas (id, world_id, name, system_prompt, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id, worldId,
      data.name ?? '',
      data.system_prompt ?? '',
      now, now,
    );
    return db.prepare('SELECT * FROM personas WHERE id = ?').get(id);
  }
}

/**
 * 根据 world_id 获取 persona，不存在返回 undefined
 */
export function getPersonaByWorldId(worldId) {
  return db.prepare('SELECT * FROM personas WHERE world_id = ?').get(worldId);
}
