/**
 * state-memory-schema.js — 状态记忆的实体类型、档案字段定义与相关常量
 *
 * 这里的定义是提示词、写入校验、渲染、界面的唯一来源，其它模块不得重复定义同一份规则。
 * 前端经 GET /api/state-memory/schema 获取（见 routes/state-memory-schema.js），不在前端重复定义。
 */

import { getCharacterStateFieldsByWorldId } from '../db/queries/character-state-fields.js';
import { getPersonaStateFieldsByWorldId } from '../db/queries/persona-state-fields.js';

export const ENTITY_TYPES = ['character', 'location', 'item', 'faction', 'other', 'player'];

// ============================
// 角色档案字段
// ============================

const APPEARANCE_SYNONYMS = ['外貌', 'appearance'];

const OUTFIT_FIELD = { key: 'outfit', label: '穿着', group: '外貌', kind: 'list', mutability: 'dynamic', synonyms: ['穿着', '服装', '衣着', 'outfit'] };

const CHARACTER_PROFILE_FIELDS = [
  // 身份
  { key: 'gender', label: '性别', group: '身份', kind: 'text', mutability: 'immutable', synonyms: ['性别', 'gender'] },
  { key: 'birth_date', label: '出生日期', group: '身份', kind: 'text', mutability: 'immutable', synonyms: [] },
  { key: 'age_recorded', label: '记录年龄', group: '身份', kind: 'age', mutability: 'semi_stable', synonyms: ['年龄', 'age'] },
  { key: 'species', label: '种族', group: '身份', kind: 'text', mutability: 'immutable', synonyms: ['种族', 'species'] },
  { key: 'origin', label: '出身', group: '身份', kind: 'text', mutability: 'immutable', synonyms: [] },
  { key: 'occupation', label: '职业', group: '身份', kind: 'text', mutability: 'semi_stable', synonyms: ['职业', '工作', '身份', 'identity'] },
  { key: 'social_identity', label: '社会身份', group: '身份', kind: 'list', mutability: 'semi_stable', synonyms: [] },
  // 外貌
  { key: 'height', label: '身高', group: '外貌', kind: 'text', mutability: 'semi_stable', synonyms: APPEARANCE_SYNONYMS },
  { key: 'build', label: '体型', group: '外貌', kind: 'text', mutability: 'semi_stable', synonyms: APPEARANCE_SYNONYMS },
  { key: 'hair', label: '发型', group: '外貌', kind: 'text', mutability: 'semi_stable', synonyms: APPEARANCE_SYNONYMS },
  { key: 'eyes', label: '眼睛', group: '外貌', kind: 'text', mutability: 'semi_stable', synonyms: APPEARANCE_SYNONYMS },
  { key: 'distinguishing_features', label: '显著特征', group: '外貌', kind: 'list', mutability: 'semi_stable', synonyms: APPEARANCE_SYNONYMS },
  OUTFIT_FIELD,
  // 人格
  { key: 'core_traits', label: '核心性格', group: '人格', kind: 'list', mutability: 'semi_stable', highBar: true, synonyms: ['性格', '个性', 'personality'] },
  { key: 'behavioral_patterns', label: '行为习惯', group: '人格', kind: 'list', mutability: 'semi_stable', synonyms: [] },
  { key: 'values', label: '价值观', group: '人格', kind: 'list', mutability: 'semi_stable', highBar: true, synonyms: [] },
  { key: 'speech_style', label: '说话方式', group: '人格', kind: 'list', mutability: 'semi_stable', synonyms: [] },
  // 经历
  { key: 'background', label: '经历', group: '经历', kind: 'list', mutability: 'semi_stable', appendOnly: true, synonyms: [] },
];

const LOCATION_PROFILE_FIELDS = [
  { key: 'category', label: '类别', kind: 'text', mutability: 'semi_stable', synonyms: [] },
  { key: 'description', label: '概述', kind: 'text', mutability: 'semi_stable', synonyms: [] },
  { key: 'features', label: '特征', kind: 'list', mutability: 'semi_stable', synonyms: [] },
];

const ITEM_PROFILE_FIELDS = [
  { key: 'category', label: '类别', kind: 'text', mutability: 'semi_stable', synonyms: [] },
  { key: 'description', label: '概述', kind: 'text', mutability: 'semi_stable', synonyms: [] },
  { key: 'effects', label: '效果', kind: 'list', mutability: 'semi_stable', synonyms: [] },
  { key: 'limits', label: '限制', kind: 'list', mutability: 'semi_stable', synonyms: [] },
];

const FACTION_PROFILE_FIELDS = [
  { key: 'category', label: '类别', kind: 'text', mutability: 'semi_stable', synonyms: [] },
  { key: 'description', label: '概述', kind: 'text', mutability: 'semi_stable', synonyms: [] },
  { key: 'scope', label: '范围', kind: 'text', mutability: 'semi_stable', synonyms: [] },
];

const OTHER_PROFILE_FIELDS = [
  { key: 'description', label: '概述', kind: 'text', mutability: 'semi_stable', synonyms: [] },
];

const PROFILE_FIELDS_BY_TYPE = {
  character: CHARACTER_PROFILE_FIELDS,
  location: LOCATION_PROFILE_FIELDS,
  item: ITEM_PROFILE_FIELDS,
  faction: FACTION_PROFILE_FIELDS,
  other: OTHER_PROFILE_FIELDS,
  // 玩家的身份信息以人设为准，只记录会随剧情变化的穿着
  player: [OUTFIT_FIELD],
};

/** 按实体类型取档案字段定义（不做同义字段停用过滤，全量定义） */
export function getProfileFieldDefinitions(entityType) {
  return PROFILE_FIELDS_BY_TYPE[entityType] ?? [];
}

// ============================
// 同义字段停用
// ============================

/** 用户角色字段 field_key 常见的 `_char` 后缀（与世界层同名字段区分），比对同义词前先去掉 */
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
 * 用户字段是否会让某个档案字段停用：
 * 用户字段的 label 或去掉 `_char` 后缀的 field_key，与档案字段的同义词完全匹配（不区分大小写）。
 */
function isDeactivatedBySynonyms(profileField, enabledUserFields) {
  if (profileField.synonyms.length === 0) return false;
  const synonymSet = new Set(profileField.synonyms.map(normalizeForSynonymMatch));
  return enabledUserFields.some((field) => {
    const label = normalizeForSynonymMatch(field.label);
    const key = normalizeForSynonymMatch(stripCharFieldKeySuffix(field.field_key));
    return synonymSet.has(label) || synonymSet.has(key);
  });
}

function userFieldsCoveringProfile(worldId, entityType) {
  if (entityType === 'character') {
    return getCharacterStateFieldsByWorldId(worldId).filter((field) => field.nearby_enabled);
  }
  if (entityType === 'player') return getPersonaStateFieldsByWorldId(worldId);
  return [];
}

/**
 * 某世界里该实体类型当前启用的档案字段 key 数组。
 * - character：读该世界 `nearby_enabled=1` 的角色字段，同义命中的档案字段停用
 *   （外貌组各字段共享同一组同义词，命中任一都会让整组一起停用）；
 * - player：读该世界的玩家字段，同义命中的档案字段停用；
 * - 其他类型不受影响，返回其全部字段 key。
 */
export function resolveActiveProfileFields(worldId, entityType) {
  const definitions = getProfileFieldDefinitions(entityType);
  const enabledUserFields = userFieldsCoveringProfile(worldId, entityType);
  return definitions
    .filter((field) => !isDeactivatedBySynonyms(field, enabledUserFields))
    .map((field) => field.key);
}

// ============================
// 未完结事项 / 关系
// ============================

export const THREAD_KINDS = ['承诺', '任务', '债务', '冲突', '谜团', '威胁', '计划', '目标'];

export const EXCLUSIVE_PREDICATES = ['持有者', '控制者'];

// ============================
// 占位值
// ============================

const PLACEHOLDER_VALUE_SET = new Set([
  'unknown', 'none', 'null', 'n/a',
  '未知', '不明', '暂无', '无', '空', '待定', '？',
]);

/** 值为空，或转成字符串、去掉空白、转小写后为空串或属于占位词集合，即视为占位值 */
export function isPlaceholderValue(value) {
  if (value == null) return true;
  const normalized = String(value).replace(/\s+/g, '').toLowerCase();
  return normalized === '' || PLACEHOLDER_VALUE_SET.has(normalized);
}

// ============================
// 世界档案
// ============================

export const DYNAMIC_LOCATION_KEY = '位置';

export const WORLD_PROFILE_KEYS = ['time', 'location'];

export const RESERVED_WORLD_FIELD_LABELS = ['时间', '地点'];
