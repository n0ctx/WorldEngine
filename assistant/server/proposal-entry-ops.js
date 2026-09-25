/**
 * 提案里世界条目操作（entryOps）的归一化：触发方式、关键词、状态条件及其字段引用解析。
 */

import { listWorldStateFields } from '../../backend/services/world-state-fields.js';
import { listCharacterStateFields } from '../../backend/services/character-state-fields.js';
import { getPersonaStateFieldsByWorldId } from '../../backend/services/persona-state-fields.js';
import {
  normalizeString, normalizeEntityId, normalizeMode, normalizeStringArrayOrNull,
} from './proposal-values.js';

const VALID_TRIGGER_TYPES = new Set(['always', 'keyword', 'llm', 'state']);
const VALID_RUNTIME_ENTRY_CONDITION_OPERATORS = new Set(['>', '<', '=', '>=', '<=', '!=', '包含', '等于', '不包含']);
const CONDITION_OPERATOR_ALIASES = {
  eq: 'eq',
  ne: 'ne',
  gt: 'gt',
  lt: 'lt',
  gte: 'gte',
  lte: 'lte',
  contains: 'contains',
  not_contains: 'not_contains',
  '>': '>',
  '<': '<',
  '=': '=',
  '>=': '>=',
  '<=': '<=',
  '!=': '!=',
  '包含': '包含',
  '等于': '等于',
  '不包含': '不包含',
};

function buildWorldConditionContext(worldId, stateFieldOps = []) {
  const scopedFields = [];
  const pushScopedField = (scopeLabel, field) => {
    if (!field?.label) return;
    scopedFields.push({
      scopeLabel,
      label: String(field.label),
      field_key: typeof field.field_key === 'string' ? field.field_key : '',
      type: typeof field.type === 'string' ? field.type : 'text',
    });
  };

  if (worldId) {
    listWorldStateFields(worldId).forEach((field) => pushScopedField('世界', field));
    getPersonaStateFieldsByWorldId(worldId).forEach((field) => pushScopedField('玩家', field));
    listCharacterStateFields(worldId).forEach((field) => pushScopedField('角色', field));
  }

  for (const op of stateFieldOps) {
    if (op?.op !== 'create') continue;
    if (op.target === 'world') pushScopedField('世界', op);
    else if (op.target === 'persona') pushScopedField('玩家', op);
    else if (op.target === 'character') pushScopedField('角色', op);
  }

  const deduped = [];
  const seen = new Set();
  for (const field of scopedFields) {
    const key = `${field.scopeLabel}.${field.field_key}::${field.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(field);
  }

  const byScopedLabel = new Map();
  const byScopedFieldKey = new Map();
  const byFieldKey = new Map();
  const byLabel = new Map();

  // persona/character 字段在 normalizeStateFieldOps 里被自动追加 _user/_char 后缀，
  // 而 LLM 写条件 target_field 时通常用裸键（玩家.affection 而非 玩家.affection_user）。
  // 这里同时注册裸键别名，让裸键写法也能解析；后缀键优先，裸键仅在不冲突时补位。
  const stripScopeSuffix = (key) => key.replace(/_(?:user|char)$/, '');
  const registerFieldKeyAlias = (mapKey, field, map) => {
    if (!map.has(mapKey)) map.set(mapKey, field);
  };
  const registerListAlias = (mapKey, field, map) => {
    if (!map.has(mapKey)) map.set(mapKey, [field]);
  };

  for (const field of deduped) {
    const scopedLabel = `${field.scopeLabel}.${field.label}`;
    byScopedLabel.set(scopedLabel, field);
    if (field.field_key) {
      byScopedFieldKey.set(`${field.scopeLabel}.${field.field_key}`, field);
      const bareKey = stripScopeSuffix(field.field_key);
      if (bareKey !== field.field_key) {
        registerFieldKeyAlias(`${field.scopeLabel}.${bareKey}`, field, byScopedFieldKey);
      }
    }
    if (field.field_key) {
      if (!byFieldKey.has(field.field_key)) byFieldKey.set(field.field_key, []);
      byFieldKey.get(field.field_key).push(field);
      const bareKey = stripScopeSuffix(field.field_key);
      if (bareKey !== field.field_key) registerListAlias(bareKey, field, byFieldKey);
    }
    if (!byLabel.has(field.label)) byLabel.set(field.label, []);
    byLabel.get(field.label).push(field);
  }

  return { byScopedLabel, byScopedFieldKey, byFieldKey, byLabel };
}

function resolvedField(field) {
  return { targetField: `${field.scopeLabel}.${field.label}`, field };
}

function resolveConditionField(rawTargetField, context) {
  const input = String(rawTargetField ?? '').trim();
  if (!input) return { targetField: null, field: null };
  if (!context) return { targetField: input, field: null };

  const scoped = context.byScopedLabel.get(input) ?? context.byScopedFieldKey.get(input);
  if (scoped) return resolvedField(scoped);

  if (input.includes('.')) {
    return { targetField: input, field: null, unresolved: true };
  }

  const byKeyMatches = context.byFieldKey.get(input) || [];
  if (byKeyMatches.length === 1) {
    const field = byKeyMatches[0];
    return resolvedField(field);
  }
  if (byKeyMatches.length > 1) {
    throw new Error(`提案格式错误：state 条件 target_field "${input}" 存在多个同名 field_key，请改为 世界.xxx / 玩家.xxx / 角色.xxx`);
  }

  const byLabelMatches = context.byLabel.get(input) || [];
  if (byLabelMatches.length === 1) {
    const field = byLabelMatches[0];
    return resolvedField(field);
  }
  if (byLabelMatches.length > 1) {
    throw new Error(`提案格式错误：state 条件 target_field "${input}" 存在多个同名标签，请改为 世界.xxx / 玩家.xxx / 角色.xxx`);
  }

  return { targetField: input, field: null };
}

function normalizeConditionOperator(rawOperator, field, idx, condIdx) {
  const operator = CONDITION_OPERATOR_ALIASES[String(rawOperator ?? '').trim()];
  if (!operator) {
    throw new Error(`提案格式错误：entryOps[${idx}].conditions[${condIdx}].operator 非法`);
  }
  if (VALID_RUNTIME_ENTRY_CONDITION_OPERATORS.has(operator)) return operator;

  const fieldType = field?.type || null;
  const isNumeric = fieldType === 'number';
  switch (operator) {
    case 'gt':
      if (!isNumeric) throw new Error(`提案格式错误：entryOps[${idx}].conditions[${condIdx}] 非数值字段不能使用 gt`);
      return '>';
    case 'lt':
      if (!isNumeric) throw new Error(`提案格式错误：entryOps[${idx}].conditions[${condIdx}] 非数值字段不能使用 lt`);
      return '<';
    case 'gte':
      if (!isNumeric) throw new Error(`提案格式错误：entryOps[${idx}].conditions[${condIdx}] 非数值字段不能使用 gte`);
      return '>=';
    case 'lte':
      if (!isNumeric) throw new Error(`提案格式错误：entryOps[${idx}].conditions[${condIdx}] 非数值字段不能使用 lte`);
      return '<=';
    case 'eq':
      return isNumeric ? '=' : '等于';
    case 'ne':
      if (!isNumeric) throw new Error(`提案格式错误：entryOps[${idx}].conditions[${condIdx}] 文本字段不支持 ne，请改用 等于/包含/不包含`);
      return '!=';
    case 'contains':
      return '包含';
    case 'not_contains':
      return '不包含';
    default:
      throw new Error(`提案格式错误：entryOps[${idx}].conditions[${condIdx}].operator 非法`);
  }
}

function normalizeEntryOps(rawOps, { includeMode = false, allowTriggerType = false, conditionContext = null, warnings = null } = {}) {
  if (rawOps == null) return [];
  if (!Array.isArray(rawOps)) throw new Error('提案格式错误：entryOps 必须是数组');
  const options = { includeMode, allowTriggerType, conditionContext, warnings };
  return rawOps.map((raw, idx) => normalizeEntryOp(raw, idx, options));
}

function normalizeEntryOp(raw, idx, options) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`提案格式错误：entryOps[${idx}] 必须是对象`);
  const op = normalizeString(raw.op);
  if (!['create', 'update', 'delete'].includes(op)) throw new Error(`提案格式错误：entryOps[${idx}].op 非法`);
  if (op === 'delete') return normalizeEntryDelete(raw, idx, op);

  const normalized = { op };
  if (op === 'update') {
    const id = normalizeEntityId(raw.id);
    if (!id) throw new Error(`提案格式错误：entryOps[${idx}].id 缺失`);
    normalized.id = id;
  }
  normalizeEntryText(raw, normalized);
  normalizeEntryKeywords(raw, normalized);
  normalizeEntrySettings(raw, normalized, options.includeMode);
  normalizeEntryTrigger(raw, normalized, idx, options);
  normalizeEntryConditions(raw, normalized, idx, options);
  return normalized;
}

function normalizeEntryDelete(raw, idx, op) {
  const id = normalizeEntityId(raw.id);
  if (!id) throw new Error(`提案格式错误：entryOps[${idx}].id 缺失`);
  return { op, id };
}

function normalizeEntryText(raw, normalized) {
  if ('title' in raw) normalized.title = String(raw.title ?? '');
  if ('description' in raw) normalized.description = String(raw.description ?? '');
  if ('content' in raw) normalized.content = String(raw.content ?? '');
}

function normalizeEntryKeywords(raw, normalized) {
  if ('keywords' in raw) normalized.keywords = normalizeStringArrayOrNull(raw.keywords);
  if ('keyword_scope' in raw) normalized.keyword_scope = normalizeKeywordScope(raw.keyword_scope);
  if ('keyword_logic' in raw) normalized.keyword_logic = raw.keyword_logic === 'AND' ? 'AND' : 'OR';
}

function normalizeKeywordScope(value) {
  const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const filtered = items
    .map((item) => String(item).trim().toLowerCase())
    .filter((item) => item === 'user' || item === 'assistant');
  const unique = [...new Set(filtered)];
  return unique.length > 0 ? unique.join(',') : 'user,assistant';
}

function normalizeEntrySettings(raw, normalized, includeMode) {
  if ('condition_logic' in raw) normalized.condition_logic = raw.condition_logic === 'OR' ? 'OR' : 'AND';
  if ('active_turns' in raw) {
    const turns = parseInt(raw.active_turns, 10);
    normalized.active_turns = Number.isFinite(turns) && turns >= 0 ? turns : 1;
  }
  if ('token' in raw) {
    const token = parseInt(raw.token, 10);
    normalized.token = Number.isFinite(token) && token >= 1 ? token : 1;
  }
  if (includeMode) normalized.mode = normalizeMode(raw.mode);
}

function normalizeEntryTrigger(raw, normalized, idx, { allowTriggerType, warnings }) {
  if (allowTriggerType && 'trigger_type' in raw) {
    const triggerType = normalizeString(raw.trigger_type);
    if (triggerType && VALID_TRIGGER_TYPES.has(triggerType)) normalized.trigger_type = triggerType;
  }
  if (allowTriggerType && normalized.trigger_type === 'keyword' && (!normalized.keywords || normalized.keywords.length === 0)) {
    warnings?.push(`条目「${normalized.title || idx}」类型为 keyword 但 keywords 为空，该条目永远不会触发；请添加关键词或改为 llm/always 类型`);
  }
}

function normalizeEntryConditions(raw, normalized, idx, { allowTriggerType, conditionContext, warnings }) {
  const keepConditions = allowTriggerType
    && Array.isArray(raw.conditions)
    && (normalized.trigger_type === 'state' || normalized.trigger_type === undefined);
  if (keepConditions) {
    normalized.conditions = raw.conditions
      .filter(isUsableEntryCondition)
      .map((condition, conditionIndex) => normalizeEntryCondition(condition, idx, conditionIndex, normalized, conditionContext, warnings));
  }
  if (allowTriggerType && normalized.trigger_type === 'state' && (!normalized.conditions || normalized.conditions.length === 0)) {
    warnings?.push(`条目「${normalized.title || idx}」类型为 state 但 conditions 为空，该条目永远不会触发；请添加至少一个条件`);
  }
}

function isUsableEntryCondition(condition) {
  return condition && typeof condition === 'object'
    && condition.target_field && condition.operator && 'value' in condition;
}

function normalizeEntryCondition(condition, idx, conditionIndex, normalized, conditionContext, warnings) {
  const { targetField, field, unresolved } = resolveConditionField(condition.target_field, conditionContext);
  if (unresolved) {
    warnings?.push(`条目「${normalized.title || idx}」的条件引用了未知字段「${condition.target_field}」，请确认字段标签正确（格式：世界/玩家/角色.字段标签）`);
  }
  return {
    target_field: targetField,
    operator: normalizeConditionOperator(condition.operator, field, idx, conditionIndex),
    value: String(condition.value ?? ''),
  };
}

export { buildWorldConditionContext, resolveConditionField, normalizeEntryOps };
