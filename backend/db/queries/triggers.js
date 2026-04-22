import crypto from 'node:crypto';
import db from '../index.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

function parseAction(row) {
  if (!row) return undefined;
  return { ...row, params: row.params ? JSON.parse(row.params) : {} };
}

// ─── triggers ────────────────────────────────────────────────────────────────

/**
 * 创建 trigger
 * @param {{ world_id: string, name: string, enabled?: number, one_shot?: number }} data
 */
export function createTrigger(data) {
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(`
    INSERT INTO triggers (id, world_id, name, enabled, one_shot, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.world_id,
    data.name,
    data.enabled ?? 1,
    data.one_shot ?? 0,
    now,
    now,
  );
  return getTriggerById(id);
}

/**
 * 根据 id 获取 trigger
 */
export function getTriggerById(id) {
  return db.prepare('SELECT * FROM triggers WHERE id = ?').get(id);
}

/**
 * 按世界列出所有 trigger，按 created_at ASC 排序
 */
export function listTriggersByWorld(worldId) {
  return db.prepare('SELECT * FROM triggers WHERE world_id = ? ORDER BY created_at ASC').all(worldId);
}

/**
 * 更新 trigger
 * @param {string} id
 * @param {{ name?: string, enabled?: number, one_shot?: number, last_triggered_round?: number }} patch
 */
export function updateTrigger(id, patch) {
  const allowed = ['name', 'enabled', 'one_shot', 'last_triggered_round'];
  const sets = [];
  const vals = [];

  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      sets.push(`${key} = ?`);
      vals.push(patch[key]);
    }
  }

  if (sets.length === 0) return getTriggerById(id);

  sets.push('updated_at = ?');
  vals.push(Date.now());
  vals.push(id);

  db.prepare(`UPDATE triggers SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return getTriggerById(id);
}

/**
 * 删除 trigger（级联删除 conditions 和 action）
 */
export function deleteTrigger(id) {
  return db.prepare('DELETE FROM triggers WHERE id = ?').run(id);
}

// ─── trigger_conditions ──────────────────────────────────────────────────────

/**
 * 事务内替换 trigger 的所有条件
 * @param {string} triggerId
 * @param {Array<{ target_field: string, operator: string, value: string }>} conditions
 */
export function replaceTriggerConditions(triggerId, conditions) {
  const del = db.prepare('DELETE FROM trigger_conditions WHERE trigger_id = ?');
  const ins = db.prepare(
    'INSERT INTO trigger_conditions (id, trigger_id, target_field, operator, value) VALUES (?, ?, ?, ?, ?)',
  );

  db.transaction(() => {
    del.run(triggerId);
    for (const c of conditions) {
      ins.run(crypto.randomUUID(), triggerId, c.target_field, c.operator, c.value);
    }
  })();
}

/**
 * 获取指定 trigger 的所有条件
 */
export function listConditionsByTrigger(triggerId) {
  return db.prepare('SELECT * FROM trigger_conditions WHERE trigger_id = ?').all(triggerId);
}

// ─── trigger_actions ─────────────────────────────────────────────────────────

/**
 * 插入或更新 trigger 的动作（每个 trigger 最多一条）
 * @param {string} triggerId
 * @param {string} actionType
 * @param {object} params
 */
export function upsertTriggerAction(triggerId, actionType, params) {
  const id = crypto.randomUUID();
  const paramsJson = JSON.stringify(params ?? {});

  db.prepare(`
    INSERT INTO trigger_actions (id, trigger_id, action_type, params)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(trigger_id) DO UPDATE SET
      action_type = excluded.action_type,
      params = excluded.params
  `).run(id, triggerId, actionType, paramsJson);

  return parseAction(db.prepare('SELECT * FROM trigger_actions WHERE trigger_id = ?').get(triggerId));
}

/**
 * 获取指定 trigger 的动作，params 自动 JSON.parse
 */
export function getActionByTriggerId(triggerId) {
  return parseAction(db.prepare('SELECT * FROM trigger_actions WHERE trigger_id = ?').get(triggerId));
}

/**
 * 合并更新 action 的 params 字段
 * @param {string} triggerId
 * @param {object} paramsPatch
 * @returns {object|null}
 */
export function updateActionParams(triggerId, paramsPatch) {
  const row = db.prepare('SELECT * FROM trigger_actions WHERE trigger_id = ?').get(triggerId);
  if (!row) return null;

  const existing = row.params ? JSON.parse(row.params) : {};
  const merged = { ...existing, ...paramsPatch };
  db.prepare('UPDATE trigger_actions SET params = ? WHERE trigger_id = ?').run(JSON.stringify(merged), triggerId);

  return parseAction(db.prepare('SELECT * FROM trigger_actions WHERE trigger_id = ?').get(triggerId));
}

/**
 * 获取指定世界中所有已启用、action_type='inject_prompt' 的动作
 * JS 层过滤：mode='persistent' 或 rounds_remaining > 0
 */
export function getActiveInjectPromptActions(worldId) {
  const rows = db.prepare(`
    SELECT ta.*
    FROM trigger_actions ta
    JOIN triggers t ON t.id = ta.trigger_id
    WHERE t.world_id = ?
      AND t.enabled = 1
      AND ta.action_type = 'inject_prompt'
  `).all(worldId);

  return rows
    .map(parseAction)
    .filter(a => a.params.mode === 'persistent' || (a.params.rounds_remaining != null && a.params.rounds_remaining > 0));
}
