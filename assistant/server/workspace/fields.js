// 状态字段定义（世界 / 玩家 / 角色三层）。
//
// 后端补齐：field_key（未给时由标签生成）、_user / _char 后缀、update_mode（有 update_instruction 即自动更新）、
// 默认值的存储格式与类型校验、同名与同 key 字段查重。

import { randomUUID } from 'node:crypto';

import { listWorldStateFields } from '../../../backend/services/world-state-fields.js';
import { getPersonaStateFieldsByWorldId } from '../../../backend/services/persona-state-fields.js';
import { listCharacterStateFields } from '../../../backend/services/character-state-fields.js';
import { validateStateValue } from '../../../backend/services/state-values.js';
import { RESERVED_WORLD_FIELD_LABELS } from '../../../backend/memory/state-memory-schema.js';

import { normalizeProposal } from '../normalize-proposal.js';
import {
  compact, fail, formatFieldDefault, parseFields, parseStoredValue, requireObjectKeys, requireText,
} from './common.js';
import { any, array, bool, numberOrNull, oneOf, stringList, text } from './coerce.js';
import { FIELD_TARGETS } from './refs.js';
import { applyStep } from './step.js';

const FIELD_TYPES = ['number', 'text', 'enum', 'list', 'boolean', 'datetime', 'table'];
const FIELD_SPEC = {
  target: oneOf(FIELD_TARGETS),
  label: text,
  type: oneOf(FIELD_TYPES),
  key: text,
  description: text,
  default: any,
  options: stringList,
  min: numberOrNull,
  max: numberOrNull,
  update_instruction: text,
  allow_empty: bool,
  prefix: text,
  columns: array,
  nearby: bool,
};
export const FIELD_FIELDS = Object.keys(FIELD_SPEC);
const { target: _target, key: _key, ...FIELD_UPDATE_SPEC } = FIELD_SPEC;
const KEY_SUFFIX = { world: '', persona: '_user', character: '_char' };
const LOADERS = {
  world: listWorldStateFields,
  persona: getPersonaStateFieldsByWorldId,
  character: listCharacterStateFields,
};
const columnKey = (column) => (typeof column === 'string' ? column : column?.key);
const COLUMN_PATCH = { keyOf: columnKey, matches: (column, target) => columnKey(column) === columnKey(target) };

export function listFieldRows(worldId, target) {
  return LOADERS[target](worldId);
}

// 库里的字段加上同一批里排在前面、即将新建的字段。
export function fieldRowsWithPending(worldId, target, ctx) {
  const pending = (ctx?.pendingFields.get(worldId) ?? []).filter((row) => row.target === target);
  return [...listFieldRows(worldId, target), ...pending];
}

/** 同一批里即将新建的字段，写成提案的 stateFieldOps，供条目条件引用 */
export function pendingFieldOps(worldId, ctx) {
  return ctx?.pendingFields.get(worldId) ?? [];
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

const bareKey = (key) => String(key).replace(/_(user|char)$/, '');

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

function assertNotReservedLabel(target, label) {
  if (target === 'world' && RESERVED_WORLD_FIELD_LABELS.includes(String(label).trim())) {
    fail(`世界层的「${label}」由世界档案管理，不能建成字段；开场时间和地点请用 update world 的 profile 写`);
  }
}

function toFieldOp(data, current = null) {
  const op = {};
  if ('label' in data) op.label = requireText(data.label, 'label');
  if ('type' in data) op.type = data.type;
  if ('description' in data) op.description = data.description;
  if ('options' in data) op.enum_options = data.options;
  if ('min' in data) op.min_value = data.min;
  if ('max' in data) op.max_value = data.max;
  if ('allow_empty' in data) op.allow_empty = data.allow_empty ? 1 : 0;
  if ('prefix' in data) op.prefix = data.prefix;
  if ('columns' in data) op.table_columns = data.columns;
  if ('nearby' in data) op.nearby_enabled = data.nearby;
  if ('update_instruction' in data) {
    op.update_instruction = data.update_instruction;
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

function fieldProposal(worldId, op) {
  return normalizeProposal({ type: 'world-card', operation: 'update', entityId: worldId, stateFieldOps: [op] });
}

function pickKey(input, target, rows) {
  const taken = new Set(rows.map((f) => bareKey(f.field_key)));
  if (!input.key?.trim()) return generateKey(input.label, taken);
  const key = bareKey(input.key.trim());
  const clash = rows.find((f) => bareKey(f.field_key) === key);
  if (clash) fail(`${target} 层已有 key 为 ${clash.field_key} 的字段（${clash.label}）；换一个 key，或省略 key 由系统生成`);
  return key;
}

export function planCreateField(worldId, data, ctx) {
  const input = parseFields(data, FIELD_SPEC, 'field', { options: { current: () => [] }, columns: { current: () => [], ...COLUMN_PATCH } });
  const { target } = input;
  if (!target) fail(`field 需要 target：${FIELD_TARGETS.join(' / ')}`);
  const label = requireText(input.label, 'label（字段显示名）').trim();
  if (!input.type) fail(`field 需要 type：${FIELD_TYPES.join(' / ')}`);
  assertNotReservedLabel(target, label);
  const rows = fieldRowsWithPending(worldId, target, ctx);
  const duplicate = rows.find((f) => f.label === label);
  if (duplicate) fail(`${target} 层已有同名字段 ${fieldRef(target, duplicate.field_key)}，要修改请用 update`);

  const op = { op: 'create', target, field_key: pickKey(input, target, rows), update_mode: 'manual', ...toFieldOp(input) };
  const proposal = fieldProposal(worldId, op);
  const row = proposal.stateFieldOps[0];
  if (!ctx.pendingFields.has(worldId)) ctx.pendingFields.set(worldId, []);
  ctx.pendingFields.get(worldId).push(row);
  return applyStep(proposal, `已创建 ${fieldRef(target, row.field_key)}（${row.label}）`);
}

export function planUpdateField(worldId, ref, data) {
  const current = findField(worldId, ref.target, ref.key);
  const input = parseFields(data, FIELD_UPDATE_SPEC, 'field', {
    options: { current: () => current.enum_options },
    columns: { current: () => current.table_columns, ...COLUMN_PATCH },
  });
  requireObjectKeys(input, 'field 没有要修改的字段');
  if ('label' in input) assertNotReservedLabel(ref.target, input.label);
  const proposal = fieldProposal(worldId, { op: 'update', target: ref.target, id: current.id, ...toFieldOp(input, current) });
  return applyStep(proposal, `已更新 ${fieldRef(ref.target, current.field_key)}`);
}

export function planRemoveField(worldId, ref) {
  const current = findField(worldId, ref.target, ref.key);
  const proposal = fieldProposal(worldId, { op: 'delete', target: ref.target, id: current.id });
  return applyStep(proposal, `已删除 ${fieldRef(ref.target, current.field_key)}（${current.label}）`);
}
