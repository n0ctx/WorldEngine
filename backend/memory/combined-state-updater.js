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
import { getPersonaById } from '../db/queries/personas.js';
import { getAllPersonaStateValues, getAllPersonaStateValuesByPersonaId } from '../db/queries/persona-state-values.js';
import { upsertSessionPersonaStateValue, getSessionPersonaStateValues } from '../db/queries/session-persona-state-values.js';

import {
  createNearbyCharacter,
  deleteTransientNotInIds,
  touchNearbyRows,
  getNearbyByName,
  listNearbyBySessionId,
  updateNearbyPersona,
  updateNearbyName,
} from '../db/queries/session-nearby-characters.js';
import {
  getStateValuesByNearbyId,
  upsertNearbyStateValue,
} from '../db/queries/session-nearby-character-state-values.js';
import { buildNearbyPromptSection } from '../prompts/nearby-prompt.js';

import { ALL_MESSAGES_LIMIT, LLM_TASK_TEMPERATURE, LLM_STATE_UPDATE_MAX_TOKENS, LLM_STATE_COMPRESS_MAX_TOKENS, DIARY_TIME_FIELD_KEY, STATE_TEXT_MAX_LENGTH, STATE_TEXT_COMPRESS_TARGET, STATE_LIST_MAX_ITEMS, STATE_LIST_TRIM_TARGET, STATE_UPDATE_JSON_RETRY_MAX, LLM_BACKGROUND_TASK_TIMEOUT_MS } from '../utils/constants.js';
import { getSessionById } from '../db/queries/sessions.js';
import { createLogger, formatMeta, previewText, shouldLogRaw } from '../utils/logger.js';
import { renderBackendPrompt } from '../prompts/prompt-loader.js';
import { resolveAuxScope } from '../utils/aux-scope.js';
import { stripThinkBlocksFromText } from '../utils/turn-dialogue.js';

const log = createLogger('all-state');

/**
 * 格式化当前时间为日记时间字符串（上海时区），ISO 局部时间 "YYYY-MM-DDTHH:mm"
 */
function formatRealTimeDiaryStr() {
  const now = new Date();
  const local = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(local.getFullYear(), 4)}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`;
}

const ISO_DATETIME_RE = /^\d+-\d{2}-\d{2}T\d{2}:\d{2}$/;

// ── 辅助函数（模块级） ──────────────────────────────────────────────────────

/**
 * 补全被截断的 JSON：通过括号栈追踪未闭合的 { 和 [，在末尾追加缺失的关闭符号。
 * 仅处理缺少关闭括号的情况（LLM 输出被 maxTokens 截断时最常见）。
 */
// 部分 reasoning 模型即便已通过副模型配置关闭思考，仍可能在输出里夹带 <think>…</think>（或服务端故障重开思考）。
// 思考块里包含大量 {/} 会污染贪婪 JSON 提取，解析前先剥离做 defense-in-depth。
// 复用 turn-dialogue 的栈式剥除，避免非贪婪正则在 think 内回放字面 </think> 时提前闭合。
function stripThinkBlocks(text) {
  if (typeof text !== 'string') return text;
  return stripThinkBlocksFromText(text).trim();
}

/**
 * 修复常见 LLM JSON 输出问题（单遍状态机）：
 *  1. 补全截断括号（原 repairTruncatedJson 功能保留）
 *  2. 去除字符串外的尾部逗号（{"a":1,} 或 [1,2,]）
 *  3. 去除字符串外的 JavaScript 单行注释（// ...）
 *
 * 进入 inString=true 后所有修复逻辑均跳过，不会破坏字符串内容。
 */
function repairJsonIssues(text) {
  const out = [];
  const stack = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) { out.push(ch); escape = false; continue; }
    if (ch === '\\' && inString) { out.push(ch); escape = true; continue; }
    if (ch === '"') { out.push(ch); inString = !inString; continue; }
    if (inString) { out.push(ch); continue; }

    // 单行注释：跳过直到行尾
    if (ch === '/' && i + 1 < text.length && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    // 尾部逗号：下一个非空字符是 } 或 ] 时跳过
    if (ch === ',') {
      let j = i + 1;
      while (j < text.length && (text[j] === ' ' || text[j] === '\t' || text[j] === '\n' || text[j] === '\r')) j++;
      if (text[j] === '}' || text[j] === ']') continue;
      out.push(ch);
      continue;
    }
    if (ch === '{') { out.push(ch); stack.push('}'); continue; }
    if (ch === '[') { out.push(ch); stack.push(']'); continue; }
    if (ch === '}' || ch === ']') { out.push(ch); stack.pop(); continue; }
    out.push(ch);
  }
  return out.join('') + stack.reverse().join('');
}

/**
 * 从 LLM 原始输出中提取并解析 JSON patch 对象。
 * 依次尝试：直接解析 → repairJsonIssues 修复后解析。
 * 成功返回 patch 对象；失败返回 null。
 */
function extractJsonPatch(raw, sid) {
  try {
    const cleaned = stripThinkBlocks(raw);
    const codeBlock = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonSource = codeBlock ? codeBlock[1].trim() : cleaned;
    const match = jsonSource.match(/\{[\s\S]*\}/) || jsonSource.match(/\{[\s\S]*/);
    if (!match) return null;
    const jsonStr = match[0];
    try {
      return JSON.parse(jsonStr);
    } catch {
      const repaired = repairJsonIssues(jsonStr);
      const result = JSON.parse(repaired);
      log.info(`JSON REPAIRED  ${formatMeta({ session: sid, appended: repaired.length - jsonStr.length })}`);
      return result;
    }
  } catch {
    return null;
  }
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

/**
 * 检查 patch 中 text/list 字段是否超限，超限时调用 LLM 压缩后就地修改 patch。
 * 必须在 applyStatePatch 之前调用，以便 validateValue 处理压缩后的值。
 */
async function compressOverLimitFields(patch, entityFieldPairs, sid, sessionId) {
  const overLengthText = [];
  const overLengthList = [];

  for (const { entityKey, fields, patchData, valueMap } of entityFieldPairs) {
    const fieldMap = Object.fromEntries(fields.map((f) => [f.field_key, f]));
    if (patchData) {
      for (const [key, value] of Object.entries(patchData)) {
        const field = fieldMap[key];
        if (!field) continue;
        if (field.type === 'text' && typeof value === 'string' && value.length > STATE_TEXT_MAX_LENGTH) {
          overLengthText.push({ entityKey, fieldKey: key, value });
        } else if (field.type === 'list' && Array.isArray(value) && value.length > STATE_LIST_MAX_ITEMS) {
          overLengthList.push({ entityKey, fieldKey: key, value });
        }
      }
    }
    // 兜底：LLM 未在本轮 patch 中提及的字段，若现有运行时值已超限，也加入压缩队列；
    // 否则一旦历史数据超过阈值，将永远无法被收敛回上限。
    if (!valueMap) continue;
    for (const field of fields) {
      const key = field.field_key;
      if (patchData && Object.prototype.hasOwnProperty.call(patchData, key)) continue;
      const cur = valueMap[key];
      const json = cur?.runtimeValueJson;
      if (!json) continue;
      let parsed;
      try { parsed = JSON.parse(json); } catch { continue; }
      if (field.type === 'text' && typeof parsed === 'string' && parsed.length > STATE_TEXT_MAX_LENGTH) {
        overLengthText.push({ entityKey, fieldKey: key, value: parsed });
      } else if (field.type === 'list' && Array.isArray(parsed) && parsed.length > STATE_LIST_MAX_ITEMS) {
        overLengthList.push({ entityKey, fieldKey: key, value: parsed });
      }
    }
  }

  if (overLengthText.length === 0 && overLengthList.length === 0) return;

  log.info(`COMPRESS  ${formatMeta({ session: sid, text: overLengthText.length, list: overLengthList.length })}`);

  const textSection = overLengthText.length > 0
    ? `## 文本压缩\n以下字段值过长（超过 ${STATE_TEXT_MAX_LENGTH} 字），请将每个值压缩到 ${STATE_TEXT_COMPRESS_TARGET} 字以内，保留核心信息：\n` +
      overLengthText.map((x) => `- ${x.entityKey}.${x.fieldKey}（${x.value.length}字）: ${x.value}`).join('\n')
    : '';

  const listSection = overLengthList.length > 0
    ? `## 列表裁剪\n以下列表字段条目过多（超过 ${STATE_LIST_MAX_ITEMS} 个），请保留最重要/最新的 ${STATE_LIST_TRIM_TARGET} 个条目，丢弃最久远、价值最低的条目，返回字符串数组：\n` +
      overLengthList.map((x) => `- ${x.entityKey}.${x.fieldKey}（${x.value.length}条）: ${JSON.stringify(x.value)}`).join('\n')
    : '';

  const prompt = [{ role: 'user', content: renderBackendPrompt('state-compress.md', { TEXT_SECTION: textSection, LIST_SECTION: listSection }) }];

  const raw = await llm.complete(prompt, {
    temperature: 0,
    maxTokens: LLM_STATE_COMPRESS_MAX_TOKENS,
    configScope: resolveAuxScope(sessionId),
    callType: 'state_compress',
    conversationId: sessionId,
    timeoutMs: LLM_BACKGROUND_TASK_TIMEOUT_MS,
  });

  let compressed = null;
  if (raw) {
    try {
      const cleaned = stripThinkBlocks(raw);
      const codeBlock = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonSource = codeBlock ? codeBlock[1].trim() : cleaned;
      const match = jsonSource.match(/\{[\s\S]*\}/) || jsonSource.match(/\{[\s\S]*/);
      if (match) {
        try { compressed = JSON.parse(match[0]); }
        catch { compressed = JSON.parse(repairJsonIssues(match[0])); }
      }
    } catch {
      log.warn(`COMPRESS PARSE FAIL  ${formatMeta({ session: sid, preview: previewText(raw) })}`);
    }
  }
  if (!compressed || typeof compressed !== 'object') compressed = {};

  // 确保 patch[entityKey] 是普通对象；若 LLM 返回畸形桶（字符串/数字/数组等），
  // 直接覆盖为 {}，避免给非对象赋属性触发严格模式 TypeError 中断整个更新流程。
  const ensureBucket = (entityKey) => {
    const cur = patch[entityKey];
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) patch[entityKey] = {};
    return patch[entityKey];
  };

  for (const { entityKey, fieldKey } of overLengthText) {
    const val = compressed?.[entityKey]?.[fieldKey];
    if (typeof val === 'string' && val.length > 0) {
      ensureBucket(entityKey)[fieldKey] = val;
      log.info(`COMPRESS TEXT OK  ${formatMeta({ session: sid, field: `${entityKey}.${fieldKey}`, chars: val.length })}`);
    }
  }
  for (const { entityKey, fieldKey, value: original } of overLengthList) {
    const val = compressed?.[entityKey]?.[fieldKey];
    if (Array.isArray(val) && val.length > 0 && val.length <= STATE_LIST_MAX_ITEMS) {
      ensureBucket(entityKey)[fieldKey] = val;
      log.info(`COMPRESS LIST OK  ${formatMeta({ session: sid, field: `${entityKey}.${fieldKey}`, items: val.length })}`);
    } else {
      // 兜底：LLM 未返回有效裁剪结果时，硬截取最近的 STATE_LIST_TRIM_TARGET 条，避免列表无限增长
      const trimmed = original.slice(-STATE_LIST_TRIM_TARGET);
      ensureBucket(entityKey)[fieldKey] = trimmed;
      log.warn(`COMPRESS LIST FALLBACK  ${formatMeta({ session: sid, field: `${entityKey}.${fieldKey}`, from: original.length, to: trimmed.length })}`);
    }
  }
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
  let worldValueMap = null;
  const charValueMaps = [];
  let personaValueMap = null;

  if (worldActiveFields.length > 0) {
    worldValueMap = mergeSessionValues(
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
    charValueMaps[i] = charValueMap;
    sections.push(
      `=== 角色状态（key="${charKey}"，角色名"${char.name}"）===\n` +
        `注意：只追踪"${char.name}"自身的状态变化。与"${char.name}"直接相关、并真实发生在其身上的共同经历（如受伤、获得报酬、装备损耗、位置变化）也应计入角色状态；仅玩家独有的变化不要记到角色上。\n` +
        buildFieldsDesc(charSchemaFields, charValueMap)
    );
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
    sections.push(
      `=== 玩家状态 ===\n` +
        `注意：只追踪玩家自身的变化，勿将角色的经历记录为玩家的状态。\n` +
        buildFieldsDesc(personaActiveFields, personaValueMap)
    );
    responseKeys.push('"persona"（玩家状态）');
  }

  // ── 写作模式：组装 nearby pool 段（位置：character 段之后，在玩家段之后追加亦可，
  //    spec 描述为"character 段之后"，这里在 sections 末尾追加，与 persona 并列） ──
  const isWriting = session?.mode === 'writing';
  let nearbyPool = null;
  let nearbyEnabledFields = null;
  let nearbyPlayerName = '';
  if (isWriting && charWorldId) {
    if (session?.persona_id) {
      const persona = getPersonaById(session.persona_id);
      nearbyPlayerName = typeof persona?.name === 'string' ? persona.name.trim() : '';
    }
    nearbyEnabledFields = getCharacterStateFieldsByWorldId(charWorldId)
      .filter((f) => Number(f.nearby_enabled) === 1);
    const rows = listNearbyBySessionId(sessionId);
    nearbyPool = rows.map((row) => {
      const values = getStateValuesByNearbyId(row.id);
      const state = {};
      for (const v of values) {
        if (v.runtime_value_json == null) continue;
        try { state[v.field_key] = JSON.parse(v.runtime_value_json); }
        catch { state[v.field_key] = v.runtime_value_json; }
      }
      return {
        id: row.id,
        name: row.name,
        is_saved: Number(row.is_saved) === 1 ? 1 : 0,
        persona: row.persona ?? '',
        state,
      };
    });
    sections.push(
      `=== 登场角色（nearby_characters）===\n` +
        buildNearbyPromptSection(nearbyPool, nearbyEnabledFields, { playerName: nearbyPlayerName })
    );
    responseKeys.push('"nearby_characters"（本轮登场角色，数组）');
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

  // thinking_level 由副模型配置决定（用户在 UI 选择，例如 deepseek 选 thinking_disabled）；这里不再硬编码 null 覆盖。
  // ── LLM 调用 + JSON 解析（含 JSON 失败重试） ────────────────────────────
  let patch = null;
  let lastRaw = null;

  for (let attempt = 0; attempt <= STATE_UPDATE_JSON_RETRY_MAX; attempt++) {
    const raw = await llm.complete(prompt, {
      temperature: LLM_TASK_TEMPERATURE,
      maxTokens: LLM_STATE_UPDATE_MAX_TOKENS,
      configScope: resolveAuxScope(sessionId),
      callType: 'state_update',
      conversationId: sessionId,
      timeoutMs: LLM_BACKGROUND_TASK_TIMEOUT_MS,
    });
    if (!raw) return;  // LLM API 失败，不进入 JSON 重试
    lastRaw = raw;
    log.info(`RAW  ${formatMeta({ session: sid, chars: raw.length, attempt, preview: shouldLogRaw('llm_raw') ? previewText(raw) : undefined })}`);

    patch = extractJsonPatch(raw, sid);
    if (patch !== null) break;

    if (attempt < STATE_UPDATE_JSON_RETRY_MAX) {
      log.warn(`JSON RETRY ${attempt + 1}/${STATE_UPDATE_JSON_RETRY_MAX}  ${formatMeta({ session: sid, preview: previewText(raw) })}`);
    }
  }

  if (patch === null) {
    log.warn(`JSON PARSE FAIL  ${formatMeta({ session: sid, preview: previewText(lastRaw) })}`);
    return;
  }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return;

  // ── 字数/列表检查：超限时压缩后再写入 ──
  await compressOverLimitFields(patch, [
    ...(worldActiveFields.length > 0 ? [{ entityKey: 'world', fields: worldActiveFields, patchData: patch.world, valueMap: worldValueMap }] : []),
    ...charactersWithFields.map((_, i) => ({ entityKey: `char_${i}`, fields: charSchemaFields, patchData: patch[`char_${i}`], valueMap: charValueMaps[i] })),
    ...(personaActiveFields.length > 0 ? [{ entityKey: 'persona', fields: personaActiveFields, patchData: patch.persona, valueMap: personaValueMap }] : []),
  ], sid, sessionId);

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

  // ── 写作模式：应用 nearby_characters 输出 ──
  if (isWriting && nearbyEnabledFields && nearbyPool) {
    applyNearbyResult({
      sessionId,
      worldId: charWorldId,
      fields: nearbyEnabledFields,
      nearby_characters: patch.nearby_characters,
      pool: nearbyPool,
      playerName: nearbyPlayerName,
    });
  }
}

/**
 * 把 LLM 输出的 nearby_characters 应用到 DB（写作模式）。
 *
 * 规则：
 *  1. ref_id 命中池 → 更新该 nearby（name/persona/state）
 *  2. ref_id 不命中 → 整条丢弃（log.warn）
 *  3. ref_id=null + name 命中池 → 等同 ref_id 命中
 *  4. ref_id=null + name 不在池 → 新建 transient（is_saved=0），写入 state
 *  5. 池里没回的 transient 删除（saved 永远保留）
 *  6. 未启用字段或类型校验失败 → 跳过
 *
 * @param {object}   params
 * @param {string}   params.sessionId
 * @param {string}   params.worldId
 * @param {object[]} params.fields              启用的 character_state_fields
 * @param {*}        params.nearby_characters   LLM 输出（可能不是数组）
 * @param {Array<{id:string,name:string,is_saved:0|1}>} params.pool
 */
export function applyNearbyResult({ sessionId, worldId: _worldId, fields, nearby_characters, pool, playerName = '' }) {
  const items = Array.isArray(nearby_characters) ? nearby_characters : [];
  const enabledKeys = new Set(fields.map((f) => f.field_key));
  const fieldByKey = Object.fromEntries(fields.map((f) => [f.field_key, f]));
  const poolById = Object.fromEntries(pool.map((p) => [p.id, p]));
  const poolByName = Object.fromEntries(pool.map((p) => [p.name, p]));
  const seenIds = new Set();
  const playerNameTrim = typeof playerName === 'string' ? playerName.trim() : '';

  const applyState = (targetId, stateObj) => {
    if (!stateObj || typeof stateObj !== 'object' || Array.isArray(stateObj)) return;
    for (const [k, raw] of Object.entries(stateObj)) {
      if (!enabledKeys.has(k)) continue;
      const field = fieldByKey[k];
      const validated = validateValue(raw, field);
      if (validated === undefined) continue;
      const valueJson = validated === null ? null : JSON.stringify(validated);
      upsertNearbyStateValue({ sessionId, nearbyId: targetId, fieldKey: k, valueJson });
    }
  };

  const applyPatch = (targetId, item) => {
    const poolItem = poolById[targetId];
    if (typeof item.persona === 'string') {
      updateNearbyPersona(targetId, item.persona);
    }
    // 改名：仅当 LLM 给了非空 name 且与现有不同 且 池内无同名占用
    if (typeof item.name === 'string' && item.name.trim() && poolItem && item.name !== poolItem.name) {
      const conflict = poolByName[item.name];
      if (!conflict) {
        updateNearbyName(targetId, item.name);
      } else if (conflict.id === targetId) {
        // 同 id 同名（极端情况），无操作
      } else {
        log.warn(`NEARBY RENAME SKIP  ${formatMeta({ session: sessionId.slice(0, 8), id: targetId, want: item.name, conflictId: conflict.id })}`);
      }
    }
    applyState(targetId, item.state);
    seenIds.add(targetId);
  };

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const itemName = typeof item.name === 'string' ? item.name.trim() : '';
    if (playerNameTrim && itemName && itemName === playerNameTrim) {
      log.warn(`NEARBY DROP PLAYER  ${formatMeta({ session: sessionId.slice(0, 8), name: itemName })}`);
      continue;
    }
    const refId = item.ref_id ?? null;
    if (refId) {
      if (poolById[refId]) {
        applyPatch(refId, item);
      } else {
        log.warn(`NEARBY REF MISS  ${formatMeta({ session: sessionId.slice(0, 8), ref_id: refId })}`);
      }
      continue;
    }
    // ref_id == null
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!name) continue;
    if (poolByName[name]) {
      applyPatch(poolByName[name].id, item);
      continue;
    }
    // 新建 transient
    // 同步到 DB 之前，先确认 name 在 DB 层不会重复（与池一致即可，因为池源自 list）
    const persona = typeof item.persona === 'string' ? item.persona : '';
    let newId;
    try {
      newId = createNearbyCharacter({ sessionId, name, persona, isSaved: 0 });
    } catch (err) {
      // UNIQUE 冲突等场景兜底
      log.warn(`NEARBY CREATE FAIL  ${formatMeta({ session: sessionId.slice(0, 8), name, error: err.message })}`);
      const existed = getNearbyByName(sessionId, name);
      if (!existed) continue;
      newId = existed.id;
    }
    applyState(newId, item.state);
    // 诊断：新登场角色按 prompt 约束应填齐所有启用字段，缺字段时 warn
    const stateKeys = item.state && typeof item.state === 'object' ? Object.keys(item.state) : [];
    const missing = fields.map((f) => f.field_key).filter((k) => !stateKeys.includes(k));
    if (missing.length) {
      log.warn(`NEARBY NEW MISSING FIELDS  ${formatMeta({ session: sessionId.slice(0, 8), name, missing: missing.join(',') })}`);
    }
    seenIds.add(newId);
  }

  // 清理：保留 saved 全部 + 本轮提到的 transient
  const keepIds = pool.filter((p) => p.is_saved === 1 || seenIds.has(p.id)).map((p) => p.id);
  // 本轮新建的 transient 不在 pool 里，但 deleteTransientNotInIds 仅删 transient，
  // 新建的 ID 也需要保留：合并到 keepIds
  for (const id of seenIds) {
    if (!keepIds.includes(id)) keepIds.push(id);
  }
  deleteTransientNotInIds(sessionId, keepIds);

  // 本轮"被 LLM 触达"信号：bump updated_at，供前端判断 saved 角色是否登场（自动展开/收起）
  // state_updated_at 在 state 字段空时不前进，所以单独维护 row.updated_at
  touchNearbyRows(seenIds);
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
    case 'datetime': {
      if (typeof value !== 'string') return undefined;
      return ISO_DATETIME_RE.test(value) ? value : undefined;
    }
    case 'list': {
      if (typeof value === 'string') {
        value = value.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
      }
      if (!Array.isArray(value)) return undefined;
      const items = value.map(String).filter(Boolean);
      if (items.length === 0) return field.allow_empty ? [] : undefined;
      if (items.length > STATE_LIST_MAX_ITEMS) {
        log.warn(`LIST HARD TRUNCATE  ${formatMeta({ field: field.field_key, from: items.length, to: STATE_LIST_MAX_ITEMS })}`);
        return items.slice(-STATE_LIST_MAX_ITEMS);
      }
      return items;
    }
    case 'table': {
      const cols = Array.isArray(field.table_columns) ? field.table_columns : [];
      if (cols.length === 0) return undefined;
      let obj = value;
      if (typeof obj === 'string') {
        try { obj = JSON.parse(obj); } catch { return undefined; }
      }
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return undefined;
      const out = {};
      for (const col of cols) {
        if (!col || typeof col.key !== 'string') continue;
        if (!(col.key in obj)) continue;
        const raw = obj[col.key];
        const num = typeof raw === 'number' ? raw : Number(raw);
        if (!isFinite(num)) continue;
        let v = num;
        if (col.min != null && v < col.min) v = col.min;
        if (col.max != null && v > col.max) v = col.max;
        out[col.key] = v;
      }
      if (Object.keys(out).length === 0) return field.allow_empty ? {} : undefined;
      return out;
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
  applyNearbyResult,
};
