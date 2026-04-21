import {
  createWritingSession as dbCreateWritingSession,
  getWritingSessionsByWorldId as dbGetWritingSessionsByWorldId,
  getWritingSessionById as dbGetWritingSessionById,
  deleteWritingSession as dbDeleteWritingSession,
  updateWritingSessionTitle as dbUpdateWritingSessionTitle,
  touchWritingSession as dbTouchWritingSession,
  getWritingSessionCharacters as dbGetWritingSessionCharacters,
  addWritingSessionCharacter as dbAddWritingSessionCharacter,
  removeWritingSessionCharacter as dbRemoveWritingSessionCharacter,
} from '../db/queries/writing-sessions.js';
import {
  createMessage as dbCreateMessage,
  getMessagesBySessionId as dbGetMessagesBySessionId,
  deleteAllMessagesBySessionId as dbDeleteAllMessagesBySessionId,
  getMessageIdsBySessionId,
  getMessageIdsAfter,
  deleteMessagesAfter as dbDeleteMessagesAfter,
} from '../db/queries/messages.js';
import { runOnDelete } from '../utils/cleanup-hooks.js';
import { getConfig } from './config.js';

export function createWritingSession(worldId) {
  const config = getConfig();
  const diaryWriting = config.diary?.writing;
  const diary_date_mode = diaryWriting?.enabled ? (diaryWriting.date_mode ?? 'virtual') : null;
  return dbCreateWritingSession(worldId, { diary_date_mode });
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
  return dbDeleteWritingSession(id);
}

export function updateWritingSessionTitle(id, title) {
  return dbUpdateWritingSessionTitle(id, title);
}

export function touchWritingSession(id) {
  return dbTouchWritingSession(id);
}

export function getWritingSessionCharacters(sessionId) {
  return dbGetWritingSessionCharacters(sessionId);
}

export function addWritingSessionCharacter(sessionId, characterId) {
  return dbAddWritingSessionCharacter(sessionId, characterId);
}

export function removeWritingSessionCharacter(sessionId, characterId) {
  return dbRemoveWritingSessionCharacter(sessionId, characterId);
}

export function createMessage(data) {
  const msg = dbCreateMessage(data);
  dbTouchWritingSession(data.session_id);
  return msg;
}

export function getMessagesBySessionId(sessionId, limit, offset) {
  return dbGetMessagesBySessionId(sessionId, limit, offset);
}

export async function deleteMessagesAfter(messageId) {
  const ids = getMessageIdsAfter(messageId);
  for (const mid of ids) {
    await runOnDelete('message', mid);
  }
  return dbDeleteMessagesAfter(messageId);
}

export async function deleteAllMessages(sessionId) {
  const ids = getMessageIdsBySessionId(sessionId);
  for (const mid of ids) {
    await runOnDelete('message', mid);
  }
  return dbDeleteAllMessagesBySessionId(sessionId);
}
