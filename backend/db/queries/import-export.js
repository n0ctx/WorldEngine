/**
 * import-export.js — 角色卡 / 玩家卡 / 世界卡 / 全局设置导入导出用到的 SQL
 *
 * 导出：按导出格式需要的列读取；状态字段未做 JSON 解析，由服务层处理。
 * 导入：insert*Rows 接收按列名组织的行对象，缺失的列写 NULL；多行写入复用同一条预编译语句并在事务内执行。
 * 服务层用 runImportTransaction 把一次导入（含头像写盘）包在同一个事务里，嵌套调用会成为 SAVEPOINT。
 */

import db from '../index.js';

const STATE_FIELD_EXPORT_COLUMNS = 'field_key, label, type, description, default_value, update_mode, enum_options, min_value, max_value, allow_empty, update_instruction, prefix, unit, table_columns, sort_order';
const STATE_FIELD_COLUMNS = [
  'id', 'world_id', 'field_key', 'label', 'type', 'description',
  'default_value', 'update_mode',
  'enum_options', 'min_value', 'max_value', 'allow_empty',
  'update_instruction', 'prefix', 'unit', 'table_columns', 'sort_order', 'created_at', 'updated_at',
];
const STATE_FIELD_TABLES = {
  world: 'world_state_fields',
  character: 'character_state_fields',
  persona: 'persona_state_fields',
};
// 各类状态值的表与归属列（world 按 world_id，character / persona 按各自 id）
const STATE_VALUE_TABLES = {
  world: { table: 'world_state_values', owner: 'world_id' },
  character: { table: 'character_state_values', owner: 'character_id' },
  persona: { table: 'persona_state_values', owner: 'persona_id' },
};
const STATE_VALUE_COLUMNS = {
  world: ['id', 'world_id', 'field_key', 'default_value_json', 'runtime_value_json', 'updated_at'],
  character: ['id', 'character_id', 'field_key', 'default_value_json', 'runtime_value_json', 'updated_at'],
  persona: ['id', 'persona_id', 'world_id', 'field_key', 'default_value_json', 'runtime_value_json', 'updated_at'],
};

function insertRows(table, columns, rows) {
  if (rows.length === 0) return;
  const insert = db.prepare(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
  );
  db.transaction(() => {
    for (const row of rows) insert.run(...columns.map((column) => row[column] ?? null));
  })();
}

/** 在同一连接上原子执行一次导入；callback 的返回值原样返回 */
export function runImportTransaction(callback) {
  return db.transaction(callback)();
}

// ─── 导出 ────────────────────────────────────────────────────────────────────

/** kind: 'world' | 'character' | 'persona'；返回 [{ field_key, value_json }] */
export function listStateValuesForExport(kind, ownerId) {
  const { table, owner } = STATE_VALUE_TABLES[kind];
  return db.prepare(
    `SELECT field_key, default_value_json AS value_json FROM ${table} WHERE ${owner} = ?`,
  ).all(ownerId);
}

/** kind: 'world' | 'character' | 'persona'；按 sort_order 升序，enum_options / table_columns 保持 JSON 字符串 */
export function listStateFieldsForExport(kind, worldId) {
  return db.prepare(
    `SELECT ${STATE_FIELD_EXPORT_COLUMNS} FROM ${STATE_FIELD_TABLES[kind]} WHERE world_id = ? ORDER BY sort_order ASC`,
  ).all(worldId);
}

export function listPromptEntriesForExport(worldId) {
  return db.prepare(
    'SELECT id, title, description, content, keywords, keyword_scope, trigger_type, condition_logic, keyword_logic, active_turns, group_name, sort_order, token, enabled FROM world_prompt_entries WHERE world_id = ? ORDER BY sort_order ASC',
  ).all(worldId);
}

export function listCharactersForExport(worldId) {
  return db.prepare(
    'SELECT * FROM characters WHERE world_id = ? ORDER BY sort_order ASC, created_at ASC',
  ).all(worldId);
}

export function listPersonasForExport(worldId) {
  return db.prepare(
    'SELECT id, name, description, system_prompt, avatar_path, sort_order FROM personas WHERE world_id = ? ORDER BY sort_order ASC, created_at ASC, id ASC',
  ).all(worldId);
}

/** 导出单个玩家卡用的行；personaId 为 null 时取该世界最早创建的 persona */
export function getPersonaForExport(personaId, worldId = null) {
  return db.prepare(`
    SELECT id, name, description, system_prompt, avatar_path
    FROM personas
    WHERE id = COALESCE(?, (
      SELECT id FROM personas WHERE world_id = ? ORDER BY created_at ASC, id ASC LIMIT 1
    ))
  `).get(personaId, worldId);
}

export function listWorldIdsForExport() {
  return db.prepare('SELECT id FROM worlds ORDER BY created_at ASC, id ASC').all().map((r) => r.id);
}

export function listGlobalCssSnippetsForExport(mode) {
  return db.prepare(
    'SELECT name, content, enabled, mode, sort_order FROM custom_css_snippets WHERE mode = ? ORDER BY sort_order ASC, created_at ASC',
  ).all(mode);
}

export function listGlobalRegexRulesForExport(mode) {
  return db.prepare(
    `SELECT name, pattern, replacement, scope, mode, enabled, sort_order
     FROM regex_rules WHERE world_id IS NULL AND mode = ? ORDER BY sort_order ASC`,
  ).all(mode);
}

// ─── 导入 ────────────────────────────────────────────────────────────────────

/** kind: 'world' | 'character' | 'persona'；返回该世界已有的状态字段 key 集合 */
export function getStateFieldKeySet(kind, worldId) {
  return new Set(
    db.prepare(`SELECT field_key FROM ${STATE_FIELD_TABLES[kind]} WHERE world_id = ?`)
      .all(worldId)
      .map((r) => r.field_key),
  );
}

export function getNextCharacterSortOrder(worldId) {
  const row = db.prepare('SELECT MAX(sort_order) AS m FROM characters WHERE world_id = ?').get(worldId);
  return (row?.m ?? -1) + 1;
}

export function getNextPersonaSortOrder(worldId) {
  const row = db.prepare('SELECT MAX(sort_order) AS max_sort FROM personas WHERE world_id = ?').get(worldId);
  return (row?.max_sort ?? -1) + 1;
}

export function insertWorldRow(row) {
  insertRows('worlds', [
    'id', 'name', 'description', 'temperature', 'max_tokens', 'cover_path', 'accent_color', 'accent_source',
    'created_at', 'updated_at',
  ], [row]);
}

export function insertPromptEntryRows(rows) {
  insertRows('world_prompt_entries', [
    'id', 'world_id', 'title', 'description', 'content', 'keywords', 'keyword_scope', 'trigger_type',
    'condition_logic', 'keyword_logic', 'active_turns', 'group_name', 'sort_order', 'token', 'enabled',
    'created_at', 'updated_at',
  ], rows);
}

/** kind: 'world' | 'character' | 'persona' */
export function insertStateFieldRows(kind, rows) {
  insertRows(STATE_FIELD_TABLES[kind], STATE_FIELD_COLUMNS, rows);
}

/** kind: 'world' | 'character' | 'persona'；runtime_value_json 不传即为 NULL */
export function insertStateValueRows(kind, rows) {
  insertRows(STATE_VALUE_TABLES[kind].table, STATE_VALUE_COLUMNS[kind], rows);
}

export function insertCharacterRows(rows) {
  insertRows('characters', [
    'id', 'world_id', 'name', 'description', 'system_prompt', 'post_prompt', 'first_message', 'avatar_path',
    'sort_order', 'created_at', 'updated_at',
  ], rows);
}

export function insertPersonaRows(rows) {
  insertRows('personas', [
    'id', 'world_id', 'name', 'description', 'system_prompt', 'avatar_path', 'sort_order', 'created_at', 'updated_at',
  ], rows);
}

/** 用导入的行替换某模式下的全局 CSS 片段与全局正则规则 */
export function replaceGlobalSettingsRows(mode, cssRows, regexRows) {
  db.prepare('DELETE FROM custom_css_snippets WHERE mode = ?').run(mode);
  db.prepare('DELETE FROM regex_rules WHERE world_id IS NULL AND mode = ?').run(mode);
  insertRows('custom_css_snippets', [
    'id', 'name', 'content', 'enabled', 'mode', 'sort_order', 'created_at', 'updated_at',
  ], cssRows);
  insertRows('regex_rules', [
    'id', 'world_id', 'name', 'pattern', 'replacement', 'scope', 'mode', 'enabled', 'sort_order',
    'created_at', 'updated_at',
  ], regexRows);
}
