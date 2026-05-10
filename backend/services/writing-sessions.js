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
  updateNearbyMemory,
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

const log = createLogger('svc', 'green');

export function createWritingSession(worldId) {
  const config = getConfig();
  const diaryWriting = config.diary?.writing;
  const diary_date_mode = diaryWriting?.enabled ? (diaryWriting.date_mode ?? 'virtual') : null;
  const session = dbCreateWritingSession(worldId, { diary_date_mode });
  log.info(`writing_session.create  ${formatMeta({ sessionId: session.id, worldId })}`);
  return session;
}

export function getWritingSessionsByWorldId(worldId) {
  return dbGetWritingSessionsByWorldId(worldId);
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

function buildNearbyRow(row, fields, valueMap) {
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
    memory: row.memory,
    is_saved: row.is_saved,
    created_at: row.created_at,
    updated_at: row.updated_at,
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
    return buildNearbyRow(row, fields, valueMap);
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
    memory: '',
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

export function patchNearbyMemory(sessionId, nearbyId, memory) {
  ensureWritingSession(sessionId);
  ensureNearbyOwned(sessionId, nearbyId);
  const value = memory == null ? '' : String(memory);
  updateNearbyMemory(nearbyId, value);
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
