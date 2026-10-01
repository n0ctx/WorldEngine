const COLUMN_KEY_RE = /^[a-zA-Z0-9_]+$/;
export const ISO_DATETIME_RE = /^\d+-\d{2}-\d{2}T\d{2}:\d{2}$/;

const DEFAULT_RESERVED_WORLD_FIELD_LABELS = ['时间', '地点'];

/** 世界字段的 label 是否属于系统保留名（时间/地点），只有 scope='world' 时才受限 */
export function isReservedWorldFieldLabel(scope, label, reservedWorldFieldLabels) {
  if (scope !== 'world') return false;
  const labels = reservedWorldFieldLabels?.length ? reservedWorldFieldLabels : DEFAULT_RESERVED_WORLD_FIELD_LABELS;
  return labels.includes((label ?? '').trim());
}

export function createStateFieldForm(field) {
  let listDefaults = [];
  if (field?.type === 'list' && field?.default_value) {
    try { listDefaults = JSON.parse(field.default_value) || []; } catch { listDefaults = []; }
  }

  const tableColumns = Array.isArray(field?.table_columns) ? field.table_columns : [];
  let tableDefaults = {};
  if (field?.type === 'table' && field?.default_value) {
    try { tableDefaults = JSON.parse(field.default_value) || {}; } catch { tableDefaults = {}; }
  }

  return {
    field_key: field?.field_key ?? '',
    label: field?.label ?? '',
    type: field?.type ?? 'text',
    description: field?.description ?? '',
    update_mode: field?.update_mode === 'manual' ? 'manual' : 'llm_auto',
    enum_options: Array.isArray(field?.enum_options) ? field.enum_options : [],
    list_defaults: listDefaults,
    table_columns: tableColumns,
    table_defaults: tableDefaults,
    min_value: field?.min_value ?? '',
    max_value: field?.max_value ?? '',
    allow_empty: field?.allow_empty ?? 1,
    update_instruction: field?.update_instruction ?? '',
    prefix: field?.prefix ?? '',
    unit: field?.unit ?? '',
    default_value: field?.type === 'list' || field?.type === 'table' ? '' : (field?.default_value ?? ''),
    nearby_enabled: field?.nearby_enabled == null ? 1 : (field.nearby_enabled ? 1 : 0),
  };
}

export function createLockedColumnKeys(field) {
  return new Set(
    field?.type === 'table' && Array.isArray(field.table_columns)
      ? field.table_columns.map((column) => column?.key).filter(Boolean)
      : [],
  );
}

export function updateStateFieldForm(setForm, key, value) {
  setForm((form) => ({ ...form, [key]: value }));
}

const APPEARANCE_GROUP = '外貌';
const APPEARANCE_GROUP_FIELDS_LABEL = '身高、体型、发型、眼睛、显著特征';
// guard-allow(duplication): backend/memory/state-memory-schema.js 的同义词匹配规则前端镜像，必须逐字一致
const CHAR_FIELD_KEY_SUFFIX = '_char';

function normalizeForSynonymMatch(text) {
  return (text ?? '').trim().toLowerCase();
}

function stripCharFieldKeySuffix(fieldKey) {
  const normalized = fieldKey ?? '';
  return normalized.endsWith(CHAR_FIELD_KEY_SUFFIX)
    ? normalized.slice(0, -CHAR_FIELD_KEY_SUFFIX.length)
    : normalized;
}

/**
 * 角色字段勾选「对 NPC 生效」时，若 label 或 field_key 与某个角色档案字段同义，
 * 返回该档案字段应展示的中文名（外貌组命中时返回组内各字段名），用于提示「将取代档案字段」。
 * 匹配规则需与后端 backend/memory/state-memory-schema.js 的 resolveActiveProfileFields 保持一致。
 */
export function findReplacedProfileFieldLabel(schema, scope, form) {
  if (scope !== 'character' || !schema || form.nearby_enabled === 0) return '';
  const label = normalizeForSynonymMatch(form.label);
  const key = normalizeForSynonymMatch(stripCharFieldKeySuffix(form.field_key));
  const profileFields = schema.profileFields?.character ?? [];
  const matched = profileFields.find((profileField) => {
    const synonyms = profileField.synonyms ?? [];
    if (synonyms.length === 0) return false;
    const synonymSet = new Set(synonyms.map(normalizeForSynonymMatch));
    return synonymSet.has(label) || synonymSet.has(key);
  });
  if (!matched) return '';
  return matched.group === APPEARANCE_GROUP ? APPEARANCE_GROUP_FIELDS_LABEL : matched.label;
}

function validateStateFieldForm(form, scope, reservedWorldFieldLabels) {
  if (!form.field_key.trim()) return 'field_key 为必填项';
  if (!form.label.trim()) return 'label 为必填项';
  if (!form.type) return 'type 为必填项';
  if (isReservedWorldFieldLabel(scope, form.label, reservedWorldFieldLabels)) return '该名称已由系统管理';
  if (form.type === 'datetime' && form.default_value && !ISO_DATETIME_RE.test(form.default_value)) {
    return '默认值格式必须为 YYYY-MM-DDTHH:mm（年份为正整数，月/日/时/分各 2 位）';
  }
  if (form.type === 'table') return validateTableColumns(form.table_columns);
  return '';
}

function validateTableColumns(columns) {
  if (columns.length === 0) return '表格类型必须至少定义 1 列';

  const seen = new Set();
  for (const column of columns) {
    if (!column.key || !COLUMN_KEY_RE.test(column.key)) {
      return `列 key "${column.key}" 不合法（仅允许字母数字下划线）`;
    }
    if (seen.has(column.key)) return `列 key "${column.key}" 重复`;
    seen.add(column.key);
    if (!column.label || !column.label.trim()) return `列 "${column.key}" 缺少表头 label`;
    if (column.min !== '' && column.min != null && !isFinite(Number(column.min))) {
      return `列 "${column.key}" 的 min 必须为数值`;
    }
    if (column.max !== '' && column.max != null && !isFinite(Number(column.max))) {
      return `列 "${column.key}" 的 max 必须为数值`;
    }
  }
  return '';
}

function buildStateFieldPayload(form, scope) {
  return {
    field_key: form.field_key.trim(),
    label: form.label.trim(),
    type: form.type,
    description: form.description,
    update_mode: form.update_mode,
    enum_options: form.type === 'enum' && form.enum_options.length ? form.enum_options : null,
    min_value: form.type === 'number' && form.min_value !== '' ? Number(form.min_value) : null,
    max_value: form.type === 'number' && form.max_value !== '' ? Number(form.max_value) : null,
    allow_empty: 1,
    update_instruction: form.update_instruction,
    prefix: form.type === 'datetime' ? (form.prefix ?? '') : '',
    unit: form.type === 'number' ? (form.unit ?? '').trim().slice(0, 16) : '',
    table_columns: form.type === 'table' ? buildTableColumnsPayload(form.table_columns) : null,
    default_value: buildDefaultValue(form),
    ...(scope === 'character' ? { nearby_enabled: form.nearby_enabled ? 1 : 0 } : {}),
  };
}

function buildTableColumnsPayload(columns) {
  if (!columns) return null;
  return columns.map((column) => {
    const payload = { key: column.key.trim(), label: column.label.trim() };
    if (column.min !== '' && column.min != null) payload.min = Number(column.min);
    if (column.max !== '' && column.max != null) payload.max = Number(column.max);
    return payload;
  });
}

function buildDefaultValue(form) {
  if (form.type === 'list') {
    return form.list_defaults.length > 0 ? JSON.stringify(form.list_defaults) : null;
  }
  if (form.type === 'table') return buildTableDefaultValue(form);
  return form.default_value !== '' ? form.default_value : null;
}

function buildTableDefaultValue(form) {
  const values = {};
  for (const column of form.table_columns) {
    const raw = form.table_defaults[column.key];
    if (raw === '' || raw == null) continue;
    const value = Number(raw);
    if (isFinite(value)) values[column.key] = value;
  }
  return Object.keys(values).length ? JSON.stringify(values) : null;
}

export async function saveStateField(form, scope, reservedWorldFieldLabels, onSave, onClose, setError, setSaving) {
  const validationError = validateStateFieldForm(form, scope, reservedWorldFieldLabels);
  if (validationError) {
    setError(validationError);
    return;
  }

  setSaving(true);
  setError('');
  try {
    await onSave(buildStateFieldPayload(form, scope));
    onClose();
  } catch (error) {
    setError(error.message);
    setSaving(false);
  }
}
