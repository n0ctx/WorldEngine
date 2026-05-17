// dispatch_subagent 的 stateValues typed 入参解析器：
// 父代理只传 {field|field_key, value}，这里读 world card schema 把它解析成
// 已校验的 stateValueOps（{target, field_key, value_json}），再交给子代理直接 apply。
// 失败立刻返回给父代理，**不再走 sub-agent LLM**，杜绝"猜格式"导致的 proposal 校验失败。
//
// 关键 reuse：type 校验/强转完全委托给 backend/services/state-values.js#validateStateValue
// （apply 阶段也是它），保证 dispatch-time precheck 与 apply-time validate 行为一致。

import { getPersonaStateFieldsByWorldId } from '../../../../backend/db/queries/persona-state-fields.js';
import { getCharacterStateFieldsByWorldId } from '../../../../backend/db/queries/character-state-fields.js';
import { getPersonaById } from '../../../../backend/db/queries/personas.js';
import { getCharacterById } from '../../../../backend/db/queries/characters.js';
import { validateStateValue } from '../../../../backend/services/state-values.js';
import { normalizeStateValueOps } from '../../normalize-proposal.js';

const SCHEMA_LOADERS = {
  'persona-card': { target: 'persona', load: getPersonaStateFieldsByWorldId },
  'character-card': { target: 'character', load: getCharacterStateFieldsByWorldId },
};

export const SUPPORTED_TARGET_TYPES = Object.keys(SCHEMA_LOADERS);

/**
 * 计划里 step-2 写 persona/character state 时，它真正绑定的世界可能不是用户当前 context.worldId：
 * 比如 step-1 先 create 了一个新世界，step-2 通过 dependsOn 引用它。这里把 entityRef 反向解析回 worldId，
 * 避免拿错世界的 schema 误判校验失败（Codex P1）。
 *
 * @param {object} arg
 * @param {string} arg.targetType - 'persona-card' | 'character-card'
 * @param {string} arg.operation
 * @param {string|null} arg.entityRef - 可能是 worldId / personaId / characterId / 'context.*' 占位
 * @param {object} [arg.context] - { worldId, characterId }
 * @param {object} [arg.deps] - 测试可注入 getPersonaById / getCharacterById
 * @returns {string|null}
 */
export function deriveWorldIdForStateValues({ targetType, operation, entityRef, context = {}, deps = {} }) {
  const contextWorldId = context?.worldId ?? null;
  const contextCharacterId = context?.characterId ?? null;
  let ref = entityRef;
  if (ref === 'context.worldId') ref = contextWorldId;
  else if (ref === 'context.characterId') ref = contextCharacterId;
  if (operation === 'create') return ref || contextWorldId || null;
  if (!ref) return contextWorldId || null;
  if (targetType === 'persona-card') {
    const persona = (deps.getPersonaById ?? getPersonaById)(ref);
    if (persona?.world_id) return persona.world_id;
  } else if (targetType === 'character-card') {
    const character = (deps.getCharacterById ?? getCharacterById)(ref);
    if (character?.world_id) return character.world_id;
  }
  return ref;
}

function buildFieldIndex(fields) {
  const byKey = new Map();
  const byLabel = new Map();
  const conflictLabels = new Set();
  for (const f of fields) {
    if (f.field_key) byKey.set(f.field_key, f);
    if (!f.label) continue;
    const k = String(f.label).trim().toLowerCase();
    if (!k) continue;
    if (byLabel.has(k)) conflictLabels.add(k);
    else byLabel.set(k, f);
  }
  return { byKey, byLabel, conflictLabels };
}

function resolveField(entry, index) {
  const explicitKey = String(entry.field_key ?? '').trim();
  if (explicitKey) {
    const f = index.byKey.get(explicitKey);
    if (!f) return { error: `field_key "${explicitKey}" 在世界状态字段中不存在` };
    return { field: f };
  }
  const labelKey = String(entry.field ?? '').trim().toLowerCase();
  if (!labelKey) return { error: 'stateValues 项必须提供 field 或 field_key' };
  if (index.conflictLabels.has(labelKey)) {
    return { error: `label "${entry.field}" 在世界状态字段中存在多个同名条目，请改用 field_key 精确指定` };
  }
  const f = index.byLabel.get(labelKey);
  if (!f) return { error: `label "${entry.field}" 在世界状态字段中找不到对应字段，请确认拼写或改用 field_key` };
  return { field: f };
}

function coerceValueJson(field, rawValue) {
  if (rawValue === null && !field.allow_empty) {
    return { error: `字段 "${field.field_key}" 不允许为空（allow_empty=0），不能传 null` };
  }
  const validated = validateStateValue(rawValue, field);
  if (validated === undefined) {
    return { error: `字段 "${field.field_key}" 的 value 不符合 type=${field.type} 约束（收到 ${JSON.stringify(rawValue)}）` };
  }
  return { value_json: validated === null ? null : JSON.stringify(validated) };
}

/**
 * @param {object} arg
 * @param {string} arg.worldId
 * @param {string} arg.targetType - 'persona-card' | 'character-card'
 * @param {Array} arg.entries - [{field?, field_key?, value, target?}]
 * @param {object} [arg.deps] - 测试可注入 schema loader
 * @returns {{success: true, stateValueOps: Array} | {success: false, error: string}}
 */
export function resolveStateValues({ worldId, targetType, entries, deps = {} }) {
  const cfg = SCHEMA_LOADERS[targetType];
  if (!cfg) {
    return { success: false, error: `stateValues 当前仅支持 ${SUPPORTED_TARGET_TYPES.join(' / ')}，收到 ${targetType}` };
  }
  if (!worldId) {
    return { success: false, error: 'stateValues 解析需要 context.worldId；请确认任务上下文已选中世界' };
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    return { success: false, error: 'stateValues 必须是非空数组' };
  }
  const loader = deps.loadFields ?? cfg.load;
  let fields;
  try {
    fields = loader(worldId);
  } catch (err) {
    return { success: false, error: `加载世界状态字段失败：${err?.message ?? err}` };
  }
  if (!Array.isArray(fields) || fields.length === 0) {
    return { success: false, error: `世界 ${worldId} 当前没有可写入的 ${cfg.target} 状态字段；请先 dispatch_subagent(world-card, update) 定义字段` };
  }
  const index = buildFieldIndex(fields);
  const out = [];
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i] ?? {};
    if (!Object.hasOwn(entry, 'value')) {
      return { success: false, error: `stateValues[${i}] 缺少 value 字段（如需清空请显式传 value: null）` };
    }
    if (entry.target && entry.target !== cfg.target) {
      return { success: false, error: `stateValues[${i}].target="${entry.target}" 与 targetType=${targetType} 不一致（应为 "${cfg.target}"）` };
    }
    const resolved = resolveField(entry, index);
    if (resolved.error) return { success: false, error: `stateValues[${i}]: ${resolved.error}` };
    const coerced = coerceValueJson(resolved.field, entry.value);
    if (coerced.error) return { success: false, error: `stateValues[${i}]: ${coerced.error}` };
    out.push({
      target: cfg.target,
      field_key: resolved.field.field_key,
      value_json: coerced.value_json,
    });
  }
  // 末尾再用 proposal normalizer 跑一遍形状校验：apply 阶段也会重跑，
  // 这里同源校验确保任何 stateValueOps schema 变化两边同步失败，杜绝静默漂移。
  try {
    normalizeStateValueOps(out, targetType);
  } catch (err) {
    return { success: false, error: `stateValues 形状校验失败：${err?.message ?? err}` };
  }
  return { success: true, stateValueOps: out };
}

export const __testables = {
  buildFieldIndex,
  coerceValueJson,
  resolveField,
};
