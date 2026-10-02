import {
  createWritingSession as dbCreateWritingSession,
  getWritingSessionsByWorldId as dbGetWritingSessionsByWorldId,
  getWritingSessionById as dbGetWritingSessionById,
} from '../db/queries/writing-sessions.js';
import { deleteSession as dbDeleteSession } from '../db/queries/sessions.js';
import { getMessageIdsBySessionId } from '../db/queries/messages.js';
import { runOnDelete } from '../utils/cleanup-hooks.js';
import { getConfig } from './config.js';
import { resolveBaseEntities } from '../memory/state-update-context.js';
import { createLogger, formatMeta } from '../utils/logger.js';
import {
  createPersona as dbCreatePersona,
  getActivePersonaIdByWorldId,
} from '../db/queries/personas.js';

const log = createLogger('svc', 'green');

/**
 * 解析某世界当前应当用于新写作 session 的 persona_id：
 * 优先 worlds.active_persona_id，回退到该世界最早创建的 persona。
 * 世界下无任何 persona 时自动建一张默认 persona 并返回其 id（写作 session 强制要求 persona）。
 */
function resolveActivePersonaId(worldId) {
  const existingId = getActivePersonaIdByWorldId(worldId);
  if (existingId) return existingId;
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
  // 开局就建好玩家实体并带入人设的档案初始值，不等第一轮状态整理
  resolveBaseEntities({ session, worldId, sessionId: session.id, round: 0, characters: [], isWriting: true });
  log.info(`writing_session.create  ${formatMeta({ sessionId: session.id, worldId, personaId })}`);
  return session;
}

export function getActiveWritingSessionsByWorldId(worldId) {
  const personaId = resolveActivePersonaId(worldId);
  if (!personaId) return [];
  return dbGetWritingSessionsByWorldId(worldId, personaId);
}

export function getWritingSessionById(id) {
  return dbGetWritingSessionById(id);
}

/**
 * 写作会话的删除比 chat 多一步逐条 message 清理回调：
 * services/personas.js 删 persona 时依赖这条级联语义，不能退化成 sessions.deleteSession。
 */
export async function deleteWritingSession(id) {
  const ids = getMessageIdsBySessionId(id);
  for (const mid of ids) {
    await runOnDelete('message', mid);
  }
  await runOnDelete('session', id);
  const result = dbDeleteSession(id);
  log.info(`writing_session.delete  ${formatMeta({ sessionId: id, messages: ids.length })}`);
  return result;
}

// 消息读写与 touch 在两种模式下完全同构（底层都是同一张 sessions / messages 表），
// 统一由 services/sessions.js 承担，这里只做转出口。
export {
  touchSession as touchWritingSession,
  createMessage,
  getMessagesBySessionId,
  cleanupMessagesFrom,
  deleteMessagesAfter,
} from './sessions.js';
