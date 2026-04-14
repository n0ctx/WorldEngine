import {
  createSession as dbCreateSession,
  getSessionById as dbGetSessionById,
  getSessionsByCharacterId as dbGetSessionsByCharacterId,
  updateSessionTitle as dbUpdateSessionTitle,
  touchSession as dbTouchSession,
  deleteSession as dbDeleteSession,
} from '../db/queries/sessions.js';

import {
  createMessage as dbCreateMessage,
  getMessageById as dbGetMessageById,
  getMessagesBySessionId as dbGetMessagesBySessionId,
  updateMessageContent as dbUpdateMessageContent,
  deleteMessagesAfter as dbDeleteMessagesAfter,
  deleteMessage as dbDeleteMessage,
  deleteAllMessagesBySessionId as dbDeleteAllMessagesBySessionId,
  getMessageIdsAfter,
  getMessageIdsBySessionId,
} from '../db/queries/messages.js';
import { runOnDelete } from '../utils/cleanup-hooks.js';

import { getCharacterById } from '../db/queries/characters.js';

/**
 * 创建会话；若角色有 first_message 则自动插入开场白
 */
export function createSession(characterId) {
  const character = getCharacterById(characterId);
  const session = dbCreateSession(characterId);

  if (character && character.first_message) {
    dbCreateMessage({
      session_id: session.id,
      role: 'assistant',
      content: character.first_message,
      created_at: session.created_at,
    });
  }

  return session;
}

export function getSessionById(id) {
  return dbGetSessionById(id);
}

export function getSessionsByCharacterId(characterId, limit, offset) {
  return dbGetSessionsByCharacterId(characterId, limit, offset);
}

export function updateSessionTitle(id, title) {
  return dbUpdateSessionTitle(id, title);
}

export function touchSession(id) {
  return dbTouchSession(id);
}

export async function deleteSession(id) {
  await runOnDelete('session', id);
  return dbDeleteSession(id);
}

// ── 消息 ──

export function createMessage(data) {
  const msg = dbCreateMessage(data);
  // 更新会话的 updated_at
  dbTouchSession(data.session_id);
  return msg;
}

export function getMessageById(id) {
  return dbGetMessageById(id);
}

export function getMessagesBySessionId(sessionId, limit, offset) {
  return dbGetMessagesBySessionId(sessionId, limit, offset);
}

/**
 * 编辑消息：更新 content 并删除之后的所有消息
 */
export async function updateMessageAndDeleteAfter(id, content) {
  const updated = dbUpdateMessageContent(id, content);
  await deleteMessagesAfter(id);
  return updated;
}

export async function deleteMessage(id) {
  await runOnDelete('message', id);
  return dbDeleteMessage(id);
}

export async function deleteMessagesAfter(messageId) {
  const ids = getMessageIdsAfter(messageId);
  for (const mid of ids) {
    await runOnDelete('message', mid);
  }
  return dbDeleteMessagesAfter(messageId);
}

export async function deleteAllMessagesBySessionId(sessionId) {
  const ids = getMessageIdsBySessionId(sessionId);
  for (const mid of ids) {
    await runOnDelete('message', mid);
  }
  return dbDeleteAllMessagesBySessionId(sessionId);
}

export function updateMessageContent(id, content) {
  return dbUpdateMessageContent(id, content);
}

