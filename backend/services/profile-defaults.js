/**
 * profile-defaults.js — 角色卡 / 人设的档案初始值（身份、外貌、人格；人设没有人格）。
 *
 * 存在 characters / personas.profile_defaults_json（{字段key: 值}），在编辑页「状态初始值」里逐字段编辑；
 * 会话里建立对应实体时带入档案（memory/state-memory-apply.js seedProfileDefaults），AI 不必再补这些字段。
 * 出错抛 Error，消息等于 notFoundMessage 时路由映射 404，其余 400。
 */

import { getCharacterById, setCharacterProfileDefaults } from '../db/queries/characters.js';
import { getPersonaById, setPersonaProfileDefaults } from '../db/queries/personas.js';
import { getEditableProfileFields, parseProfileDefaults } from '../memory/state-memory-schema.js';
import { normalizeManualProfileValue } from './state-memory.js';

export const PROFILE_DEFAULT_OWNERS = {
  character: { entityType: 'character', load: getCharacterById, save: setCharacterProfileDefaults, notFoundMessage: '角色不存在' },
  persona: { entityType: 'player', load: getPersonaById, save: setPersonaProfileDefaults, notFoundMessage: '玩家卡不存在' },
};

function requireOwnerRow(kind, id) {
  const owner = PROFILE_DEFAULT_OWNERS[kind];
  const row = owner.load(id);
  if (!row) throw new Error(owner.notFoundMessage);
  return { owner, row };
}

/** 编辑页的行：{ field_key, label, group, type: 'text' | 'list', value_json }，按字段定义顺序 */
export function listProfileDefaultRows(kind, id) {
  const { owner, row } = requireOwnerRow(kind, id);
  const defaults = parseProfileDefaults(row.profile_defaults_json);
  return getEditableProfileFields(row.world_id, owner.entityType).map((field) => ({
    field_key: field.key,
    label: field.label,
    group: field.group ?? '',
    type: field.kind,
    value_json: defaults[field.key] == null ? null : JSON.stringify(defaults[field.key]),
  }));
}

function parseValueJson(valueJson) {
  if (valueJson == null) return null;
  try {
    return JSON.parse(valueJson);
  } catch {
    throw new Error('value_json 格式无效');
  }
}

/** 写一个字段的初始值；null、空文本、空列表都表示清除。 */
export function updateProfileDefault(kind, id, fieldKey, valueJson) {
  const { owner, row } = requireOwnerRow(kind, id);
  const field = getEditableProfileFields(row.world_id, owner.entityType).find((f) => f.key === fieldKey);
  if (!field) throw new Error(`档案字段不可编辑: ${fieldKey}`);

  const defaults = parseProfileDefaults(row.profile_defaults_json);
  const raw = parseValueJson(valueJson);
  const clearing = raw == null || (typeof raw === 'string' && raw.trim() === '');
  const value = clearing ? null : normalizeManualProfileValue(field, raw);
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) delete defaults[fieldKey];
  else defaults[fieldKey] = value;
  owner.save(id, JSON.stringify(defaults));
}
