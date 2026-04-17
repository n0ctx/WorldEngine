import path from 'node:path';

import { getCharacterById } from './characters.js';
import { getWorldById } from './worlds.js';
import { getOrCreatePersona } from './personas.js';
import { getCharacterStateFieldsByWorldId } from '../db/queries/character-state-fields.js';
import { upsertCharacterStateValue } from '../db/queries/character-state-values.js';
import { getPersonaStateFieldsByWorldId } from '../db/queries/persona-state-fields.js';
import { upsertPersonaStateValue } from '../db/queries/persona-state-values.js';
import { getWorldStateFieldsByWorldId } from '../db/queries/world-state-fields.js';
import { upsertWorldStateValue } from '../db/queries/world-state-values.js';

function getFieldMap(fields) {
  return new Map(fields.map((field) => [field.field_key, field]));
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
    case 'list': {
      const parsedList = typeof value === 'string'
        ? value.split(/[,，、]/).map((item) => item.trim()).filter(Boolean)
        : value;
      if (!Array.isArray(parsedList)) return undefined;
      const items = parsedList.map(String).filter(Boolean);
      if (items.length === 0) return field.allow_empty ? [] : undefined;
      return items;
    }
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

export function updateCharacterDefaultStateValueValidated(characterId, fieldKey, valueJson) {
  const character = getCharacterById(characterId);
  if (!character) {
    throw new Error('角色不存在');
  }

  const fields = getCharacterStateFieldsByWorldId(character.world_id);
  const field = getFieldMap(fields).get(fieldKey);
  if (!field) {
    throw new Error('状态字段不存在');
  }

  return upsertCharacterStateValue(characterId, fieldKey, {
    defaultValueJson: normalizeStateValueJson(valueJson, field),
    touchUpdatedAt: false,
  });
}

export function resetCharacterStateValuesValidated(characterId) {
  const character = getCharacterById(characterId);
  if (!character) {
    throw new Error('角色不存在');
  }

  const fields = getCharacterStateFieldsByWorldId(character.world_id);
  for (const field of fields) {
    upsertCharacterStateValue(characterId, field.field_key, {
      runtimeValueJson: null,
      touchUpdatedAt: false,
      skipCreate: true,
    });
  }
}

export function updatePersonaDefaultStateValueValidated(worldId, fieldKey, valueJson) {
  const world = getWorldById(worldId);
  if (!world) {
    throw new Error('世界不存在');
  }

  const fields = getPersonaStateFieldsByWorldId(worldId);
  const field = getFieldMap(fields).get(fieldKey);
  if (!field) {
    throw new Error('状态字段不存在');
  }

  return upsertPersonaStateValue(worldId, fieldKey, {
    defaultValueJson: normalizeStateValueJson(valueJson, field),
    touchUpdatedAt: false,
  });
}

export function resetPersonaStateValuesValidated(worldId) {
  const world = getWorldById(worldId);
  if (!world) {
    throw new Error('世界不存在');
  }

  getOrCreatePersona(worldId);

  const fields = getPersonaStateFieldsByWorldId(worldId);
  for (const field of fields) {
    upsertPersonaStateValue(worldId, field.field_key, {
      runtimeValueJson: null,
      touchUpdatedAt: false,
      skipCreate: true,
    });
  }
}

export function updateWorldDefaultStateValueValidated(worldId, fieldKey, valueJson) {
  const world = getWorldById(worldId);
  if (!world) {
    throw new Error('世界不存在');
  }

  const fields = getWorldStateFieldsByWorldId(worldId);
  const field = getFieldMap(fields).get(fieldKey);
  if (!field) {
    throw new Error('状态字段不存在');
  }

  return upsertWorldStateValue(worldId, fieldKey, {
    defaultValueJson: normalizeStateValueJson(valueJson, field),
    touchUpdatedAt: false,
  });
}

export function resetWorldStateValuesValidated(worldId) {
  const world = getWorldById(worldId);
  if (!world) {
    throw new Error('世界不存在');
  }

  const fields = getWorldStateFieldsByWorldId(worldId);
  for (const field of fields) {
    upsertWorldStateValue(worldId, field.field_key, {
      runtimeValueJson: null,
      touchUpdatedAt: false,
      skipCreate: true,
    });
  }
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
