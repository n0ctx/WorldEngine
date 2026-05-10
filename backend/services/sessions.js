import {
  createSession as dbCreateSession,
  getSessionById as dbGetSessionById,
  getSessionsByCharacterId as dbGetSessionsByCharacterId,
  getLatestChatSessionByWorldId as dbGetLatestChatSessionByWorldId,
  getLatestSessionByWorldId as dbGetLatestSessionByWorldId,
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
import { getConfig } from './config.js';
import { ensureDiaryTimeField } from './worlds.js';
import { createLogger, formatMeta } from '../utils/logger.js';

const log = createLogger('svc', 'green');

/**
 * 创建会话；若角色有 first_message 则自动插入开场白
 */
export function createSession(characterId) {
  const character = getCharacterById(characterId);
  const config = getConfig();
  const diaryChat = config.diary?.chat;
  const diary_date_mode = diaryChat?.enabled ? (diaryChat.date_mode ?? 'virtual') : null;
  const session = dbCreateSession(characterId, { diary_date_mode });

  // 懒创建/同步 diary_time 字段（防止世界创建时日记未开启的场景）
  if (diary_date_mode && character?.world_id) {
    ensureDiaryTimeField(character.world_id);
  }

  if (character && character.first_message) {
    dbCreateMessage({
      session_id: session.id,
      role: 'assistant',
      content: character.first_message,
      created_at: session.created_at,
    });
  }

  log.info(`session.create  ${formatMeta({ sessionId: session.id, characterId, worldId: character?.world_id })}`);
  return session;
}

export function getSessionById(id) {
  return dbGetSessionById(id);
}

export function getSessionsByCharacterId(characterId, limit, offset) {
  return dbGetSessionsByCharacterId(characterId, limit, offset);
}

export function getLatestChatSessionByWorldId(worldId) {
  return dbGetLatestChatSessionByWorldId(worldId);
}

export function getLatestSessionByWorldId(worldId) {
  return dbGetLatestSessionByWorldId(worldId);
}

export function updateSessionTitle(id, title) {
  return dbUpdateSessionTitle(id, title);
}

export function touchSession(id) {
  return dbTouchSession(id);
}

export async function deleteSession(id) {
  await runOnDelete('session', id);
  const result = dbDeleteSession(id);
  log.info(`session.delete  ${formatMeta({ sessionId: id })}`);
  return result;
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
  log.info(`message.edit_and_truncate  ${formatMeta({ messageId: id, sessionId: updated?.session_id })}`);
  return updated;
}

export async function deleteMessage(id) {
  await runOnDelete('message', id);
  const result = dbDeleteMessage(id);
  log.info(`message.delete  ${formatMeta({ messageId: id })}`);
  return result;
}

export async function deleteMessagesAfter(messageId) {
  const ids = getMessageIdsAfter(messageId);
  for (const mid of ids) {
    await runOnDelete('message', mid);
  }
  const result = dbDeleteMessagesAfter(messageId);
  log.info(`message.delete_after  ${formatMeta({ messageId, count: ids.length })}`);
  return result;
}

export async function deleteAllMessagesBySessionId(sessionId) {
  const ids = getMessageIdsBySessionId(sessionId);
  for (const mid of ids) {
    await runOnDelete('message', mid);
  }
  const result = dbDeleteAllMessagesBySessionId(sessionId);
  log.info(`message.delete_all  ${formatMeta({ sessionId, count: ids.length })}`);
  return result;
}

export function updateMessageContent(id, content) {
  return dbUpdateMessageContent(id, content);
}
