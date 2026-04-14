import { upsertPersona, getPersonaByWorldId } from '../db/queries/personas.js';
import { unlinkUploadFile } from '../utils/file-cleanup.js';

export function getOrCreatePersona(worldId) {
  const existing = getPersonaByWorldId(worldId);
  if (existing) return existing;
  return upsertPersona(worldId, {});
}

export async function updatePersona(worldId, patch) {
  let oldAvatarPath;
  if ('avatar_path' in patch) {
    oldAvatarPath = getPersonaByWorldId(worldId)?.avatar_path;
  }
  const persona = upsertPersona(worldId, patch);
  if (oldAvatarPath && oldAvatarPath !== patch.avatar_path) {
    await unlinkUploadFile(oldAvatarPath);
  }
  return persona;
}
