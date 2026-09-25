import path from 'node:path';

import { getCharacterById } from './characters.js';
import { getWorldById } from './worlds.js';
import { getOrCreatePersona } from './personas.js';
import { getPersonaById } from '../db/queries/personas.js';
import { getCharacterStateFieldsByWorldId } from '../db/queries/character-state-fields.js';
import { upsertCharacterStateValue } from '../db/queries/character-state-values.js';
import { getPersonaStateFieldsByWorldId } from '../db/queries/persona-state-fields.js';
import {
  upsertPersonaStateValue,
  upsertPersonaStateValueByPersonaId,
} from '../db/queries/persona-state-values.js';
import { getWorldStateFieldsByWorldId } from '../db/queries/world-state-fields.js';
import { upsertWorldStateValue } from '../db/queries/world-state-values.js';

function getFieldMap(fields) {
  return new Map(fields.map((field) => [field.field_key, field]));
}

// 把"状态字段不存在"升级成带 field_key + 已定义列表 + 操作提示的诊断信息,
// 避免子代理 LLM 拿到无信息错误后用同样入参重试。保留 "状态字段不存在" 子串以保兼容旧 grep / 测试。
function makeMissingFieldError(target, fieldKey, fields) {
  const defined = fields.map((f) => f.field_key);
  const list = defined.length ? defined.join(', ') : '(空)';
  const hint = `如需新增字段,先在 world-card.update 的 stateFieldOps 里 create 一条 target='${target}' 的字段定义,再回到本卡写值。`;
  return new Error(`状态字段不存在: field_key='${fieldKey}' (target=${target})。当前已定义: [${list}]。${hint}`);
}

function parseValueJson(valueJson) {
  if (valueJson === null) {
    return null;
  }

  if (typeof valueJson !== 'string') {
    throw new Error('value_json 必须为 JSON 字符串或 null');
  }

  try {
    return JSON.parse(valueJson);
  } catch {
    throw new Error('value_json 不是合法 JSON');
  }
}

// datetime: 年份允许任意位正整数（参见 STATEVALUE-CHEATSHEET.md），月/日/时/分各 2 位
const DATETIME_RE = /^\d+-\d{2}-\d{2}T\d{2}:\d{2}$/;

function validateListStateValue(value, field) {
  const items = typeof value === 'string'
    ? value.split(/[,，、]/).map((item) => item.trim()).filter(Boolean)
    : value;
  if (!Array.isArray(items)) return undefined;

  const validated = items.map(String).filter(Boolean);
  if (validated.length === 0) return field.allow_empty ? [] : undefined;
  return validated;
}

function validateTableStateValue(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  let columns = field.table_columns;
  if (typeof columns === 'string') {
    try { columns = JSON.parse(columns || '[]'); } catch { columns = []; }
  }
  if (!Array.isArray(columns) || columns.length === 0) return undefined;

  const result = {};
  for (const column of columns) {
    const raw = value[column.key];
    if (raw === '' || raw == null) continue;

    const num = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(num)) return undefined;
    if (column.min != null && column.min !== '' && num < Number(column.min)) return undefined;
    if (column.max != null && column.max !== '' && num > Number(column.max)) return undefined;
    result[column.key] = num;
  }

  if (Object.keys(result).length === 0) return field.allow_empty ? {} : undefined;
  return result;
}

export function validateStateValue(value, field) {
  if (value === null || value === undefined || value === '') {
    return field.allow_empty ? null : undefined;
  }

  switch (field.type) {
    case 'text':
      return typeof value === 'string' ? value : undefined;
    case 'number': {
      const num = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(num)) return undefined;
      if (field.min_value != null && num < field.min_value) return undefined;
      if (field.max_value != null && num > field.max_value) return undefined;
      return num;
    }
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      return undefined;
    case 'enum':
      if (typeof value !== 'string') return undefined;
      if (field.enum_options && !field.enum_options.includes(value)) return undefined;
      return value;
    case 'datetime':
      return typeof value === 'string' && DATETIME_RE.test(value) ? value : undefined;
    case 'list':
      return validateListStateValue(value, field);
    case 'table':
      return validateTableStateValue(value, field);
    default:
      return undefined;
  }
}

function normalizeStateValueJson(valueJson, field) {
  const parsed = parseValueJson(valueJson);
  const validated = validateStateValue(parsed, field);

  if (validated === undefined) {
    throw new Error(`字段 ${field.field_key} 的值不符合类型约束`);
  }

  return validated === null ? null : JSON.stringify(validated);
}

function requireField(fields, fieldKey, target) {
  const field = getFieldMap(fields).get(fieldKey);
  if (!field) throw makeMissingFieldError(target, fieldKey, fields);
  return field;
}

function requireWorld(worldId) {
  if (!getWorldById(worldId)) throw new Error('世界不存在');
}

function requirePersonaInWorld(personaId, worldId) {
  requireWorld(worldId);
  const persona = getPersonaById(personaId);
  if (!persona || persona.world_id !== worldId) throw new Error('persona 不属于该世界');
}

/** 清空每个字段已有的运行时值（不新建行、不刷新 updated_at） */
function clearRuntimeValues(fields, upsert) {
  for (const field of fields) {
    upsert(field.field_key, { runtimeValueJson: null, touchUpdatedAt: false, skipCreate: true });
  }
}

function defaultValuePatch(valueJson, field) {
  return { defaultValueJson: normalizeStateValueJson(valueJson, field), touchUpdatedAt: false };
}

export function updateCharacterDefaultStateValueValidated(characterId, fieldKey, valueJson) {
  const character = getCharacterById(characterId);
  if (!character) {
    throw new Error('角色不存在');
  }

  const field = requireField(getCharacterStateFieldsByWorldId(character.world_id), fieldKey, 'character');
  return upsertCharacterStateValue(characterId, fieldKey, defaultValuePatch(valueJson, field));
}

export function resetCharacterStateValuesValidated(characterId) {
  const character = getCharacterById(characterId);
  if (!character) {
    throw new Error('角色不存在');
  }

  clearRuntimeValues(
    getCharacterStateFieldsByWorldId(character.world_id),
    (fieldKey, patch) => upsertCharacterStateValue(characterId, fieldKey, patch),
  );
}

export function updatePersonaDefaultStateValueValidated(worldId, fieldKey, valueJson) {
  requireWorld(worldId);
  const field = requireField(getPersonaStateFieldsByWorldId(worldId), fieldKey, 'persona');
  return upsertPersonaStateValue(worldId, fieldKey, defaultValuePatch(valueJson, field));
}

export function resetPersonaStateValuesValidated(worldId) {
  requireWorld(worldId);
  getOrCreatePersona(worldId);
  clearRuntimeValues(
    getPersonaStateFieldsByWorldId(worldId),
    (fieldKey, patch) => upsertPersonaStateValue(worldId, fieldKey, patch),
  );
}

export function updatePersonaDefaultStateValueByPersonaIdValidated(personaId, worldId, fieldKey, valueJson) {
  requirePersonaInWorld(personaId, worldId);
  const field = requireField(getPersonaStateFieldsByWorldId(worldId), fieldKey, 'persona');
  return upsertPersonaStateValueByPersonaId(personaId, worldId, fieldKey, defaultValuePatch(valueJson, field));
}

export function resetPersonaStateValuesByPersonaIdValidated(personaId, worldId) {
  requirePersonaInWorld(personaId, worldId);
  clearRuntimeValues(
    getPersonaStateFieldsByWorldId(worldId),
    (fieldKey, patch) => upsertPersonaStateValueByPersonaId(personaId, worldId, fieldKey, patch),
  );
}

export function updateWorldDefaultStateValueValidated(worldId, fieldKey, valueJson) {
  requireWorld(worldId);
  const field = requireField(getWorldStateFieldsByWorldId(worldId), fieldKey, 'world');
  return upsertWorldStateValue(worldId, fieldKey, defaultValuePatch(valueJson, field));
}

export function resetWorldStateValuesValidated(worldId) {
  requireWorld(worldId);
  clearRuntimeValues(
    getWorldStateFieldsByWorldId(worldId),
    (fieldKey, patch) => upsertWorldStateValue(worldId, fieldKey, patch),
  );
}

export function resolveUploadPath(relativePath, uploadsDir) {
  if (!relativePath || typeof relativePath !== 'string') {
    return null;
  }

  const normalized = path.posix.normalize(relativePath).replace(/^\/+/, '');
  if (!normalized || normalized.startsWith('..')) {
    return null;
  }

  const absPath = path.resolve(uploadsDir, normalized);
  if (!absPath.startsWith(`${uploadsDir}${path.sep}`)) {
    return null;
  }

  return absPath;
}
