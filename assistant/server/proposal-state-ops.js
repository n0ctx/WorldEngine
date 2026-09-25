/**
 * 提案里状态字段定义（stateFieldOps）与状态默认值（stateValueOps）的归一化和校验。
 */

import {
  normalizeString, normalizeEntityId, normalizeEnabled, normalizeNumberOrNull, normalizeStringArrayOrNull, pickAllowed,
} from './proposal-values.js';

const VALID_STATE_TYPES = new Set(['number', 'text', 'enum', 'list', 'boolean', 'datetime', 'table']);
const COLUMN_KEY_RE = /^[a-zA-Z0-9_]+$/;
const VALID_UPDATE_MODES = new Set(['llm_auto', 'manual']);
const ISO_LOCAL_DATETIME_RE = /^\d+-\d{2}-\d{2}T\d{2}:\d{2}$/;

const STATE_TARGETS_BY_PROPOSAL_TYPE = {
  'world-card': new Set(['world', 'persona', 'character']),
  'character-card': new Set(),
  'persona-card': new Set(),
};
const STATE_VALUE_TARGETS_BY_PROPOSAL_TYPE = {
  'world-card': new Set(),
  'character-card': new Set(['character']),
  'persona-card': new Set(['persona']),
};

const STATE_FIELD_KEYS = [
  'field_key', 'label', 'type', 'description', 'default_value',
  'update_mode', 'update_instruction',
  'enum_options', 'min_value', 'max_value', 'allow_empty',
  'prefix', 'table_columns', 'nearby_enabled',
];

function normalizeStateFieldOps(rawOps, type) {
  if (rawOps == null) return [];
  if (!Array.isArray(rawOps)) throw new Error('提案格式错误：stateFieldOps 必须是数组');
  const allowedTargets = STATE_TARGETS_BY_PROPOSAL_TYPE[type];
  if (allowedTargets && allowedTargets.size === 0 && rawOps.length > 0) {
    throw new Error(`提案格式错误：${type} 不支持 stateFieldOps；状态字段的创建、修改、删除只能在 world-card 中进行`);
  }
  return rawOps.map((raw, idx) => normalizeStateFieldOp(raw, idx, allowedTargets));
}

function normalizeStateFieldOp(raw, idx, allowedTargets) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`提案格式错误：stateFieldOps[${idx}] 必须是对象`);
  const op = normalizeString(raw.op);
  if (!['create', 'update', 'delete'].includes(op)) throw new Error(`提案格式错误：stateFieldOps[${idx}].op 非法`);
  const target = normalizeString(raw.target);
  if (!target || !allowedTargets.has(target)) throw new Error(`提案格式错误：stateFieldOps[${idx}].target 非法`);
  if (op === 'delete') return normalizeStateFieldDelete(raw, idx, op, target);
  if (op === 'update') return normalizeStateFieldUpdate(raw, idx, op, target);
  return normalizeStateFieldCreate(raw, idx, op, target);
}

function normalizeStateFieldDelete(raw, idx, op, target) {
  const id = normalizeEntityId(raw.id);
  if (!id) throw new Error(`提案格式错误：stateFieldOps[${idx}].id 缺失`);
  return { op, target, id };
}

function normalizeStateFieldUpdate(raw, idx, op, target) {
  const id = normalizeEntityId(raw.id);
  if (!id) throw new Error(`提案格式错误：stateFieldOps[${idx}].id 缺失`);
  const data = pickAllowed(raw, STATE_FIELD_KEYS);
  const normalized = { op, target, id };
  if ('type' in data && VALID_STATE_TYPES.has(data.type)) normalized.type = data.type;
  normalizeStateFieldCommonProperties(data, normalized, false);
  normalizeStateFieldConstraints(data, normalized, idx);
  normalizeNearbyEnabled(data, normalized, target, idx);
  // 仅在本次 update 显式带上 type 时校验类型相关约束；缺省时留给后续业务层。
  if ('type' in data) validateStateFieldType(normalized, data.type, idx, 'default_value' in data, 'update');
  return normalized;
}

function normalizeStateFieldCreate(raw, idx, op, target) {
  let fieldKey = normalizeString(raw.field_key);
  if (fieldKey && target === 'persona' && !fieldKey.endsWith('_user')) fieldKey += '_user';
  else if (fieldKey && target === 'character' && !fieldKey.endsWith('_char')) fieldKey += '_char';
  const label = normalizeString(raw.label);
  const fieldType = normalizeString(raw.type);
  if (!fieldKey) throw new Error(`提案格式错误：stateFieldOps[${idx}].field_key 缺失`);
  if (!label) throw new Error(`提案格式错误：stateFieldOps[${idx}].label 缺失`);
  if (!VALID_STATE_TYPES.has(fieldType)) throw new Error(`提案格式错误：stateFieldOps[${idx}].type 非法`);
  const normalized = { op, target, field_key: fieldKey, label, type: fieldType };
  normalizeStateFieldCommonProperties(raw, normalized, true);
  normalizeStateFieldConstraints(raw, normalized, idx);
  normalizeNearbyEnabled(raw, normalized, target, idx);
  validateStateFieldType(normalized, fieldType, idx, true, 'create');
  return normalized;
}

function normalizeStateFieldCommonProperties(data, normalized, includeDefaults) {
  if (!includeDefaults && 'label' in data) normalized.label = String(data.label ?? '');
  if (includeDefaults || 'description' in data) normalized.description = String(data.description ?? '');
  if (includeDefaults || 'default_value' in data) normalized.default_value = data.default_value == null ? null : String(data.default_value);
  if (includeDefaults || 'update_mode' in data) {
    if (VALID_UPDATE_MODES.has(data.update_mode)) normalized.update_mode = data.update_mode;
    else if (includeDefaults) normalized.update_mode = 'manual';
  }
  if (includeDefaults || 'update_instruction' in data) normalized.update_instruction = String(data.update_instruction ?? '');
  if (includeDefaults || 'allow_empty' in data) normalized.allow_empty = normalizeEnabled(data.allow_empty);
}

function normalizeStateFieldConstraints(data, normalized, idx) {
  if ('enum_options' in data) normalized.enum_options = normalizeStringArrayOrNull(data.enum_options);
  if ('min_value' in data) normalized.min_value = normalizeNumberOrNull(data.min_value);
  if ('max_value' in data) normalized.max_value = normalizeNumberOrNull(data.max_value);
  if ('prefix' in data) normalized.prefix = String(data.prefix ?? '');
  if ('table_columns' in data) normalized.table_columns = normalizeTableColumns(data.table_columns, idx);
}

function normalizeNearbyEnabled(data, normalized, target, idx) {
  if (!('nearby_enabled' in data)) return;
  if (target !== 'character') {
    throw new Error(`提案格式错误：stateFieldOps[${idx}].nearby_enabled 仅 target='character' 时允许使用`);
  }
  normalized.nearby_enabled = data.nearby_enabled ? 1 : 0;
}

function validateStateFieldType(normalized, fieldType, idx, validateDefaultValue, operation) {
  if (fieldType === 'datetime') {
    if (operation === 'update' && normalized.table_columns) {
      throw new Error(`提案格式错误：stateFieldOps[${idx}].table_columns 仅 type='table' 时允许使用`);
    }
    if (validateDefaultValue) assertDatetimeDefaultValue(normalized.default_value, idx);
    return;
  }
  if (fieldType === 'table') {
    validateTableField(normalized, idx, validateDefaultValue);
    return;
  }
  if (normalized.prefix && normalized.prefix.trim()) {
    throw new Error(`提案格式错误：stateFieldOps[${idx}].prefix 仅 datetime 类型字段允许使用`);
  }
  if (normalized.table_columns) {
    throw new Error(`提案格式错误：stateFieldOps[${idx}].table_columns 仅 type='table' 时允许使用`);
  }
}

function validateTableField(normalized, idx, validateDefaultValue) {
  if (!Array.isArray(normalized.table_columns) || normalized.table_columns.length === 0) {
    throw new Error(`提案格式错误：stateFieldOps[${idx}].table_columns 必须是非空数组（type='table' 时）`);
  }
  if (normalized.enum_options || normalized.min_value != null || normalized.max_value != null || (normalized.prefix && normalized.prefix.trim())) {
    throw new Error(`提案格式错误：stateFieldOps[${idx}] type='table' 时禁止填写 enum_options / min_value / max_value / prefix`);
  }
  if (validateDefaultValue) assertTableDefaultValue(normalized.default_value, normalized.table_columns, idx);
}

function normalizeTableColumns(value, idx) {
  if (value == null) return null;
  let arr = value;
  if (typeof arr === 'string') {
    try { arr = JSON.parse(arr); } catch {
      throw new Error(`提案格式错误：stateFieldOps[${idx}].table_columns 必须是数组或合法 JSON 字符串`);
    }
  }
  if (!Array.isArray(arr)) {
    throw new Error(`提案格式错误：stateFieldOps[${idx}].table_columns 必须是数组`);
  }
  const seen = new Set();
  return arr.map((col, ci) => {
    if (!col || typeof col !== 'object' || Array.isArray(col)) {
      throw new Error(`提案格式错误：stateFieldOps[${idx}].table_columns[${ci}] 必须是对象`);
    }
    const key = typeof col.key === 'string' ? col.key.trim() : '';
    if (!COLUMN_KEY_RE.test(key)) {
      throw new Error(`提案格式错误：stateFieldOps[${idx}].table_columns[${ci}].key 不合法（仅允许字母数字下划线）`);
    }
    if (seen.has(key)) {
      throw new Error(`提案格式错误：stateFieldOps[${idx}].table_columns[${ci}].key "${key}" 重复`);
    }
    seen.add(key);
    const label = typeof col.label === 'string' && col.label.trim() ? col.label.trim() : key;
    const out = { key, label };
    if (col.min != null && col.min !== '') {
      const n = Number(col.min);
      if (!Number.isFinite(n)) throw new Error(`提案格式错误：stateFieldOps[${idx}].table_columns[${ci}].min 必须是数值`);
      out.min = n;
    }
    if (col.max != null && col.max !== '') {
      const n = Number(col.max);
      if (!Number.isFinite(n)) throw new Error(`提案格式错误：stateFieldOps[${idx}].table_columns[${ci}].max 必须是数值`);
      out.max = n;
    }
    return out;
  });
}

function assertTableDefaultValue(defaultValue, columns, idx) {
  if (defaultValue == null || defaultValue === '') return;
  let parsed;
  try { parsed = JSON.parse(defaultValue); } catch {
    throw new Error(`提案格式错误：stateFieldOps[${idx}].default_value 必须是 JSON 字符串（type='table' 字段写成对象 JSON，例 "{\\"atk\\":10}"）`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`提案格式错误：stateFieldOps[${idx}].default_value 必须解析为对象（type='table'）`);
  }
  const colKeys = new Set(columns.map((c) => c.key));
  for (const [k, v] of Object.entries(parsed)) {
    if (!colKeys.has(k)) {
      throw new Error(`提案格式错误：stateFieldOps[${idx}].default_value 包含未声明列 "${k}"`);
    }
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(`提案格式错误：stateFieldOps[${idx}].default_value["${k}"] 必须是数值`);
    }
  }
}

function normalizeStateValueOps(rawOps, type) {
  if (rawOps == null) return [];
  if (!Array.isArray(rawOps)) throw new Error('提案格式错误：stateValueOps 必须是数组');
  const allowedTargets = STATE_VALUE_TARGETS_BY_PROPOSAL_TYPE[type];
  if (allowedTargets && allowedTargets.size === 0 && rawOps.length > 0) {
    throw new Error(`提案格式错误：${type} 不支持 stateValueOps`);
  }
  return rawOps.map((raw, idx) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`提案格式错误：stateValueOps[${idx}] 必须是对象`);
    const target = normalizeString(raw.target);
    if (!target || !allowedTargets.has(target)) throw new Error(`提案格式错误：stateValueOps[${idx}].target 非法`);
    const fieldKey = normalizeString(raw.field_key);
    if (!fieldKey) throw new Error(`提案格式错误：stateValueOps[${idx}].field_key 缺失`);
    if (!Object.hasOwn(raw, 'value_json')) throw new Error(`提案格式错误：stateValueOps[${idx}].value_json 缺失`);
    if (raw.value_json !== null && typeof raw.value_json !== 'string') {
      throw new Error(`提案格式错误：stateValueOps[${idx}].value_json 必须是 JSON 字符串或 null`);
    }
    return {
      target,
      field_key: fieldKey,
      value_json: raw.value_json,
    };
  });
}

// 字段编辑器把 datetime 默认值存成裸字符串，历史数据也有 JSON 引号包裹的写法，两种都接受。
function assertDatetimeDefaultValue(defaultValue, idx) {
  if (defaultValue == null || defaultValue === '') return;
  let parsed = defaultValue;
  try { parsed = JSON.parse(defaultValue); } catch { /* 裸字符串 */ }
  if (typeof parsed !== 'string' || !ISO_LOCAL_DATETIME_RE.test(parsed)) {
    throw new Error(`提案格式错误：stateFieldOps[${idx}].default_value 不符合 datetime 格式 "YYYY-MM-DDTHH:mm"（年份为正整数、可任意位数；月/日/时/分各 2 位）`);
  }
}

export { STATE_FIELD_KEYS, normalizeStateFieldOps, normalizeStateValueOps };
