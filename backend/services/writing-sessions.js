import {
  createWritingSession as dbCreateWritingSession,
  getWritingSessionsByWorldId as dbGetWritingSessionsByWorldId,
  getWritingSessionById as dbGetWritingSessionById,
  deleteWritingSession as dbDeleteWritingSession,
  updateWritingSessionTitle as dbUpdateWritingSessionTitle,
  touchWritingSession as dbTouchWritingSession,
} from '../db/queries/writing-sessions.js';
import {
  createMessage as dbCreateMessage,
  getMessageById as dbGetMessageById,
  getMessagesBySessionId as dbGetMessagesBySessionId,
  deleteAllMessagesBySessionId as dbDeleteAllMessagesBySessionId,
  getMessageIdsBySessionId,
  getMessageIdsAfter,
  deleteMessagesAfter as dbDeleteMessagesAfter,
} from '../db/queries/messages.js';
import { runOnDelete } from '../utils/cleanup-hooks.js';
import { getConfig } from './config.js';
import {
  createNearbyCharacter,
  getNearbyById,
  getNearbyByName,
  listNearbyBySessionId,
  updateNearbyName,
  updateNearbyPersona,
  updateNearbyIsSaved,
  deleteNearbyById,
} from '../db/queries/session-nearby-characters.js';
import {
  upsertNearbyStateValue,
  getStateValuesByNearbyId,
} from '../db/queries/session-nearby-character-state-values.js';
import { getCharacterStateFieldsByWorldId } from '../db/queries/character-state-fields.js';
import { getAllCharacterStateValues } from '../db/queries/character-state-values.js';
import { getCharacterById } from '../db/queries/characters.js';
import { createLogger, formatMeta } from '../utils/logger.js';
import db from '../db/index.js';
import { createPersona as dbCreatePersona } from '../db/queries/personas.js';

const log = createLogger('svc', 'green');

/**
 * 解析某世界当前应当用于新写作 session 的 persona_id：
 * 优先 worlds.active_persona_id，回退到该世界最早创建的 persona。
 * 世界下无任何 persona 时自动建一张默认 persona 并返回其 id（写作 session 强制要求 persona）。
 */
function resolveActivePersonaId(worldId) {
  const world = db.prepare('SELECT active_persona_id FROM worlds WHERE id = ?').get(worldId);
  if (world?.active_persona_id) return world.active_persona_id;
  const fallback = db.prepare(
    'SELECT id FROM personas WHERE world_id = ? ORDER BY created_at ASC, id ASC LIMIT 1'
  ).get(worldId);
  if (fallback?.id) return fallback.id;
  // 兜底：世界无 persona 时建一张默认 persona，避免写作 session 因 FK 约束创建失败
  const created = dbCreatePersona(worldId, { name: '玩家' });
  log.info(`persona.auto_create  ${formatMeta({ worldId, personaId: created.id, reason: 'writing_session_bootstrap' })}`);
  return created.id;
}

export function createWritingSession(worldId) {
  const config = getConfig();
  const diaryWriting = config.diary?.writing;
  const diary_date_mode = diaryWriting?.enabled ? (diaryWriting.date_mode ?? 'virtual') : null;
  const personaId = resolveActivePersonaId(worldId);
  const session = dbCreateWritingSession(worldId, { diary_date_mode, persona_id: personaId });
  log.info(`writing_session.create  ${formatMeta({ sessionId: session.id, worldId, personaId })}`);
  return session;
}

export function getWritingSessionsByWorldId(worldId, personaId) {
  return dbGetWritingSessionsByWorldId(worldId, personaId);
}

export function getActiveWritingSessionsByWorldId(worldId) {
  const personaId = resolveActivePersonaId(worldId);
  if (!personaId) return [];
  return dbGetWritingSessionsByWorldId(worldId, personaId);
}

export function getWritingSessionById(id) {
  return dbGetWritingSessionById(id);
}

export async function deleteWritingSession(id) {
  const ids = getMessageIdsBySessionId(id);
  for (const mid of ids) {
    await runOnDelete('message', mid);
  }
  await runOnDelete('session', id);
  const result = dbDeleteWritingSession(id);
  log.info(`writing_session.delete  ${formatMeta({ sessionId: id, messages: ids.length })}`);
  return result;
}

export function updateWritingSessionTitle(id, title) {
  return dbUpdateWritingSessionTitle(id, title);
}

export function touchWritingSession(id) {
  return dbTouchWritingSession(id);
}

export function createMessage(data) {
  const msg = dbCreateMessage(data);
  dbTouchWritingSession(data.session_id);
  return msg;
}

export function getMessagesBySessionId(sessionId, limit, offset) {
  return dbGetMessagesBySessionId(sessionId, limit, offset);
}

export function getMessageById(id) {
  return dbGetMessageById(id);
}

export async function deleteMessagesAfter(messageId) {
  const ids = getMessageIdsAfter(messageId);
  for (const mid of ids) {
    await runOnDelete('message', mid);
  }
  const result = dbDeleteMessagesAfter(messageId);
  log.info(`writing_message.delete_after  ${formatMeta({ messageId, count: ids.length })}`);
  return result;
}

export async function deleteAllMessages(sessionId) {
  const ids = getMessageIdsBySessionId(sessionId);
  for (const mid of ids) {
    await runOnDelete('message', mid);
  }
  const result = dbDeleteAllMessagesBySessionId(sessionId);
  log.info(`writing_message.delete_all  ${formatMeta({ sessionId, count: ids.length })}`);
  return result;
}

// ---------------------------------------------------------------------------
// Nearby characters（写作会话登场角色）
// ---------------------------------------------------------------------------

function nameConflictError(name) {
  const err = new Error(`nearby name conflict: ${name}`);
  err.code = 'NEARBY_NAME_CONFLICT';
  return err;
}

function ensureWritingSession(sessionId) {
  const session = dbGetWritingSessionById(sessionId);
  if (!session) throw new Error(`writing session not found: ${sessionId}`);
  return session;
}

function ensureNearbyOwned(sessionId, nearbyId) {
  const row = getNearbyById(nearbyId);
  if (!row || row.session_id !== sessionId) {
    throw new Error(`nearby not found in session: ${nearbyId}`);
  }
  return row;
}

function getNearbyEnabledFields(worldId) {
  const all = getCharacterStateFieldsByWorldId(worldId);
  return all.filter((f) => Number(f.nearby_enabled) === 1);
}

function buildNearbyRow(row, fields, valueMap, stateUpdatedAt) {
  const state = fields.map((f) => ({
    field_key: f.field_key,
    label: f.label,
    type: f.type,
    description: f.description ?? '',
    enum_options: f.enum_options ?? null,
    min_value: f.min_value ?? null,
    max_value: f.max_value ?? null,
    prefix: f.prefix ?? '',
    unit: f.unit ?? '',
    table_columns: f.table_columns ?? null,
    runtime_value_json: valueMap.get(f.field_key) ?? null,
  }));
  return {
    id: row.id,
    session_id: row.session_id,
    name: row.name,
    persona: row.persona,
    is_saved: row.is_saved,
    created_at: row.created_at,
    updated_at: row.updated_at,
    // state 中任何 value 最近一次被写入的时间戳；前端用于"saved 角色是否被本轮 LLM 触达"的判定
    state_updated_at: stateUpdatedAt,
    state,
  };
}

export function listNearby(sessionId) {
  const session = ensureWritingSession(sessionId);
  const fields = getNearbyEnabledFields(session.world_id);
  const rows = listNearbyBySessionId(sessionId);
  return rows.map((row) => {
    const values = getStateValuesByNearbyId(row.id);
    const valueMap = new Map(values.map((v) => [v.field_key, v.runtime_value_json]));
    const stateUpdatedAt = values.reduce((max, v) => (v.updated_at > max ? v.updated_at : max), 0);
    return buildNearbyRow(row, fields, valueMap, stateUpdatedAt);
  });
}

export function addSavedFromCharacter(sessionId, characterId) {
  const session = ensureWritingSession(sessionId);
  const character = getCharacterById(characterId);
  if (!character) throw new Error(`character not found: ${characterId}`);
  if (character.world_id !== session.world_id) {
    throw new Error(`character world mismatch: ${characterId}`);
  }
  if (getNearbyByName(sessionId, character.name)) {
    throw nameConflictError(character.name);
  }

  const nearbyId = createNearbyCharacter({
    sessionId,
    name: character.name,
    persona: typeof character.description === 'string' ? character.description : '',
    isSaved: 1,
  });

  const fields = getNearbyEnabledFields(session.world_id);
  const enabledKeys = new Set(fields.map((f) => f.field_key));
  const charValues = getAllCharacterStateValues(characterId);
  for (const v of charValues) {
    if (!enabledKeys.has(v.field_key)) continue;
    if (v.default_value_json == null) continue;
    upsertNearbyStateValue({
      sessionId,
      nearbyId,
      fieldKey: v.field_key,
      valueJson: v.default_value_json,
    });
  }
  log.info(`nearby.add_from_character  ${formatMeta({ sessionId, characterId, nearbyId, name: character.name })}`);
  return nearbyId;
}

export function removeNearby(sessionId, nearbyId) {
  ensureWritingSession(sessionId);
  const row = ensureNearbyOwned(sessionId, nearbyId);
  deleteNearbyById(nearbyId);
  log.info(`nearby.remove  ${formatMeta({ sessionId, nearbyId, name: row.name })}`);
}

export function setNearbyIsSaved(sessionId, nearbyId, isSaved) {
  ensureWritingSession(sessionId);
  ensureNearbyOwned(sessionId, nearbyId);
  updateNearbyIsSaved(nearbyId, isSaved);
}

export function patchNearbyPersona(sessionId, nearbyId, persona) {
  ensureWritingSession(sessionId);
  ensureNearbyOwned(sessionId, nearbyId);
  const value = persona == null ? '' : String(persona);
  updateNearbyPersona(nearbyId, value);
}

export function renameNearby(sessionId, nearbyId, name) {
  ensureWritingSession(sessionId);
  const current = ensureNearbyOwned(sessionId, nearbyId);
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) throw new Error('nearby name required');
  if (trimmed === current.name) return; // no-op
  const occupant = getNearbyByName(sessionId, trimmed);
  if (occupant && occupant.id !== nearbyId) {
    throw nameConflictError(trimmed);
  }
  updateNearbyName(nearbyId, trimmed);
}

export function patchNearbyState(sessionId, nearbyId, fieldKey, valueJson) {
  const session = ensureWritingSession(sessionId);
  ensureNearbyOwned(sessionId, nearbyId);
  const fields = getNearbyEnabledFields(session.world_id);
  const allowed = fields.find((f) => f.field_key === fieldKey);
  if (!allowed) {
    throw new Error(`nearby state field not enabled or missing: ${fieldKey}`);
  }
  upsertNearbyStateValue({
    sessionId,
    nearbyId,
    fieldKey,
    valueJson: valueJson ?? null,
  });
}
