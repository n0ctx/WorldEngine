/**
 * 世界卡的档案默认值：开场时间、开场地点。开场时间必填：新建世界时必须给，之后不能清空。
 * 存在 worlds.profile_defaults_json，新会话建立基础实体时带入世界档案；已有会话值不覆盖。
 */

import { getWorldById } from '../db/queries/worlds.js';
import { setWorldProfileDefaults } from '../db/queries/worlds.js';
import { parseProfileDefaults } from '../memory/state-memory-schema.js';
import { parseWorldDate } from '../utils/world-date.js';
import { isPlaceholderValue } from '../memory/state-memory-schema.js';

const WORLD_PROFILE_DEFAULT_FIELDS = [
  { key: 'time', label: '开场时间', type: 'datetime' },
  { key: 'location', label: '开场地点', type: 'text' },
];

const OPENING_TIME_REQUIRED = '开场时间为必填项';

function requireWorld(worldId) {
  const world = getWorldById(worldId);
  if (!world) throw new Error('世界不存在');
  return world;
}

/** 导入时只留合法的开场时间、开场地点；缺字段和坏值都丢掉。 */
export function sanitizeWorldProfileDefaults(value) {
  const parsed = parseProfileDefaults(value);
  const defaults = {};
  for (const field of WORLD_PROFILE_DEFAULT_FIELDS) {
    if (!(field.key in parsed)) continue;
    try {
      const normalized = normalizeWorldProfileValue(field.key, parsed[field.key]);
      if (normalized) defaults[field.key] = normalized;
    } catch {
      // 旧卡或坏值丢掉，不阻断导入
    }
  }
  return defaults;
}

function storedValue(defaults, key) {
  const value = defaults[key];
  return typeof value === 'string' && value ? value : null;
}

/** 世界卡的开场日期（解析后的世界日期）；没填或格式不对返回 null（旧世界、导入的旧卡）。 */
export function getWorldOpeningDate(worldId) {
  return parseWorldDate(parseProfileDefaults(getWorldById(worldId)?.profile_defaults_json).time);
}

/** 编辑页的行：{ field_key, label, type, value_json } */
export function listWorldProfileDefaultRows(worldId) {
  const defaults = parseProfileDefaults(requireWorld(worldId).profile_defaults_json);
  return WORLD_PROFILE_DEFAULT_FIELDS.map((field) => {
    const value = storedValue(defaults, field.key);
    return { field_key: field.key, label: field.label, type: field.type, value_json: value == null ? null : JSON.stringify(value) };
  });
}

function normalizeWorldProfileValue(fieldKey, raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string') throw new Error(fieldKey === 'time' ? '时间格式无效' : '地点须为文本');
  const trimmed = raw.trim();
  if (!trimmed || isPlaceholderValue(trimmed)) return null;
  if (fieldKey === 'time' && !parseWorldDate(trimmed)) throw new Error('时间格式无效，用 YYYY-MM-DD 或 YYYY-MM-DDTHH:mm');
  return trimmed;
}

/** 新建世界时的档案默认值 { time, location? }：开场时间必填，坏值直接报错。 */
export function buildNewWorldProfileDefaults(patch) {
  const input = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
  const defaults = {};
  for (const field of WORLD_PROFILE_DEFAULT_FIELDS) {
    const value = normalizeWorldProfileValue(field.key, input[field.key]);
    if (value) defaults[field.key] = value;
  }
  if (!defaults.time) throw new Error(OPENING_TIME_REQUIRED);
  return defaults;
}

/** 写一个字段。null、空文本表示清除（开场时间不能清除）。 */
export function updateWorldProfileDefault(worldId, fieldKey, valueJson) {
  let raw = null;
  if (valueJson != null) {
    try {
      raw = JSON.parse(valueJson);
    } catch {
      throw new Error('value_json 格式无效');
    }
  }
  updateWorldProfileDefaults(worldId, { [fieldKey]: raw });
}

/** 一次写多个字段 { time?, location? }。null、空文本表示清除（开场时间不能清除）；全部校验通过才落库。 */
export function updateWorldProfileDefaults(worldId, patch) {
  for (const fieldKey of Object.keys(patch)) {
    if (!WORLD_PROFILE_DEFAULT_FIELDS.some((item) => item.key === fieldKey)) {
      throw new Error(`档案字段不可编辑: ${fieldKey}`);
    }
  }
  const world = requireWorld(worldId);
  const defaults = parseProfileDefaults(world.profile_defaults_json);
  for (const [fieldKey, raw] of Object.entries(patch)) {
    const value = normalizeWorldProfileValue(fieldKey, raw);
    if (value == null && fieldKey === 'time') throw new Error(OPENING_TIME_REQUIRED);
    if (value == null) delete defaults[fieldKey];
    else defaults[fieldKey] = value;
  }
  setWorldProfileDefaults(worldId, JSON.stringify(defaults));
}
