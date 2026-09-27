/**
 * state-update-context.js — 状态更新所需的字段定义/当前取值读取，及 prompt 各节组装
 *
 * 从 combined-state-updater.js 拆出：确定本轮活跃字段、读取世界/角色/玩家的默认值与
 * 会话运行时值，并渲染为 prompt 的 schema / values 文本段。
 */

import { getCharactersByIds } from '../db/queries/characters.js';

import { getWorldStateFieldsByWorldId } from '../db/queries/world-state-fields.js';
import { getAllWorldStateValues } from '../db/queries/world-state-values.js';
import { getSessionWorldStateValues } from '../db/queries/session-world-state-values.js';

import { getCharacterStateFieldsByWorldId } from '../db/queries/character-state-fields.js';
import { getCharacterStateValuesByCharacterIds } from '../db/queries/character-state-values.js';
import { getSessionCharacterStateValuesByCharacterIds } from '../db/queries/session-character-state-values.js';

import { getPersonaStateFieldsByWorldId } from '../db/queries/persona-state-fields.js';
import { getAllPersonaStateValues, getAllPersonaStateValuesByPersonaId } from '../db/queries/persona-state-values.js';
import { getSessionPersonaStateValues } from '../db/queries/session-persona-state-values.js';

/**
 * 筛选本轮需要更新的活跃字段：状态字段触发机制已收敛为一维 update_mode。
 * update_mode='llm_auto' 的字段每轮参与自动状态更新。
 */
export function filterActive(fields) {
  return fields.filter((f) => f.update_mode === 'llm_auto');
}

/**
 * 将 getAllXxxStateValues() 返回的行转换为 valueMap。
 * @param {object[]} values  含 field_key / default_value_json / runtime_value_json 的行
 * @returns {Record<string, {defaultValueJson, runtimeValueJson}>}
 */
function buildValueMap(values) {
  return Object.fromEntries(
    values.map((v) => [v.field_key, {
      defaultValueJson: v.default_value_json,
      runtimeValueJson: v.runtime_value_json,
    }])
  );
}

/**
 * 将活跃字段列表渲染为「字段定义」文本段（schema 部分，逐字节稳定，不含任何运行时取值）。
 * 仅依赖字段定义本身（key/label/type/range/enum/description/update_instruction），
 * 因此同一会话各轮调用输出完全一致，可作为 prompt cache 稳定前缀。
 * @param {object[]} fields    活跃字段列表
 */
function buildFieldsSchema(fields) {
  return fields
    .map((f) => {
      let line = `- ${f.field_key}（${f.label}，类型：${f.type}）`;
      if (f.description) line += `，说明：${f.description}`;
      if (f.type === 'enum' && f.enum_options?.length)
        line += `，可选值：[${f.enum_options.join(' / ')}]`;
      if (f.type === 'number') {
        const lo = f.min_value != null ? f.min_value : '不限';
        const hi = f.max_value != null ? f.max_value : '不限';
        line += `，范围：${lo} ~ ${hi}`;
        if (f.unit) line += `，单位：${f.unit}（仅展示用途，写入值仍为纯数字）`;
      }
      if (f.type === 'list') line += `，请返回字符串数组（如 ["条目1","条目2"]），替换整个列表`;
      if (f.type === 'datetime') line += `，请返回 ISO 局部时间字符串 "YYYY-MM-DDTHH:mm"（年份为正整数、可任意位数；月/日/时/分各 2 位，例 "1000-03-15T14:30" 或 "238-04-20T00:00"），不得使用其他格式`;
      if (f.type === 'table' && Array.isArray(f.table_columns) && f.table_columns.length) {
        const colDesc = f.table_columns.map((c) => {
          const lo = c.min != null ? c.min : '不限';
          const hi = c.max != null ? c.max : '不限';
          return `${c.key}（${c.label ?? c.key}，${lo}~${hi}）`;
        }).join(' / ');
        line += `，请返回对象 {列key: 数值,...}，列：[${colDesc}]，仅数值类型`;
      }
      if (f.update_instruction) line += `\n  更新说明：${f.update_instruction}`;
      return line;
    })
    .join('\n');
}

/**
 * 将活跃字段列表渲染为「当前取值」文本段（动态部分，逐轮变化）。
 * 只输出每个字段的默认值 / 当前运行时值，放在 messages 末尾，不进入 cache 前缀。
 * @param {object[]} fields    活跃字段列表
 * @param {object}   valueMap  buildValueMap 返回的映射
 */
function buildFieldsValues(fields, valueMap) {
  return fields
    .map((f) => {
      const cur = valueMap[f.field_key] ?? { defaultValueJson: f.default_value ?? null, runtimeValueJson: null };
      // 只暴露「有效当前值」= 运行时值优先，回退默认值。不再单独展示默认值，
      // 避免弱副模型把默认值当成「回退靶子」，每轮把已推进的运行值打回默认。
      const effectiveJson = cur.runtimeValueJson ?? cur.defaultValueJson;
      return `- ${f.field_key}：当前值：${formatValueForPrompt(effectiveJson, f)}`;
    })
    .join('\n');
}

/**
 * 合并全局默认值 Map 与会话级运行时值：defaultValueJson 来自全局，runtimeValueJson 优先取会话值。
 * @param {ReturnType<typeof buildValueMap>} globalMap  buildValueMap 返回的全局 Map
 * @param {Record<string, string|null>}      sessionMap getSessionXxxStateValues 返回的 { field_key → runtime_value_json }
 */
function mergeSessionValues(globalMap, sessionMap) {
  return Object.fromEntries(
    Object.entries(globalMap).map(([key, v]) => [
      key,
      { defaultValueJson: v.defaultValueJson, runtimeValueJson: sessionMap[key] ?? v.runtimeValueJson },
    ])
  );
}

export function loadStateUpdateTargets(worldId, characterIds, world) {
  const worldActiveFields = world ? filterActive(getWorldStateFieldsByWorldId(worldId)) : [];
  const characters = getCharactersByIds(characterIds || []);
  // 角色状态字段 schema 由 world_id 决定，取第一个有效角色的 world_id。
  const charWorldId = characters[0]?.world_id ?? worldId;
  const charSchemaFields = charWorldId ? filterActive(getCharacterStateFieldsByWorldId(charWorldId)) : [];
  const charactersWithFields = charSchemaFields.length > 0 ? characters : [];
  const personaActiveFields = world ? filterActive(getPersonaStateFieldsByWorldId(worldId)) : [];

  return { worldActiveFields, characters, charWorldId, charSchemaFields, charactersWithFields, personaActiveFields };
}

export function buildEntityStateSections(targets, { world, worldId, sessionId, session }) {
  const {
    worldActiveFields, charactersWithFields, charSchemaFields, personaActiveFields,
  } = targets;
  const schemaSections = [];
  const valueSections = [];
  const responseKeys = [];
  let worldValueMap = null;
  const charValueMaps = [];
  let personaValueMap = null;

  if (worldActiveFields.length > 0) {
    worldValueMap = mergeSessionValues(
      buildValueMap(getAllWorldStateValues(worldId)),
      getSessionWorldStateValues(sessionId, worldId)
    );
    const head = `=== 世界状态（"${world.name}"）===`;
    schemaSections.push(`${head}\n` + buildFieldsSchema(worldActiveFields));
    valueSections.push(`${head}\n` + buildFieldsValues(worldActiveFields, worldValueMap));
    responseKeys.push('"world"（世界状态）');
  }

  const charIds = charactersWithFields.map((char) => char.id);
  const charDefaults = getCharacterStateValuesByCharacterIds(charIds);
  const charSessionValues = getSessionCharacterStateValuesByCharacterIds(sessionId, charIds);
  for (let i = 0; i < charactersWithFields.length; i++) {
    const char = charactersWithFields[i];
    const charKey = `char_${i}`;
    const charValueMap = mergeSessionValues(
      buildValueMap(charDefaults[char.id]),
      charSessionValues[char.id]
    );
    charValueMaps[i] = charValueMap;
    const head = `=== 角色状态（key="${charKey}"，角色名"${char.name}"）===`;
    schemaSections.push(
      `${head}\n` +
        `注意：只追踪"${char.name}"自身的状态变化。与"${char.name}"直接相关、并真实发生在其身上的共同经历（如受伤、获得报酬、装备损耗、位置变化）也应计入角色状态；仅玩家独有的变化不要记到角色上。\n` +
        buildFieldsSchema(charSchemaFields)
    );
    valueSections.push(`${head}\n` + buildFieldsValues(charSchemaFields, charValueMap));
    responseKeys.push(`"${charKey}"（角色"${char.name}"状态）`);
  }

  if (personaActiveFields.length > 0) {
    // writing session 自带 persona_id；chat / 无 persona_id 时回退到 active persona
    const personaDefaults = session?.persona_id
      ? getAllPersonaStateValuesByPersonaId(session.persona_id)
      : getAllPersonaStateValues(worldId);
    personaValueMap = mergeSessionValues(
      buildValueMap(personaDefaults),
      getSessionPersonaStateValues(sessionId, worldId)
    );
    const head = `=== 玩家状态 ===`;
    schemaSections.push(
      `${head}\n` +
        `注意：只追踪玩家自身的变化，勿将角色的经历记录为玩家的状态。\n` +
        buildFieldsSchema(personaActiveFields)
    );
    valueSections.push(`${head}\n` + buildFieldsValues(personaActiveFields, personaValueMap));
    responseKeys.push('"persona"（玩家状态）');
  }

  return { schemaSections, valueSections, responseKeys, worldValueMap, charValueMaps, personaValueMap };
}

// ── 值格式化 ─────────────────────────────────────────────────────────────
// 值校验（validateValue）已提取至 backend/utils/state-field-validate.js，供本文件与
// backend/services/state-extract.js 共用，避免同一套类型规则出现两份实现。

function formatValueForPrompt(valueJson, field) {
  if (valueJson == null) return '（未设置）';

  // 兼容旧数据：无 default_value 的空字符串/空数组本质上是历史占位值，
  // 应继续视为"未设置"，让自动补全有机会运行。
  if (field.default_value == null) {
    if (field.type === 'text' && valueJson === '""') return '（未设置）';
    if (field.type === 'list' && valueJson === '[]') return '（未设置）';
  }

  return valueJson;
}
