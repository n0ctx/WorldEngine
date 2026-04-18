import crypto from 'node:crypto';
import db from '../index.js';

/**
 * 创建正则规则，sort_order 默认取当前 MAX+1
 */
export function createRegexRule(data) {
  const id = crypto.randomUUID();
  const now = Date.now();
  const maxRow = db.prepare('SELECT MAX(sort_order) AS m FROM regex_rules').get();
  const sortOrder = data.sort_order ?? ((maxRow?.m ?? -1) + 1);

  db.prepare(`
    INSERT INTO regex_rules (id, name, enabled, pattern, replacement, flags, scope, world_id, mode, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.name,
    data.enabled ?? 1,
    data.pattern,
    data.replacement ?? '',
    data.flags ?? 'g',
    data.scope,
    data.world_id ?? null,
    data.mode ?? 'chat',
    sortOrder,
    now,
    now,
  );

  return getRegexRuleById(id);
}

/**
 * 根据 id 获取单条
 */
export function getRegexRuleById(id) {
  return db.prepare('SELECT * FROM regex_rules WHERE id = ?').get(id);
}

/**
 * 列出所有规则（管理界面用），支持可选 scope / worldId / mode 过滤
 * mode 仅对全局规则（world_id IS NULL）生效；worldId 过滤时返回全局 + 该 worldId 的规则
 */
export function listRegexRules({ scope, worldId, mode } = {}) {
  let sql = 'SELECT * FROM regex_rules';
  const conditions = [];
  const params = [];

  if (scope) {
    conditions.push('scope = ?');
    params.push(scope);
  }

  if (worldId !== undefined && worldId !== null) {
    conditions.push('(world_id IS NULL OR world_id = ?)');
    params.push(worldId);
  }

  if (mode) {
    conditions.push('(world_id IS NOT NULL OR mode = ?)');
    params.push(mode);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ' ORDER BY sort_order ASC, created_at ASC';

  return db.prepare(sql).all(...params);
}

/**
 * 运行时查询：给定 scope / worldId / mode，返回 enabled=1 的规则
 * 全局规则按 mode 过滤（'chat' | 'writing'）；世界级规则不受 mode 限制
 */
export function getEnabledRulesForRuntime(scope, worldId, mode = 'chat') {
  return db.prepare(`
    SELECT * FROM regex_rules
    WHERE enabled = 1
      AND scope = ?
      AND (world_id IS NULL OR world_id = ?)
      AND (world_id IS NOT NULL OR mode = ?)
    ORDER BY sort_order ASC, created_at ASC
  `).all(scope, worldId ?? null, mode);
}

/**
 * 部分更新，白名单：name / enabled / pattern / replacement / flags / scope / world_id / mode
 */
export function updateRegexRule(id, patch) {
  const allowed = ['name', 'enabled', 'pattern', 'replacement', 'flags', 'scope', 'world_id', 'mode'];
  const sets = [];
  const values = [];

  for (const field of allowed) {
    if (field in patch) {
      sets.push(`${field} = ?`);
      values.push(patch[field]);
    }
  }

  if (sets.length === 0) return getRegexRuleById(id);

  sets.push('updated_at = ?');
  values.push(Date.now(), id);
  db.prepare(`UPDATE regex_rules SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getRegexRuleById(id);
}

/**
 * 硬删除
 */
export function deleteRegexRule(id) {
  return db.prepare('DELETE FROM regex_rules WHERE id = ?').run(id);
}

/**
 * 批量重排序，传入 [{id, sort_order}, ...] 数组
 */
export function reorderRegexRules(items) {
  const stmt = db.prepare('UPDATE regex_rules SET sort_order = ?, updated_at = ? WHERE id = ?');
  const now = Date.now();
  const tx = db.transaction(() => {
    for (const item of items) {
      stmt.run(item.sort_order, now, item.id);
    }
  });
  tx();
}
