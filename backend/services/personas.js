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
  return dbCreatePersona(worldId, data);
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
  return persona;
}

/** 兼容旧接口：通过 worldId 更新 active persona */
export async function updatePersona(worldId, patch) {
  const persona = getOrCreatePersona(worldId);
  return updatePersonaByIdService(persona.id, patch);
}

/** 删除 persona（不能删最后一张） */
export async function deletePersonaService(id) {
  const persona = getPersonaById(id);
  if (!persona) throw new Error('玩家卡不存在');
  const oldAvatarPath = persona.avatar_path;
  deletePersonaById(id);
  if (oldAvatarPath) {
    await unlinkUploadFile(oldAvatarPath).catch(() => {});
  }
}

/** 设置激活 persona */
export function activatePersona(worldId, personaId) {
  const persona = getPersonaById(personaId);
  if (!persona || persona.world_id !== worldId) throw new Error('玩家卡不属于该世界');
  setActivePersona(worldId, personaId);
  return getPersonasByWorldId(worldId);
}

export function reorderPersonas(items) {
  return dbReorderPersonas(items);
}
