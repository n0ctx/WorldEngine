// 角色卡 / 玩家卡的档案初始值：按中文标签或字段 key 定位，逐字段走编辑页同一套保存。

import { getEditableProfileFields, parseProfileDefaults } from '../../backend/memory/state-memory-schema.js';
import { updateProfileDefault } from '../../backend/services/profile-defaults.js';
import { normalizeManualProfileValue } from '../../backend/services/state-memory.js';

function fail(message) {
  throw new Error(message);
}

export function profileView(worldId, entityType, profileDefaultsJson) {
  const defaults = parseProfileDefaults(profileDefaultsJson);
  const profile = {};
  for (const field of getEditableProfileFields(worldId, entityType)) {
    if (defaults[field.key] != null) profile[field.label] = defaults[field.key];
  }
  return profile;
}

export function describeProfileFields(worldId, entityType) {
  return getEditableProfileFields(worldId, entityType)
    .map((field) => `${field.label}（${field.key}，${field.kind === 'list' ? '列表' : '文本'}）`)
    .join('、') || '（无）';
}

function findProfileField(fields, name) {
  return fields.find((field) => field.key === name) ?? fields.find((field) => field.label === name);
}

function resolveProfileWrites(worldId, entityType, values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) fail('profile 必须是 { 字段标签或 key: 值 } 对象');
  const fields = getEditableProfileFields(worldId, entityType);
  const available = describeProfileFields(worldId, entityType);
  const writes = [];
  for (const [name, raw] of Object.entries(values)) {
    const field = findProfileField(fields, name);
    if (!field) fail(`没有档案字段 "${name}"。可用字段：${available}`);
    if (raw != null) {
      try {
        normalizeManualProfileValue(field, raw);
      } catch (err) {
        fail(`档案字段 ${field.label}：${err.message}`);
      }
    }
    writes.push([field.key, raw == null ? null : JSON.stringify(raw)]);
  }
  return writes;
}

/** 校验档案字段。创建前调用，避免卡片已落库后才发现字段写错。 */
export function assertProfileValues(worldId, entityType, values) {
  if (values) resolveProfileWrites(worldId, entityType, values);
}

/** 先校验全部字段，再逐字段写入。null、空文本、空列表表示清除。 */
export function applyProfileValues(kind, id, worldId, entityType, values) {
  if (!values) return;
  for (const [fieldKey, valueJson] of resolveProfileWrites(worldId, entityType, values)) {
    updateProfileDefault(kind, id, fieldKey, valueJson);
  }
}
