export const TRIGGER_SEGMENTS = [
  { key: 'always', label: '一直生效' },
  { key: 'keyword', label: '出现关键词' },
  { key: 'llm', label: 'AI 判断相关' },
  { key: 'state', label: '状态满足条件' },
];

const NUMERIC_TYPES = new Set(['number', 'integer', 'float', 'datetime']);
const NUMERIC_OPS = [
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: '=', label: '=' },
  { value: '>=', label: '>=' },
  { value: '<=', label: '<=' },
  { value: '!=', label: '!=' },
];
const TEXT_OPS = [
  { value: '包含', label: '包含' },
  { value: '等于', label: '等于' },
  { value: '不包含', label: '不包含' },
];
export const SCOPE_OPTIONS = [
  { value: '世界', label: '世界' },
  { value: '角色', label: '角色' },
  { value: '玩家', label: '玩家' },
];

export function emptyCondition() {
  return { scope: '', field_label: '', col_key: '', target_field: '', operator: '>', value: '' };
}

export function parseTargetField(tf) {
  const parts = tf ? tf.split('.') : [];
  if (parts.length === 3) return { scope: parts[0], field_label: parts[1], col_key: parts[2] };
  if (parts.length === 2) return { scope: parts[0], field_label: parts[1], col_key: '' };
  return { scope: '', field_label: '', col_key: '' };
}

export function getFieldOptions(rawFieldsByScope, scope) {
  return (rawFieldsByScope[scope] || []).map((field) => ({ value: field.label, label: field.label }));
}

export function getColOptions(rawFieldsByScope, scope, fieldLabel) {
  const field = (rawFieldsByScope[scope] || []).find((item) => item.label === fieldLabel);
  if (field?.type !== 'table') return null;
  const columns = Array.isArray(field.table_columns) ? field.table_columns : [];
  return columns.map((column) => ({ value: column.key, label: column.label || column.key }));
}

export function clampToken(value, triggerType) {
  const number = parseInt(value, 10);
  const min = triggerType === 'always' ? 0 : 1;
  if (!Number.isFinite(number)) return min;
  return Math.max(min, number);
}

export function clampActiveTurns(value) {
  const number = parseInt(value, 10);
  if (!Number.isFinite(number) || number < 0) return 1;
  return number;
}

export function parseKeywordScope(raw) {
  if (Array.isArray(raw)) return raw.filter((value) => value === 'user' || value === 'assistant');
  if (typeof raw !== 'string') return ['user'];
  const items = raw.split(',').map((item) => item.trim().toLowerCase())
    .filter((value) => value === 'user' || value === 'assistant');
  return [...new Set(items)];
}

export function buildPrefillCondition(prefill, typeMap) {
  if (!prefill?.scope || !prefill?.field_label) return null;
  const target_field = `${prefill.scope}.${prefill.field_label}`;
  const type = typeMap.get(target_field);
  const operator = type && !NUMERIC_TYPES.has(type) ? '包含' : '>';
  return {
    scope: prefill.scope,
    field_label: prefill.field_label,
    col_key: '',
    target_field,
    operator,
    value: '',
  };
}

export function getOpsForField(targetField, fieldTypeMap) {
  const type = fieldTypeMap.get(targetField);
  if (!type) return [...NUMERIC_OPS, ...TEXT_OPS];
  return NUMERIC_TYPES.has(type) ? NUMERIC_OPS : TEXT_OPS;
}

export function applyConditionPatch(condition, patch, fieldTypeMap) {
  const next = { ...condition, ...patch };
  if ('scope' in patch) {
    next.field_label = '';
    next.col_key = '';
  }
  if ('field_label' in patch) next.col_key = '';
  if (next.scope && next.field_label) {
    next.target_field = next.col_key
      ? `${next.scope}.${next.field_label}.${next.col_key}`
      : `${next.scope}.${next.field_label}`;
  } else {
    next.target_field = '';
  }
  if ('scope' in patch || 'field_label' in patch || 'col_key' in patch) {
    next.operator = getOpsForField(next.target_field, fieldTypeMap)[0].value;
  }
  return next;
}

export function findScopeForFieldLabel(label, rawFieldsByScope) {
  for (const scope of ['世界', '角色', '玩家']) {
    if ((rawFieldsByScope[scope] || []).some((field) => field.label === label)) return scope;
  }
  return '世界';
}
