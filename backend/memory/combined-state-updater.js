/**
 * combined-state-updater.js — 单次 LLM 调用同时更新世界/角色（可多个）/玩家状态
 *
 * 调用方：异步队列，优先级 2（不可丢弃）。
 * 替代原来三个独立 updater（character/world/persona-state-updater.js）。
 */

import * as llm from '../llm/index.js';
import { getMessagesBySessionId } from '../services/sessions.js';
import { getWorldById } from '../db/queries/worlds.js';

import { upsertSessionWorldStateValues } from '../db/queries/session-world-state-values.js';
import { upsertSessionCharacterStateValues } from '../db/queries/session-character-state-values.js';
import { upsertSessionPersonaStateValues } from '../db/queries/session-persona-state-values.js';

import { ALL_MESSAGES_LIMIT, LLM_TASK_TEMPERATURE, LLM_STATE_UPDATE_MAX_TOKENS, STATE_UPDATE_JSON_RETRY_MAX, LLM_BACKGROUND_TASK_TIMEOUT_MS } from '../utils/constants.js';
import { getSessionById } from '../db/queries/sessions.js';
import { createLogger, formatMeta, previewText, shouldLogRaw } from '../utils/logger.js';
import { renderBackendPrompt } from '../prompts/prompt-loader.js';
import { resolveAuxScope } from '../utils/aux-scope.js';
import { validateValue } from '../utils/state-field-validate.js';
import { extractJsonPatch } from './state-update-json.js';
import { compressOverLimitFields } from './state-update-compress.js';
import {
  loadStateUpdateTargets, buildEntityStateSections,
  buildStateMemoryProfileFieldsSchema, buildNpcApplicableFieldsSchema,
  captureBaselineIfAbsent, resolveCurrentRound, resolveBaseEntities,
  writeRealDateWorldTime, resolveRelevantEntityIds, buildRuntimeUserPrompt,
} from './state-update-context.js';
import { applyStateMemoryOps, applyEntityFields } from './state-memory-apply.js';

const log = createLogger('all-state');

// ── 辅助函数（模块级） ──────────────────────────────────────────────────────

/**
 * 将 LLM 返回的 patch 对象写入会话状态（校验 + upsert）。
 * @param {object[]} activeFields  本次活跃字段列表（用于 fieldMap 构建和校验）
 * @param {*}        patchData     patch 对象中对应此实体的子对象；非 object 时直接跳过
 * @param {Function} upsertFn      (key: string, valueJson: string|null) => void
 * @param {string}   logLabel      日志前缀（如 `world="xxx"`）
 */
/**
 * 取某 table 字段的旧「有效值」（运行时值优先，回退默认值）并解析为对象。
 * 用于列级 merge：返回 null 表示无可用旧值（首次写入，照常整体写）。
 */
function parseOldTableValue(cur, field) {
  if (!cur) return null;
  const json = cur.runtimeValueJson ?? cur.defaultValueJson;
  if (json == null) return null;
  let obj = json;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch { return null; }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  // 只保留 schema 仍定义的数值列，避免把已删除列或脏值带回
  const cols = Array.isArray(field.table_columns) ? field.table_columns : [];
  const out = {};
  for (const col of cols) {
    if (!col || typeof col.key !== 'string' || !(col.key in obj)) continue;
    const num = typeof obj[col.key] === 'number' ? obj[col.key] : Number(obj[col.key]);
    if (isFinite(num)) out[col.key] = num;
  }
  return Object.keys(out).length ? out : null;
}

function applyStatePatch(activeFields, patchData, upsertFn, logLabel, valueMap = null) {
  if (!patchData || typeof patchData !== 'object') return;
  const fieldMap = Object.fromEntries(activeFields.map((f) => [f.field_key, f]));
  const updated = [];
  for (const [key, rawValue] of Object.entries(patchData)) {
    const field = fieldMap[key];
    if (!field) continue;
    let validated = validateValue(rawValue, field);
    if (validated === undefined) {
      // 诊断：LLM 输出了该字段但校验失败被丢弃（table/格式问题排查用）
      log.warn(`DROP  ${logLabel}  ${formatMeta({ key, type: field.type, raw: previewText(JSON.stringify(rawValue)) })}`);
      continue;
    }
    // table 字段做列级 merge：模型只回了变化的列时，未提及的列保留旧有效值，
    // 避免「抄错/漏写一列」把整张表冲回默认或残缺。
    if (field.type === 'table' && validated && typeof validated === 'object') {
      const old = parseOldTableValue(valueMap?.[key], field);
      if (old) validated = { ...old, ...validated };
    }
    const valueJson = validated === null ? null : JSON.stringify(validated);
    upsertFn(key, valueJson);
    updated.push(`${key}=${valueJson}`);
  }
  if (updated.length) log.info(`${logLabel}  updates: ${updated.join('  ')}`);
}

// ── 主函数 ──────────────────────────────────────────────────────────────────

function buildStateDialogue(messages, primaryName) {
  const recentMsgs = messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .slice(-4);
  const formatMsg = (message) => `${message.role === 'user' ? '玩家' : primaryName}：${message.content}`;
  const currentTurn = recentMsgs.slice(-2);
  // length > 2：无论是单条开场白还是完整的上一轮，都纳入"上一轮"
  const prevTurn = recentMsgs.length > 2 ? recentMsgs.slice(0, -2) : [];
  const dialogueParts = [];
  if (prevTurn.length > 0) {
    dialogueParts.push(`【上一轮（仅供背景参考，状态已处理）】\n${prevTurn.map(formatMsg).join('\n')}`);
  }
  dialogueParts.push(`【本轮（请据此判断状态变化）】\n${currentTurn.map(formatMsg).join('\n')}`);
  return dialogueParts.join('\n\n');
}

function buildStateUpdateExampleKeys(worldActiveFields, charactersWithFields, personaActiveFields) {
  return [
    worldActiveFields.length > 0 ? '"world": {"date": "第三纪元第101年"}' : null,
    charactersWithFields[0] ? '"char_0": {"mood": "开心"}' : null,
    personaActiveFields.length > 0 ? '"persona": {"health": 85}' : null,
    '"entity_fields": {"e3": {"favor": 60}}',
    '"memory": [{"op": "set_present", "entities": ["e1", "e3"]}, {"op": "set_world", "key": "time", "value": "1000-03-15T14:30"}]',
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * 组装状态更新调用的稳定前缀（cacheableSystem）：通用指令 + 各字段 schema 定义 + 状态记忆规则/
 * 档案字段清单。只依赖字段定义与会话所在世界的 schema，逐字节稳定，不含轮次/实体目录等动态内容。
 * 单独抽出供测试直接断言 system 内容，不必经过 LLM 调用。
 */
function buildCacheableSystemPrompt(worldId, targets, { schemaSections, responseKeys }) {
  const { worldActiveFields, charactersWithFields, personaActiveFields } = targets;
  const exampleKeys = buildStateUpdateExampleKeys(worldActiveFields, charactersWithFields, personaActiveFields);
  return renderBackendPrompt('state-update.md', {
    SCHEMA: schemaSections.join('\n\n'),
    RESPONSE_KEYS: responseKeys.join('、'),
    EXAMPLE_KEYS: exampleKeys,
    STATE_MEMORY_PROFILE_FIELDS: buildStateMemoryProfileFieldsSchema(worldId) || '（无）',
    STATE_MEMORY_NPC_FIELDS: buildNpcApplicableFieldsSchema(worldId) || '（无）',
  });
}

/**
 * 调 LLM 获取状态更新 patch：JSON 解析失败时按 STATE_UPDATE_JSON_RETRY_MAX 重试。
 * LLM API 调用本身失败（raw 为空）不重试，直接返回 null。
 */
async function requestStatePatch(prompt, cacheableSystem, sid, sessionId) {
  let patch = null;
  let lastRaw = null;

  for (let attempt = 0; attempt <= STATE_UPDATE_JSON_RETRY_MAX; attempt++) {
    const raw = await llm.complete(prompt, {
      temperature: LLM_TASK_TEMPERATURE,
      maxTokens: LLM_STATE_UPDATE_MAX_TOKENS,
      configScope: resolveAuxScope(sessionId),
      callType: 'state_update',
      conversationId: sessionId,
      cacheableSystem,
      timeoutMs: LLM_BACKGROUND_TASK_TIMEOUT_MS,
    });
    if (!raw) return null;  // LLM API 失败，不进入 JSON 重试
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
  }
  return patch;
}

/**
 * 把 LLM 返回的 patch（含超限压缩）写入世界 / 角色 / 玩家 / nearby 各类会话状态。
 */
function writeWorldState(patch, { sessionId, worldId, world, worldActiveFields, worldValueMap }) {
  if (worldActiveFields.length === 0) return;
  const values = [];
  applyStatePatch(worldActiveFields, patch.world,
    (fieldKey, runtimeValueJson) => values.push({ fieldKey, runtimeValueJson }),
    `world="${world.name}"`, worldValueMap
  );
  upsertSessionWorldStateValues(sessionId, worldId, values);
}

function writeCharacterStates(patch, { sessionId, charSchemaFields, charactersWithFields, charValueMaps }) {
  const characterValues = [];
  for (let i = 0; i < charactersWithFields.length; i++) {
    const char = charactersWithFields[i];
    applyStatePatch(charSchemaFields, patch[`char_${i}`],
      (fieldKey, runtimeValueJson) => characterValues.push({ characterId: char.id, fieldKey, runtimeValueJson }),
      `char="${char.name}"`, charValueMaps[i]
    );
  }
  upsertSessionCharacterStateValues(sessionId, characterValues);
}

function writePersonaState(patch, { sessionId, worldId, world, personaActiveFields, personaValueMap }) {
  if (personaActiveFields.length === 0) return;
  const values = [];
  applyStatePatch(personaActiveFields, patch.persona,
    (fieldKey, runtimeValueJson) => values.push({ fieldKey, runtimeValueJson }),
    `persona  world="${world?.name}"`, personaValueMap
  );
  upsertSessionPersonaStateValues(sessionId, worldId, values);
}

async function writeStatePatch(patch, { sid, sessionId, worldId, world, targets, valueMaps, round, turnText, realDate, mainCharacterEntityId }) {
  const { worldActiveFields, charSchemaFields, charactersWithFields, personaActiveFields } = targets;
  const { worldValueMap, charValueMaps, personaValueMap } = valueMaps;

  // ── 字数/列表检查：超限时压缩后再写入 ──
  await compressOverLimitFields(patch, [
    ...(worldActiveFields.length > 0 ? [{ entityKey: 'world', fields: worldActiveFields, patchData: patch.world, valueMap: worldValueMap }] : []),
    ...charactersWithFields.map((_, i) => ({ entityKey: `char_${i}`, fields: charSchemaFields, patchData: patch[`char_${i}`], valueMap: charValueMaps[i] })),
    ...(personaActiveFields.length > 0 ? [{ entityKey: 'persona', fields: personaActiveFields, patchData: patch.persona, valueMap: personaValueMap }] : []),
  ], sid, sessionId);

  // ── 写入各类状态（会话级） ──
  writeWorldState(patch, { sessionId, worldId, world, worldActiveFields, worldValueMap });
  writeCharacterStates(patch, { sessionId, charSchemaFields, charactersWithFields, charValueMaps });
  writePersonaState(patch, { sessionId, worldId, world, personaActiveFields, personaValueMap });

  // ── 状态记忆：实体档案/动态状态/关系/事项/世界事实（memory）+ NPC 用户字段补丁（entity_fields） ──
  const memoryResult = applyStateMemoryOps({
    sessionId, worldId, round, ops: patch.memory, turnText, realDate, mainCharacterEntityId,
  });
  const entityFieldsResult = applyEntityFields({
    sessionId, worldId, entityFields: patch.entity_fields, mainCharacterEntityId,
  });
  log.info(`STATE MEMORY  ${formatMeta({
    session: sid,
    memoryApplied: memoryResult.applied,
    memoryRejected: memoryResult.rejected.length,
    entityFieldsApplied: entityFieldsResult.applied,
    entityFieldsRejected: entityFieldsResult.rejected.length,
  })}`);
}

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

  const session = getSessionById(sessionId);
  const isWriting = session?.mode === 'writing';
  captureBaselineIfAbsent(sessionId, worldId, characterIds);

  // 状态记忆常开：只要会话有消息就调用，不再按「是否有活跃用户字段」提前返回。
  const messages = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  if (messages.length === 0) return;
  const { round, turnText } = resolveCurrentRound(messages);

  // ── 确定各类活跃字段 ──
  const targets = loadStateUpdateTargets(worldId, characterIds, world);
  const {
    worldActiveFields, characters, charSchemaFields,
    charactersWithFields, personaActiveFields,
  } = targets;

  const { playerEntityId, mainCharacterEntityId } = resolveBaseEntities({
    session, worldId, sessionId, round, characters, isWriting,
  });

  const realDate = session?.diary_date_mode === 'real';
  writeRealDateWorldTime({ realDate, worldId, sessionId, round, sid });

  // ── 组装 prompt 各节 ──
  // schemaSections：字段定义（逐字节稳定，进 cacheableSystem 前缀）
  // valueSections：当前取值（逐轮变化，留在 messages 末尾的 user 段）
  const {
    schemaSections, valueSections, responseKeys,
    worldValueMap, charValueMaps, personaValueMap,
  } = buildEntityStateSections(targets, { world, worldId, sessionId, session });

  responseKeys.push(
    '"entity_fields"（NPC 用户字段补丁，无更新时返回 {}）',
    '"memory"（状态记忆操作数组，无变化时返回 []）',
  );

  // 对话上下文：取最近 4 条（2 轮），分"上一轮"/"本轮"打标签（用第一个角色名，没有则"角色"）
  const dialogue = buildStateDialogue(messages, characters[0]?.name ?? '角色');

  // ── 切分稳定前缀 / 动态后缀（prompt caching） ──
  // 必须逐字成为 system 消息内容的前缀，provider 层据此切出可缓存段（参考 assembler.js）。
  // 动态后缀（user 段）：各字段当前取值 + 实体目录/世界事实/相关实体详情 + 本轮对话，逐轮变化，不进缓存。
  const cacheableSystem = buildCacheableSystemPrompt(worldId, targets, { schemaSections, responseKeys });
  const relevantIds = resolveRelevantEntityIds(sessionId, messages, { playerEntityId, mainCharacterEntityId });
  const runtimeUser = buildRuntimeUserPrompt({
    sessionId, worldId, mainCharacterEntityId, valueSections, dialogue, responseKeys, round, relevantIds,
  });

  const prompt = [
    { role: 'system', content: cacheableSystem },
    { role: 'user', content: runtimeUser },
  ];

  log.info(`CALL  ${formatMeta({
    session: sid,
    worldFields: worldActiveFields.length,
    characterFields: charSchemaFields.length,
    characters: charactersWithFields.map((c) => c.name),
    personaFields: personaActiveFields.length,
    cachePrefixChars: cacheableSystem.length,
    runtimeChars: runtimeUser.length,
  })}`);

  // thinking_level 由副模型配置决定（用户在 UI 选择，例如 deepseek 选 thinking_disabled）；这里不再硬编码 null 覆盖。
  const patch = await requestStatePatch(prompt, cacheableSystem, sid, sessionId);
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return;

  await writeStatePatch(patch, {
    sid, sessionId, worldId, world, targets,
    valueMaps: { worldValueMap, charValueMaps, personaValueMap },
    round, turnText, realDate, mainCharacterEntityId,
  });
}

// 值校验（validateValue）已提取至 backend/utils/state-field-validate.js，供本文件与
// backend/services/state-extract.js 共用，避免同一套类型规则出现两份实现。

export const __testables = {
  applyStatePatch,
  validateValue,
  buildCacheableSystemPrompt,
};
