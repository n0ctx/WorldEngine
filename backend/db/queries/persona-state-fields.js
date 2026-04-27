import crypto from 'node:crypto';
import db from '../index.js';
import { parseRow, parseAll } from './_state-fields-base.js';

/**
 * 创建玩家状态字段，sort_order 默认取同 world 最大值 + 1
 */
export function createPersonaStateField(worldId, data) {
  const id = crypto.randomUUID();
  const now = Date.now();
  const maxRow = db.prepare(
    'SELECT MAX(sort_order) AS m FROM persona_state_fields WHERE world_id = ?',
  ).get(worldId);
  const sortOrder = data.sort_order ?? ((maxRow?.m ?? -1) + 1);

  db.prepare(`
    INSERT INTO persona_state_fields (
      id, world_id, field_key, label, type, description,
      default_value, update_mode,
      enum_options, min_value, max_value, allow_empty,
      update_instruction, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, worldId,
    data.field_key, data.label, data.type,
    data.description ?? '',
    data.default_value ?? null,
    data.update_mode ?? 'llm_auto',
    data.enum_options != null ? JSON.stringify(data.enum_options) : null,
    data.min_value ?? null,
    data.max_value ?? null,
    data.allow_empty ?? 1,
    data.update_instruction ?? '',
    sortOrder,
    now, now,
  );
  return getPersonaStateFieldById(id);
}

/**
 * 根据 id 获取单个字段定义
 */
export function getPersonaStateFieldById(id) {
  return parseRow(db.prepare('SELECT * FROM persona_state_fields WHERE id = ?').get(id));
}

/**
 * 获取某世界的所有玩家状态字段，按 sort_order ASC
 */
export function getPersonaStateFieldsByWorldId(worldId) {
  return parseAll(
    db.prepare(
      'SELECT * FROM persona_state_fields WHERE world_id = ? ORDER BY sort_order ASC, created_at ASC',
    ).all(worldId),
  );
}

/**
 * 部分更新字段定义
 */
export function updatePersonaStateField(id, patch) {
  const allowed = [
    'field_key', 'label', 'type', 'description', 'default_value',
    'update_mode', 'enum_options',
    'min_value', 'max_value', 'allow_empty', 'update_instruction', 'sort_order',
  ];
  const sets = [];
  const values = [];

  for (const field of allowed) {
    if (!(field in patch)) continue;
    sets.push(`${field} = ?`);
    if (field === 'enum_options') {
      values.push(patch[field] != null ? JSON.stringify(patch[field]) : null);
    } else {
      values.push(patch[field]);
    }
  }

  if (sets.length === 0) return getPersonaStateFieldById(id);

  sets.push('updated_at = ?');
  values.push(Date.now(), id);
  db.prepare(`UPDATE persona_state_fields SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getPersonaStateFieldById(id);
}

/**
 * 删除字段定义
 */
export function deletePersonaStateField(id) {
  return db.prepare('DELETE FROM persona_state_fields WHERE id = ?').run(id);
}

/**
 * 批量重排序：orderedIds[0] 的 sort_order = 0，依次递增
 */
export function reorderPersonaStateFields(worldId, orderedIds) {
  const update = db.prepare(
    'UPDATE persona_state_fields SET sort_order = ? WHERE id = ? AND world_id = ?',
  );
  const tx = db.transaction((ids) => {
    ids.forEach((id, i) => update.run(i, id, worldId));
  });
  tx(orderedIds);
}
