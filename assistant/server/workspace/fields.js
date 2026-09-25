// 状态字段定义（世界 / 玩家 / 角色三层）。
//
// 后端补齐：field_key（未给时由标签生成）、_user / _char 后缀、update_mode（有 update_instruction 即自动更新）、
// 默认值的存储格式与类型校验、同名字段查重。

import { randomUUID } from 'node:crypto';

import { listWorldStateFields } from '../../../backend/services/world-state-fields.js';
import { getPersonaStateFieldsByWorldId } from '../../../backend/services/persona-state-fields.js';
import { listCharacterStateFields } from '../../../backend/services/character-state-fields.js';
import { validateStateValue } from '../../../backend/services/state-values.js';

import { normalizeProposal } from '../normalize-proposal.js';
import { applyProposal } from '../apply-proposal.js';
import {
  compact, fail, formatFieldDefault, parseStoredValue, pickKnown, requireObjectKeys, requireText,
} from './common.js';
import { FIELD_TARGETS } from './refs.js';

export const FIELD_FIELDS = [
  'target', 'label', 'type', 'key', 'description', 'default', 'options', 'min', 'max',
  'update_instruction', 'allow_empty', 'prefix', 'columns', 'nearby',
];
const FIELD_TYPES = ['number', 'text', 'enum', 'list', 'boolean', 'datetime', 'table'];
const KEY_SUFFIX = { world: '', persona: '_user', character: '_char' };
const LOADERS = {
  world: listWorldStateFields,
  persona: getPersonaStateFieldsByWorldId,
  character: listCharacterStateFields,
};

export function listFieldRows(worldId, target) {
  return LOADERS[target](worldId);
}

export function fieldRef(target, key) {
  return `field:${target}.${key}`;
}

// key 可写完整键、省略后缀的键或标签。
export function findField(worldId, target, keyOrLabel) {
  const rows = listFieldRows(worldId, target);
  const want = String(keyOrLabel).trim();
  const hit = rows.find((f) => f.field_key === want)
    ?? rows.find((f) => f.field_key === `${want}${KEY_SUFFIX[target]}`)
    ?? rows.find((f) => f.label === want);
  if (!hit) {
    const available = rows.map((f) => `${f.field_key}（${f.label}）`).join('、') || '（无）';
    fail(`${target} 层没有字段 "${want}"。现有字段：${available}`);
  }
  return hit;
}

export function viewField(target, row) {
  return compact({
    ref: fieldRef(target, row.field_key),
    target,
    key: row.field_key,
    label: row.label,
    type: row.type,
    description: row.description,
    default: parseStoredValue(row.type, row.default_value),
    options: row.enum_options,
    min: row.min_value,
    max: row.max_value,
    update_instruction: row.update_mode === 'llm_auto' ? (row.update_instruction || '（自动更新）') : undefined,
    allow_empty: row.allow_empty ? undefined : false,
    prefix: row.prefix,
    columns: row.table_columns,
    nearby: target === 'character' && row.nearby_enabled === 0 ? false : undefined,
  });
}

export function listFields(worldId) {
  const out = {};
  for (const target of FIELD_TARGETS) out[target] = listFieldRows(worldId, target).map((row) => viewField(target, row));
  return out;
}

function generateKey(label, existingKeys) {
  const ascii = String(label).trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');
  const base = /^[a-z]/.test(ascii) ? ascii : `f_${randomUUID().slice(0, 6)}`;
  let key = base;
  for (let n = 2; existingKeys.has(key); n += 1) key = `${base}_${n}`;
  return key;
}

// 按合并后的字段定义校验默认值，返回存储用字符串。
function convertDefault(def, value) {
  if (value == null) return null;
  const validated = validateStateValue(value, {
    type: def.type,
    enum_options: def.enum_options,
    min_value: def.min_value,
    max_value: def.max_value,
    table_columns: def.table_columns,
    allow_empty: 1,
  });
  if (validated === undefined) {
    fail(`default ${JSON.stringify(value)} 不符合字段类型 ${def.type}${def.type === 'enum' ? `（可选：${(def.enum_options ?? []).join('、')}）` : ''}`);
  }
  return formatFieldDefault(def.type, validated);
}

function toFieldOp(data, current = null) {
  const op = {};
  if ('label' in data) op.label = requireText(data.label, 'label');
  if ('type' in data) {
    if (!FIELD_TYPES.includes(data.type)) fail(`type 只能是 ${FIELD_TYPES.join(' / ')}`);
    op.type = data.type;
  }
  if ('description' in data) op.description = String(data.description ?? '');
  if ('options' in data) op.enum_options = data.options;
  if ('min' in data) op.min_value = data.min;
  if ('max' in data) op.max_value = data.max;
  if ('allow_empty' in data) op.allow_empty = data.allow_empty === false ? 0 : 1;
  if ('prefix' in data) op.prefix = data.prefix;
  if ('columns' in data) op.table_columns = data.columns;
  if ('nearby' in data) op.nearby_enabled = data.nearby !== false;
  if ('update_instruction' in data) {
    op.update_instruction = String(data.update_instruction ?? '');
    op.update_mode = op.update_instruction.trim() ? 'llm_auto' : 'manual';
  }
  if ('default' in data) {
    const def = {
      type: op.type ?? current?.type,
      enum_options: op.enum_options ?? current?.enum_options,
      min_value: op.min_value ?? current?.min_value,
      max_value: op.max_value ?? current?.max_value,
      table_columns: op.table_columns ?? current?.table_columns,
    };
    op.default_value = convertDefault(def, data.default);
  }
  return op;
}

async function applyFieldOps(worldId, stateFieldOps) {
  await applyProposal(normalizeProposal({ type: 'world-card', operation: 'update', entityId: worldId, stateFieldOps }));
}

export async function createField(worldId, data) {
  const input = pickKnown(data, FIELD_FIELDS, 'field');
  const { target } = input;
  if (!FIELD_TARGETS.includes(target)) fail(`field 需要 target：${FIELD_TARGETS.join(' / ')}`);
  requireText(input.label, 'label（字段显示名）');
  if (!input.type) fail(`field 需要 type：${FIELD_TYPES.join(' / ')}`);
  const rows = listFieldRows(worldId, target);
  const duplicate = rows.find((f) => f.label === input.label.trim());
  if (duplicate) fail(`${target} 层已有同名字段 ${fieldRef(target, duplicate.field_key)}，要修改请用 update`);

  const existingKeys = new Set(rows.map((f) => f.field_key.replace(/_(user|char)$/, '')));
  const key = input.key ? String(input.key).trim() : generateKey(input.label, existingKeys);
  const op = { op: 'create', target, field_key: key, update_mode: 'manual', ...toFieldOp(input) };
  await applyFieldOps(worldId, [op]);
  const created = findField(worldId, target, key);
  return `已创建 ${fieldRef(target, created.field_key)}（${created.label}）`;
}

export async function updateField(worldId, ref, data) {
  const input = pickKnown(data, FIELD_FIELDS.filter((k) => k !== 'target' && k !== 'key'), 'field');
  requireObjectKeys(input, 'field 没有要修改的字段');
  const current = findField(worldId, ref.target, ref.key);
  await applyFieldOps(worldId, [{ op: 'update', target: ref.target, id: current.id, ...toFieldOp(input, current) }]);
  return `已更新 ${fieldRef(ref.target, current.field_key)}`;
}

export async function removeField(worldId, ref) {
  const current = findField(worldId, ref.target, ref.key);
  await applyFieldOps(worldId, [{ op: 'delete', target: ref.target, id: current.id }]);
  return `已删除 ${fieldRef(ref.target, current.field_key)}（${current.label}）`;
}
