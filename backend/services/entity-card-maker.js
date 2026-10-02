/**
 * entity-card-maker.js — 把会话状态记忆里的实体"制成"公共角色卡。
 *
 * 两步：
 *   1) analyzeEntityForCard：调 LLM 把实体档案文本（renderEntityProfileText）扩写为完整
 *      system_prompt，并生成 first_message；description 直接复用档案文本。
 *      返回 { name, system_prompt, description, first_message } 草稿（name 透传）。
 *   2) createCharacterFromEntity：写入 characters 表 + 把 nearby_enabled=1 的
 *      字段当前值写入 character_state_values.default_value_json（不写 runtime、
 *      不带实体档案文本），并把该实体的 card_id 回写为新角色卡。
 */

import * as llm from '../llm/index.js';
import { resolveAuxScope } from '../utils/aux-scope.js';
import { buildEntityCardAnalyzePrompt } from '../prompts/entity-card-prompt.js';
import { renderEntityProfileText } from '../memory/state-memory-render.js';
import { getEditableProfileFields, sanitizeProfileDefaults } from '../memory/state-memory-schema.js';
import { listCurrentEntities, upsertEntity, getEntityDetails } from '../db/queries/state-memory.js';
import { getEntityStateValues } from '../db/queries/session-entity-state-values.js';
import { getCharacterStateFieldsByWorldId } from '../db/queries/character-state-fields.js';
import { getSessionById } from '../db/queries/sessions.js';
import { getMessagesBySessionId } from '../db/queries/messages.js';
import { createCharacter, setCharacterProfileDefaults } from '../db/queries/characters.js';
import { upsertCharacterStateValues } from '../db/queries/character-state-values.js';
import { splitRounds } from '../utils/session-rounds.js';
import { ALL_MESSAGES_LIMIT } from '../utils/constants.js';
import { createLogger, formatMeta } from '../utils/logger.js';
import { extractJsonObject } from '../utils/llm-json.js';
import { toPromptMessage } from '../utils/turn-dialogue.js';

const log = createLogger('svc', 'green');

const RECENT_TEXT_ROUNDS = 6;
const ANALYZE_MAX_TOKENS = 1024;
const ANALYZE_TEMPERATURE = 0.7;

function ensureEntityOwnedBySession(sessionId, entityId) {
  const entity = listCurrentEntities(sessionId).find((e) => e.entity_id === entityId);
  if (!entity) {
    const err = new Error(`entity not found: ${entityId}`);
    err.code = 'ENTITY_NOT_FOUND';
    throw err;
  }
  return entity;
}

function ensureSessionInWorld(sessionId, worldId) {
  const session = getSessionById(sessionId);
  if (!session) {
    const err = new Error(`session not found: ${sessionId}`);
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

/** 手动写回记在当前最新一轮：splitRounds 的最后一轮，没有轮次时为 0（与 services/state-memory.js 的 resolveManualRound 同口径）。 */
function resolveEntityRound(sessionId) {
  const rounds = splitRounds(getMessagesBySessionId(sessionId, null));
  return rounds.at(-1)?.roundIndex ?? 0;
}

function pickRecentMessages(sessionId, rounds) {
  const all = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0).map(toPromptMessage);
  // 一轮约等于 user + assistant 两条；取最后 rounds*2 条即可
  const tail = all.slice(-rounds * 2);
  return tail;
}

function stateValuesToArray(sessionId, entityId) {
  const values = getEntityStateValues(sessionId, [entityId])[entityId] ?? {};
  return Object.entries(values).map(([field_key, runtime_value_json]) => ({ field_key, runtime_value_json }));
}

/**
 * 用 LLM 给实体生成角色卡草稿（不落库）。
 * @param {string} sessionId
 * @param {string} entityId
 * @returns {Promise<{ name:string, system_prompt:string, description:string, first_message:string }>}
 */
export async function analyzeEntityForCard(sessionId, entityId) {
  const session = ensureSessionInWorld(sessionId, null);
  const entity = ensureEntityOwnedBySession(sessionId, entityId);
  const worldId = session.world_id;

  const profileText = renderEntityProfileText(sessionId, entityId, { worldId });
  const stateValues = stateValuesToArray(sessionId, entityId);
  const recentMsgs = pickRecentMessages(sessionId, RECENT_TEXT_ROUNDS);

  const prompt = buildEntityCardAnalyzePrompt({
    name: entity.name,
    profileText,
    stateValues,
    recentMessages: recentMsgs,
    recentRounds: RECENT_TEXT_ROUNDS,
  });

  const raw = await llm.complete(prompt, {
    temperature: ANALYZE_TEMPERATURE,
    maxTokens: ANALYZE_MAX_TOKENS,
    configScope: resolveAuxScope(sessionId),
    callType: 'entity_card_analyze',
    conversationId: sessionId,
  });

  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed !== 'object') {
    log.error(`entity_card.analyze.failed  ${formatMeta({ sessionId, entityId, msg: 'LLM returned invalid JSON' })}`);
    throw new Error('LLM returned invalid JSON');
  }

  return {
    name: entity.name,
    system_prompt: typeof parsed.system_prompt === 'string' ? parsed.system_prompt : '',
    // description 直接采用实体档案文本，LLM 不生成该字段
    description: profileText,
    first_message: typeof parsed.first_message === 'string' ? parsed.first_message : '',
  };
}

/**
 * 把实体落成公共角色卡 + 把启用字段当前值写入 default_value_json、档案写入档案初始值，并把该实体的 card_id
 * 回写为新角色卡（记在会话当前最新一轮）。
 *
 * @param {object} args
 * @param {string} args.worldId
 * @param {string} args.sessionId
 * @param {string} args.entityId
 * @param {string} args.name
 * @param {string} [args.system_prompt]
 * @param {string} [args.description]
 * @param {string} [args.first_message]
 * @returns {string} 新角色 id
 */
export function createCharacterFromEntity({
  worldId,
  sessionId,
  entityId,
  name,
  system_prompt = '',
  description = '',
  first_message = '',
}) {
  if (!worldId) throw new Error('worldId is required');
  if (!sessionId) throw new Error('sessionId is required');
  if (!entityId) throw new Error('entityId is required');
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (!trimmedName) throw new Error('name is required');

  ensureSessionInWorld(sessionId, worldId);
  const entity = ensureEntityOwnedBySession(sessionId, entityId);

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
  const entityValues = stateValuesToArray(sessionId, entityId);

  upsertCharacterStateValues(entityValues
    .filter((value) => enabledKeys.has(value.field_key) && value.runtime_value_json != null)
    .map((value) => ({
      characterId: character.id,
      fieldKey: value.field_key,
      defaultValueJson: value.runtime_value_json,
    })));

  // 实体当前档案存成新角色卡的档案初始值
  const profile = getEntityDetails(sessionId, [entityId])[entityId]?.profile ?? {};
  setCharacterProfileDefaults(character.id, JSON.stringify(sanitizeProfileDefaults(Object.fromEntries(
    getEditableProfileFields(worldId, 'character')
      .filter((field) => profile[field.key])
      .map((field) => [field.key, JSON.parse(profile[field.key].value_json)]),
  ))));

  // 把实体关联到新角色卡
  upsertEntity(sessionId, {
    entityId: entity.entity_id, seq: entity.seq, type: entity.type, name: entity.name,
    aliasesJson: entity.aliases_json, cardId: character.id, pinned: entity.pinned, status: entity.status,
  }, resolveEntityRound(sessionId));

  log.info(`entity_card.create_character  ${formatMeta({ sessionId, worldId, entityId, characterId: character.id, name: trimmedName })}`);
  return character.id;
}
