/**
 * nearby-card-maker.js — 把会话内的 nearby 角色"制成"公共角色卡。
 *
 * 两步：
 *   1) analyzeNearbyForCard：调 LLM 把 nearby.persona（一句话人设）扩写为完整
 *      system_prompt，并生成 first_message；description 直接复用 nearby.persona。
 *      返回 { name, system_prompt, description, first_message } 草稿（name 透传）。
 *   2) createCharacterFromNearby：写入 characters 表 + 把 nearby_enabled=1 的
 *      字段当前值写入 character_state_values.default_value_json（不写 runtime、
 *      不带 persona、不带 nearby id）。
 */

import * as llm from '../llm/index.js';
import { resolveAuxScope } from '../utils/aux-scope.js';
import { buildNearbyCardAnalyzePrompt } from '../prompts/nearby-card-prompt.js';
import { getNearbyById } from '../db/queries/session-nearby-characters.js';
import { getStateValuesByNearbyId } from '../db/queries/session-nearby-character-state-values.js';
import { getCharacterStateFieldsByWorldId } from '../db/queries/character-state-fields.js';
import { getWritingSessionById } from '../db/queries/writing-sessions.js';
import { getMessagesBySessionId } from '../db/queries/messages.js';
import { createCharacter } from '../db/queries/characters.js';
import { upsertCharacterStateValue } from '../db/queries/character-state-values.js';
import { ALL_MESSAGES_LIMIT } from '../utils/constants.js';
import { createLogger, formatMeta } from '../utils/logger.js';

const log = createLogger('svc', 'green');

const RECENT_TEXT_ROUNDS = 6;
const ANALYZE_MAX_TOKENS = 1024;
const ANALYZE_TEMPERATURE = 0.7;

function ensureNearbyOwnedBySession(sessionId, nearbyId) {
  const nearby = getNearbyById(nearbyId);
  if (!nearby) {
    const err = new Error(`nearby not found: ${nearbyId}`);
    err.code = 'NEARBY_NOT_FOUND';
    throw err;
  }
  if (nearby.session_id !== sessionId) {
    const err = new Error(`nearby ${nearbyId} not in session ${sessionId}`);
    err.code = 'NEARBY_SESSION_MISMATCH';
    throw err;
  }
  return nearby;
}

function ensureWritingSessionInWorld(sessionId, worldId) {
  const session = getWritingSessionById(sessionId);
  if (!session) {
    const err = new Error(`writing session not found: ${sessionId}`);
    err.code = 'SESSION_NOT_FOUND';
    throw err;
  }
  if (worldId && session.world_id !== worldId) {
    const err = new Error(`session ${sessionId} not in world ${worldId}`);
    err.code = 'SESSION_WORLD_MISMATCH';
    throw err;
  }
  return session;
}

function pickRecentMessages(sessionId, rounds) {
  const all = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  // 一轮约等于 user + assistant 两条；取最后 rounds*2 条即可
  const tail = all.slice(-rounds * 2);
  return tail;
}

function tryParseJson(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  // 剥离 reasoning 模型的 <think>…</think> 块，避免污染 JSON 提取
  const stripped = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/gi, '')
    .trim();
  if (!stripped) return null;
  // 兼容 ```json ... ``` 包裹
  const codeBlock = stripped.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = codeBlock ? codeBlock[1].trim() : stripped;
  // 再退一步：抓第一个 {...}
  const objMatch = candidate.match(/\{[\s\S]*\}/);
  const source = objMatch ? objMatch[0] : candidate;
  try {
    return JSON.parse(source);
  } catch {
    return null;
  }
}

/**
 * 用 LLM 给 nearby 生成角色卡草稿（不落库）。
 * @param {string} sessionId
 * @param {string} nearbyId
 * @returns {Promise<{ name:string, system_prompt:string, description:string, first_message:string }>}
 */
export async function analyzeNearbyForCard(sessionId, nearbyId) {
  ensureWritingSessionInWorld(sessionId, null);
  const nearby = ensureNearbyOwnedBySession(sessionId, nearbyId);

  const stateValues = getStateValuesByNearbyId(nearbyId);
  const recentMsgs = pickRecentMessages(sessionId, RECENT_TEXT_ROUNDS);

  const prompt = buildNearbyCardAnalyzePrompt({
    name: nearby.name,
    persona: nearby.persona,
    stateValues,
    recentMessages: recentMsgs,
    recentRounds: RECENT_TEXT_ROUNDS,
  });

  const raw = await llm.complete(prompt, {
    temperature: ANALYZE_TEMPERATURE,
    maxTokens: ANALYZE_MAX_TOKENS,
    configScope: resolveAuxScope(sessionId),
    callType: 'nearby_card_analyze',
    conversationId: sessionId,
  });

  const parsed = tryParseJson(raw);
  if (!parsed || typeof parsed !== 'object') {
    log.error(`nearby_card.analyze.failed  ${formatMeta({ sessionId, nearbyId, msg: 'LLM returned invalid JSON' })}`);
    throw new Error('LLM returned invalid JSON');
  }

  return {
    name: nearby.name,
    system_prompt: typeof parsed.system_prompt === 'string' ? parsed.system_prompt : '',
    // description 直接采用 nearby 的一句话人设；LLM 不再生成 description 字段
    description: typeof nearby.persona === 'string' ? nearby.persona : '',
    first_message: typeof parsed.first_message === 'string' ? parsed.first_message : '',
  };
}

/**
 * 把 nearby 落成公共角色卡 + 把启用字段当前值写入 default_value_json。
 *
 * @param {object} args
 * @param {string} args.worldId
 * @param {string} args.sessionId
 * @param {string} args.nearbyId
 * @param {string} args.name
 * @param {string} [args.system_prompt]
 * @param {string} [args.description]
 * @param {string} [args.first_message]
 * @returns {string} 新角色 id
 */
export function createCharacterFromNearby({
  worldId,
  sessionId,
  nearbyId,
  name,
  system_prompt = '',
  description = '',
  first_message = '',
}) {
  if (!worldId) throw new Error('worldId is required');
  if (!sessionId) throw new Error('sessionId is required');
  if (!nearbyId) throw new Error('nearbyId is required');
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (!trimmedName) throw new Error('name is required');

  ensureWritingSessionInWorld(sessionId, worldId);
  ensureNearbyOwnedBySession(sessionId, nearbyId);

  const character = createCharacter({
    world_id: worldId,
    name: trimmedName,
    description,
    system_prompt,
    post_prompt: '',
    first_message,
    avatar_path: null,
  });

  // 把 nearby_enabled=1 的字段当前值写入新角色的 default_value_json
  const fields = getCharacterStateFieldsByWorldId(worldId).filter((f) => f.nearby_enabled === 1);
  const enabledKeys = new Set(fields.map((f) => f.field_key));
  const nearbyValues = getStateValuesByNearbyId(nearbyId);

  for (const v of nearbyValues) {
    if (!enabledKeys.has(v.field_key)) continue;
    if (v.runtime_value_json == null) continue;
    upsertCharacterStateValue(character.id, v.field_key, {
      defaultValueJson: v.runtime_value_json,
    });
  }

  log.info(`nearby_card.create_character  ${formatMeta({ sessionId, worldId, nearbyId, characterId: character.id, name: trimmedName })}`);
  return character.id;
}
