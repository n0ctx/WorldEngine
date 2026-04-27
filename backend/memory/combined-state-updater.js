/**
 * combined-state-updater.js — 单次 LLM 调用同时更新世界/角色（可多个）/玩家状态
 *
 * 调用方：异步队列，优先级 2（不可丢弃）。
 * 替代原来三个独立 updater（character/world/persona-state-updater.js）。
 */

import * as llm from '../llm/index.js';
import { getMessagesBySessionId } from '../services/sessions.js';
import { getCharacterById } from '../db/queries/characters.js';
import { getWorldById } from '../db/queries/worlds.js';

import { getWorldStateFieldsByWorldId } from '../db/queries/world-state-fields.js';
import { getAllWorldStateValues } from '../db/queries/world-state-values.js';
import { upsertSessionWorldStateValue, getSessionWorldStateValues } from '../db/queries/session-world-state-values.js';

import { getCharacterStateFieldsByWorldId } from '../db/queries/character-state-fields.js';
import { getAllCharacterStateValues } from '../db/queries/character-state-values.js';
import { upsertSessionCharacterStateValue, getSessionCharacterStateValues } from '../db/queries/session-character-state-values.js';

import { getPersonaStateFieldsByWorldId } from '../db/queries/persona-state-fields.js';
import { getAllPersonaStateValues } from '../db/queries/persona-state-values.js';
import { upsertSessionPersonaStateValue, getSessionPersonaStateValues } from '../db/queries/session-persona-state-values.js';

import { ALL_MESSAGES_LIMIT, LLM_TASK_TEMPERATURE, LLM_STATE_UPDATE_MAX_TOKENS, DIARY_TIME_FIELD_KEY } from '../utils/constants.js';
import { getSessionById } from '../db/queries/sessions.js';
import { createLogger, formatMeta, previewText, shouldLogRaw } from '../utils/logger.js';
import { renderBackendPrompt } from '../prompts/prompt-loader.js';

const log = createLogger('all-state');

/**
 * 格式化当前时间为日记时间字符串（上海时区），如 "2026年4月21日14时"
 */
function formatRealTimeDiaryStr() {
  const now = new Date();
  const local = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  return `${local.getFullYear()}年${local.getMonth() + 1}月${local.getDate()}日${local.getHours()}时${local.getMinutes()}分`;
}

// ── 辅助函数（模块级） ──────────────────────────────────────────────────────

/**
 * 补全被截断的 JSON：通过括号栈追踪未闭合的 { 和 [，在末尾追加缺失的关闭符号。
 * 仅处理缺少关闭括号的情况（LLM 输出被 maxTokens 截断时最常见）。
 */
function repairTruncatedJson(text) {
  const stack = [];
  let inString = false;
  let escape = false;
  for (const ch of text) {
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  return text + stack.reverse().join('');
}

/**
 * 筛选本轮需要更新的活跃字段：状态字段触发机制已收敛为一维 update_mode。
 * update_mode='llm_auto' 的字段每轮参与自动状态更新。
 */
function filterActive(fields) {
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
 * 将活跃字段列表渲染为 Prompt 文本段（供 LLM 读取）。
 * @param {object[]} fields    活跃字段列表
 * @param {object}   valueMap  buildValueMap 返回的映射
 */
function buildFieldsDesc(fields, valueMap) {
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
      }
      if (f.type === 'list') line += `，请返回字符串数组（如 ["条目1","条目2"]），替换整个列表`;
      const cur = valueMap[f.field_key] ?? { defaultValueJson: f.default_value ?? null, runtimeValueJson: null };
      line += `，默认值：${formatValueForPrompt(cur.defaultValueJson, f)}，当前运行时值：${formatValueForPrompt(cur.runtimeValueJson, f)}`;
      if (f.update_instruction) line += `\n  更新说明：${f.update_instruction}`;
      return line;
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

/**
 * 将 LLM 返回的 patch 对象写入会话状态（校验 + upsert）。
 * @param {object[]} activeFields  本次活跃字段列表（用于 fieldMap 构建和校验）
 * @param {*}        patchData     patch 对象中对应此实体的子对象；非 object 时直接跳过
 * @param {Function} upsertFn      (key: string, valueJson: string|null) => void
 * @param {string}   logLabel      日志前缀（如 `world="xxx"`）
 */
function applyStatePatch(activeFields, patchData, upsertFn, logLabel) {
  if (!patchData || typeof patchData !== 'object') return;
  const fieldMap = Object.fromEntries(activeFields.map((f) => [f.field_key, f]));
  const updated = [];
  for (const [key, rawValue] of Object.entries(patchData)) {
    const field = fieldMap[key];
    if (!field) continue;
    const validated = validateValue(rawValue, field);
    if (validated === undefined) continue;
    const valueJson = validated === null ? null : JSON.stringify(validated);
    upsertFn(key, valueJson);
    updated.push(`${key}=${valueJson}`);
  }
  if (updated.length) log.info(`${logLabel}  updates: ${updated.join('  ')}`);
}

// ── 主函数 ──────────────────────────────────────────────────────────────────

/**
 * 单次 LLM 调用同时更新世界/角色（可多个）/玩家状态。
 *
 * @param {string|null} worldId
 * @param {string[]} characterIds  chat 模式传 [characterId]，写作模式传多个
 * @param {string} sessionId
 */
export async function updateAllStates(worldId, characterIds, sessionId) {
  const sid = sessionId.slice(0, 8);
  const world = worldId ? getWorldById(worldId) : null;
  log.info(`START  ${formatMeta({ session: sid, worldId: worldId ?? null, characterIds })}`);

  // 真实日期模式：直接写入当前系统时间（在 early-return 之前执行，确保每轮都更新）
  const session = getSessionById(sessionId);
  if (session?.diary_date_mode === 'real' && worldId) {
    const timeStr = formatRealTimeDiaryStr();
    upsertSessionWorldStateValue(sessionId, worldId, DIARY_TIME_FIELD_KEY, JSON.stringify(timeStr));
    log.info(`REAL TIME  ${formatMeta({ session: sid, time: timeStr })}`);
  }

  const messages = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  if (messages.length === 0) return;

  // ── 确定各类活跃字段 ──
  const worldActiveFields = world ? filterActive(getWorldStateFieldsByWorldId(worldId)) : [];

  const characters = (characterIds || []).map((id) => getCharacterById(id)).filter(Boolean);
  // 角色状态字段 schema 由 world_id 决定，取第一个有效角色的 world_id
  const charWorldId = characters[0]?.world_id ?? worldId;
  const charSchemaFields = charWorldId ? filterActive(getCharacterStateFieldsByWorldId(charWorldId)) : [];
  const charactersWithFields = charSchemaFields.length > 0 ? characters : [];

  const personaActiveFields = world ? filterActive(getPersonaStateFieldsByWorldId(worldId)) : [];

  if (worldActiveFields.length === 0 && charactersWithFields.length === 0 && personaActiveFields.length === 0) {
    log.info(`SKIP  ${formatMeta({ session: sid, reason: 'no-active-fields' })}`);
    return;
  }

  // 对话标注用名（用第一个角色名，没有则"角色"）
  const primaryName = characters[0]?.name ?? '角色';

  // ── 组装 prompt 各节 ──
  const sections = [];
  const responseKeys = [];

  if (worldActiveFields.length > 0) {
    const worldValueMap = mergeSessionValues(
      buildValueMap(getAllWorldStateValues(worldId)),
      getSessionWorldStateValues(sessionId, worldId)
    );
    sections.push(`=== 世界状态（"${world.name}"）===\n` + buildFieldsDesc(worldActiveFields, worldValueMap));
    responseKeys.push('"world"（世界状态）');
  }

  for (let i = 0; i < charactersWithFields.length; i++) {
    const char = charactersWithFields[i];
    const charKey = `char_${i}`;
    const charValueMap = mergeSessionValues(
      buildValueMap(getAllCharacterStateValues(char.id)),
      getSessionCharacterStateValues(sessionId, char.id)
    );
    sections.push(
      `=== 角色状态（key="${charKey}"，角色名"${char.name}"）===\n` +
        `注意：只追踪"${char.name}"自身的状态变化。与"${char.name}"直接相关、并真实发生在其身上的共同经历（如受伤、获得报酬、装备损耗、位置变化）也应计入角色状态；仅玩家独有的变化不要记到角色上。\n` +
        buildFieldsDesc(charSchemaFields, charValueMap)
    );
    responseKeys.push(`"${charKey}"（角色"${char.name}"状态）`);
  }

  if (personaActiveFields.length > 0) {
    const personaValueMap = mergeSessionValues(
      buildValueMap(getAllPersonaStateValues(worldId)),
      getSessionPersonaStateValues(sessionId, worldId)
    );
    sections.push(
      `=== 玩家状态 ===\n` +
        `注意：只追踪玩家自身的变化，勿将角色的经历记录为玩家的状态。\n` +
        buildFieldsDesc(personaActiveFields, personaValueMap)
    );
    responseKeys.push('"persona"（玩家状态）');
  }

  // 对话上下文：取最近 4 条（2 轮），分"上一轮"/"本轮"打标签
  const recentMsgs = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-4);
  const formatMsg = (m) => `${m.role === 'user' ? '玩家' : primaryName}：${m.content}`;
  const currentTurn = recentMsgs.slice(-2);
  // length > 2：无论是单条开场白还是完整的上一轮，都纳入"上一轮"
  const prevTurn = recentMsgs.length > 2 ? recentMsgs.slice(0, -2) : [];
  const dialogueParts = [];
  if (prevTurn.length > 0) {
    dialogueParts.push(`【上一轮（仅供背景参考，状态已处理）】\n${prevTurn.map(formatMsg).join('\n')}`);
  }
  dialogueParts.push(`【本轮（请据此判断状态变化）】\n${currentTurn.map(formatMsg).join('\n')}`);
  const dialogue = dialogueParts.join('\n\n');

  const exampleKeys = [
    worldActiveFields.length > 0 ? '"world": {"date": "第三纪元第101年"}' : null,
    charactersWithFields[0] ? '"char_0": {"mood": "开心"}' : null,
    personaActiveFields.length > 0 ? '"persona": {"health": 85}' : null,
  ]
    .filter(Boolean)
    .join(', ');

  const prompt = [
    {
      role: 'user',
      content: renderBackendPrompt('state-update.md', {
        SECTIONS: sections.join('\n\n'),
        DIALOGUE: dialogue,
        RESPONSE_KEYS: responseKeys.join('、'),
        EXAMPLE_KEYS: exampleKeys,
      }),
    },
  ];

  log.info(`CALL  ${formatMeta({
    session: sid,
    worldFields: worldActiveFields.length,
    characterFields: charSchemaFields.length,
    characters: charactersWithFields.map((c) => c.name),
    personaFields: personaActiveFields.length,
    promptChars: prompt[0].content.length,
  })}`);

  // thinking_level: null — 显式禁用 thinking，防止 thinking tokens 占用 maxOutputTokens 配额导致 JSON 输出被截断
  const raw = await llm.complete(prompt, { temperature: LLM_TASK_TEMPERATURE, maxTokens: LLM_STATE_UPDATE_MAX_TOKENS, thinking_level: null });
  if (!raw) return;
  log.info(`RAW  ${formatMeta({ session: sid, chars: raw.length, preview: shouldLogRaw('llm_raw') ? previewText(raw) : undefined })}`);

  let patch;
  try {
    const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonSource = codeBlock ? codeBlock[1].trim() : raw;
    // 优先匹配完整 JSON 对象；若 LLM 截断导致末尾无 }，则取从 { 开始的所有内容
    const match = jsonSource.match(/\{[\s\S]*\}/) || jsonSource.match(/\{[\s\S]*/);
    if (!match) return;
    let jsonStr = match[0];
    try {
      patch = JSON.parse(jsonStr);
    } catch {
      // 尝试补全截断的 JSON（追加缺失的 } / ]）
      const repaired = repairTruncatedJson(jsonStr);
      patch = JSON.parse(repaired);
      log.info(`JSON REPAIRED  ${formatMeta({ session: sid, appended: repaired.length - jsonStr.length })}`);
    }
  } catch {
    log.warn(`JSON PARSE FAIL  ${formatMeta({ session: sid, preview: previewText(raw) })}`);
    return;
  }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return;

  // ── 写入各类状态（会话级） ──
  if (worldActiveFields.length > 0) {
    applyStatePatch(worldActiveFields, patch.world,
      (key, json) => upsertSessionWorldStateValue(sessionId, worldId, key, json),
      `world="${world.name}"`
    );
  }

  for (let i = 0; i < charactersWithFields.length; i++) {
    const char = charactersWithFields[i];
    applyStatePatch(charSchemaFields, patch[`char_${i}`],
      (key, json) => upsertSessionCharacterStateValue(sessionId, char.id, key, json),
      `char="${char.name}"`
    );
  }

  if (personaActiveFields.length > 0) {
    applyStatePatch(personaActiveFields, patch.persona,
      (key, json) => upsertSessionPersonaStateValue(sessionId, worldId, key, json),
      `persona  world="${world?.name}"`
    );
  }
}

// ── 值校验与格式化 ───────────────────────────────────────────────────────────

/**
 * 校验 LLM 返回的值是否符合字段类型约束。
 * 返回 undefined 表示校验失败（丢弃）；返回 null 表示允许空值。
 */
function validateValue(value, field) {
  if (value === null || value === undefined || value === '') {
    return field.allow_empty ? null : undefined;
  }

  switch (field.type) {
    case 'text': {
      if (typeof value !== 'string') return undefined;
      return value;
    }
    case 'number': {
      const num = typeof value === 'number' ? value : Number(value);
      if (!isFinite(num)) return undefined;
      if (field.min_value != null && num < field.min_value) return undefined;
      if (field.max_value != null && num > field.max_value) return undefined;
      return num;
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      return undefined;
    }
    case 'enum': {
      if (typeof value !== 'string') return undefined;
      if (field.enum_options && !field.enum_options.includes(value)) return undefined;
      return value;
    }
    case 'list': {
      if (typeof value === 'string') {
        value = value.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
      }
      if (!Array.isArray(value)) return undefined;
      const items = value.map(String).filter(Boolean);
      if (items.length === 0) return field.allow_empty ? [] : undefined;
      return items;
    }
    default:
      return undefined;
  }
}

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

export const __testables = {
  filterActive,
  buildValueMap,
  buildFieldsDesc,
  applyStatePatch,
  validateValue,
  formatValueForPrompt,
};
