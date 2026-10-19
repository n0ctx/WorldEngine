/**
 * combined-state-updater.js — 单次 LLM 调用同时更新世界/角色（可多个）/玩家状态
 *
 * 调用方：异步队列，优先级 2（不可丢弃）。
 * 替代原来三个独立 updater（character/world/persona-state-updater.js）。
 */

import * as llm from '../llm/index.js';
import { getMessagesBySessionId } from '../services/sessions.js';
import { getWorldById } from '../db/queries/worlds.js';


import { ALL_MESSAGES_LIMIT, LLM_TASK_TEMPERATURE, LLM_STATE_UPDATE_MAX_TOKENS, STATE_UPDATE_JSON_RETRY_MAX, LLM_BACKGROUND_TASK_TIMEOUT_MS, STATE_TEXT_COMPRESS_TARGET, LOG_WARN_PREVIEW_CHARS } from '../utils/constants.js';
import { getSessionById } from '../db/queries/sessions.js';
import { createLogger, formatMeta, previewText } from '../utils/logger.js';
import { renderBackendPrompt } from '../prompts/prompt-loader.js';
import { renderTriggeredEntriesSection } from '../prompts/segments.js';
import { getAllWorldEntries } from '../db/queries/prompt-entries.js';
import { applyTemplateVars } from '../utils/template-vars.js';
import { resolveAuxScope } from '../utils/aux-scope.js';
import { toPromptMessage } from '../utils/turn-dialogue.js';
import { extractJsonPatch } from './state-update-json.js';
import {
  loadStateUpdateTargets, buildEntityStateSections,
  buildStateMemoryProfileFieldsSchema, buildNpcApplicableFieldsSchema,
  captureBaselineIfAbsent, resolveCurrentRound, resolveBaseEntities,
  resolveRelevantEntityIds, buildRuntimeUserPrompt,
  resolvePersona,
} from './state-update-context.js';
import { writeRealDateWorldTime } from './state-memory-apply.js';
import { writeStatePatch } from './state-update-write.js';

const log = createLogger('all-state');

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
    '"memory": [{"op": "set_world", "key": "time", "value": "1000-03-15T14:30"}]',
    '"present": ["e1", "e3"]',
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * 世界观：本世界所有启用的常驻（always）条目，供补全档案时保持设定一致。只依赖世界与人设，
 * 逐轮稳定，放进可缓存的 system 前缀；需触发的条目见 buildTriggeredSettingText。
 */
export function buildWorldSettingText(world, personaName) {
  if (!world) return '';
  return renderWorldEntries(world, personaName, (entry) => entry.trigger_type === 'always');
}

/**
 * 本轮触发的条目：正文生成时命中的非常驻条目（关键词 / AI 判断 / 状态条件），取自本轮 AI 回复上的记录，
 * 与正文看到的保持一致，不再重新匹配。逐轮变化，放进动态后缀。
 */
export function buildTriggeredSettingText(world, personaName, activatedEntries) {
  const ids = new Set(activatedEntries.map((entry) => entry.id));
  if (!world || ids.size === 0) return '';
  return renderWorldEntries(world, personaName, (entry) => entry.trigger_type !== 'always' && ids.has(entry.id));
}

function renderWorldEntries(world, personaName, include) {
  const entries = getAllWorldEntries(world.id)
    .filter((entry) => entry.enabled !== 0 && entry.content && include(entry))
    .sort((a, b) => (a.token ?? 1) - (b.token ?? 1) || (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const tv = (text) => applyTemplateVars(text, { user: personaName || '', char: null, world: world.name });
  return renderTriggeredEntriesSection(entries, tv) ?? '';
}

/** 玩家人设正文：补全玩家档案时以它为准。同样逐轮稳定，放进可缓存前缀。 */
export function buildPersonaSettingText(world, persona) {
  const prompt = persona?.system_prompt?.trim();
  if (!prompt) return '';
  return applyTemplateVars(prompt, { user: persona.name || '', char: null, world: world?.name });
}

/**
 * 组装状态更新调用的稳定前缀（cacheableSystem）：通用指令 + 各字段 schema 定义 + 状态记忆规则/
 * 档案字段清单。只依赖字段定义与会话所在世界的 schema，逐字节稳定，不含轮次/实体目录等动态内容。
 * 单独抽出供测试直接断言 system 内容，不必经过 LLM 调用。
 */
function buildCacheableSystemPrompt(worldId, targets, { schemaSections, responseKeys, worldSetting, personaSetting }) {
  const { worldActiveFields, charactersWithFields, personaActiveFields } = targets;
  const exampleKeys = buildStateUpdateExampleKeys(worldActiveFields, charactersWithFields, personaActiveFields);
  return renderBackendPrompt('state-update.md', {
    WORLD_SETTING: worldSetting || '（无）',
    PERSONA_SETTING: personaSetting || '（无）',
    SCHEMA: schemaSections.join('\n\n'),
    RESPONSE_KEYS: responseKeys.join('、'),
    EXAMPLE_KEYS: exampleKeys,
    TEXT_MAX_LENGTH: STATE_TEXT_COMPRESS_TARGET,
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
    log.info(`RAW  ${formatMeta({ session: sid, chars: raw.length, attempt })}`);

    patch = extractJsonPatch(raw, sid);
    if (patch !== null) break;

    if (attempt < STATE_UPDATE_JSON_RETRY_MAX) {
      log.warn(`JSON RETRY ${attempt + 1}/${STATE_UPDATE_JSON_RETRY_MAX}  ${formatMeta({ session: sid, preview: previewText(raw, { limit: LOG_WARN_PREVIEW_CHARS }) })}`);
    }
  }

  if (patch === null) {
    log.warn(`JSON PARSE FAIL  ${formatMeta({ session: sid, preview: previewText(lastRaw, { limit: LOG_WARN_PREVIEW_CHARS }) })}`);
  }
  return patch;
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

  // 状态记忆常开：只要会话有消息就调用。
  const messages = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0).map(toPromptMessage);
  if (messages.length === 0) return;
  const { round, turnText, activatedEntries } = resolveCurrentRound(messages);

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
    '"present"（本轮在场实体列表，每轮必填，覆盖上一轮；写 e<seq> 编号，本轮刚用 create_entity 新建的实体写名字；无人在场时返回 []）',
  );

  // 对话上下文：取最近 4 条（2 轮），分"上一轮"/"本轮"打标签（用第一个角色名，没有则"角色"）
  const dialogue = buildStateDialogue(messages, characters[0]?.name ?? '角色');

  // ── 切分稳定前缀 / 动态后缀（prompt caching） ──
  // 必须逐字成为 system 消息内容的前缀，provider 层据此切出可缓存段（参考 assembler.js）。
  // 动态后缀（user 段）：各字段当前取值 + 本轮触发的条目 + 实体目录/相关实体详情 + 本轮对话，逐轮变化，不进缓存。
  const persona = resolvePersona(session, worldId);
  const worldSetting = buildWorldSettingText(world, persona?.name);
  const personaSetting = buildPersonaSettingText(world, persona);
  const cacheableSystem = buildCacheableSystemPrompt(worldId, targets, { schemaSections, responseKeys, worldSetting, personaSetting });
  const relevantIds = resolveRelevantEntityIds(sessionId, messages, { playerEntityId, mainCharacterEntityId });
  const triggeredSetting = buildTriggeredSettingText(world, persona?.name, activatedEntries);
  const runtimeUser = buildRuntimeUserPrompt({
    sessionId, worldId, mainCharacterEntityId, valueSections, dialogue, turnText, responseKeys, round, relevantIds, triggeredSetting,
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

export const __testables = {
  buildCacheableSystemPrompt,
};
