import {
  getPersonaByWorldId,
  getPersonasByWorldId,
  getPersonaById,
  createPersona as dbCreatePersona,
  updatePersonaById,
  deletePersonaById,
  setActivePersona,
  upsertPersona,
  reorderPersonas as dbReorderPersonas,
} from '../db/queries/personas.js';
import { unlinkUploadFile } from '../utils/file-cleanup.js';
import { createLogger, formatMeta } from '../utils/logger.js';
import db from '../db/index.js';
import { deleteWritingSession } from './writing-sessions.js';

const log = createLogger('svc', 'green');

/** 获取激活的 persona，不存在则创建空 persona（兼容旧接口） */
export function getOrCreatePersona(worldId) {
  const existing = getPersonaByWorldId(worldId);
  if (existing) return existing;
  return upsertPersona(worldId, {});
}

/** 获取世界下所有 persona 列表（含 is_active） */
export function listPersonas(worldId) {
  // 确保至少有一条 persona
  getOrCreatePersona(worldId);
  return getPersonasByWorldId(worldId);
}

/** 创建新 persona */
export function createPersona(worldId, data) {
  const persona = dbCreatePersona(worldId, data);
  log.info(`persona.create  ${formatMeta({ worldId, personaId: persona.id, name: persona.name })}`);
  return persona;
}

/** 按 id 更新 persona，处理旧头像文件清理 */
export async function updatePersonaByIdService(id, patch) {
  let oldAvatarPath;
  if ('avatar_path' in patch) {
    oldAvatarPath = getPersonaById(id)?.avatar_path;
  }
  const persona = updatePersonaById(id, patch);
  if (oldAvatarPath && oldAvatarPath !== patch.avatar_path) {
    await unlinkUploadFile(oldAvatarPath);
  }
  if (persona) {
    log.info(`persona.update  ${formatMeta({ personaId: id, worldId: persona.world_id, fields: Object.keys(patch) })}`);
  }
  return persona;
}

/** 兼容旧接口：通过 worldId 更新 active persona */
export async function updatePersona(worldId, patch) {
  const persona = getOrCreatePersona(worldId);
  return updatePersonaByIdService(persona.id, patch);
}

/**
 * 删除 persona（不能删最后一张）。
 *
 * 写作 session 与 persona 强绑定：删 persona 前先逐条 deleteWritingSession，
 * 让 cleanup-hooks（长期记忆/日记目录/附件等磁盘资源）正常触发。
 * 之后 DB 层 ON DELETE CASCADE 不会再有 session 行需要级联。
 */
export async function deletePersonaService(id) {
  const persona = getPersonaById(id);
  if (!persona) throw new Error('玩家卡不存在');
  const oldAvatarPath = persona.avatar_path;

  // "至少保留一张"检查必须在删 session 之前执行，否则一旦失败 session 已被永久清空。
  // 复用 deletePersonaById 的同一条件，保持单一来源。
  const count = db.prepare('SELECT COUNT(*) AS c FROM personas WHERE world_id = ?').get(persona.world_id);
  if (count.c <= 1) throw new Error('至少需要保留一张玩家卡');

  const sessionRows = db.prepare(
    "SELECT id FROM sessions WHERE persona_id = ? AND mode = 'writing'"
  ).all(id);
  for (const row of sessionRows) {
    await deleteWritingSession(row.id);
  }

  deletePersonaById(id);
  if (oldAvatarPath) {
    await unlinkUploadFile(oldAvatarPath).catch(() => {});
  }
  log.info(`persona.delete  ${formatMeta({ personaId: id, worldId: persona.world_id, name: persona.name, writingSessions: sessionRows.length })}`);
}

/** 设置激活 persona */
export function activatePersona(worldId, personaId) {
  const persona = getPersonaById(personaId);
  if (!persona || persona.world_id !== worldId) throw new Error('玩家卡不属于该世界');
  setActivePersona(worldId, personaId);
  log.info(`persona.activate  ${formatMeta({ worldId, personaId })}`);
  return getPersonasByWorldId(worldId);
}

export function reorderPersonas(items) {
  return dbReorderPersonas(items);
}
