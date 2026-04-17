import {
  createCharacter as dbCreateCharacter,
  getCharacterById as dbGetCharacterById,
  getCharactersByWorldId as dbGetCharactersByWorldId,
  updateCharacter as dbUpdateCharacter,
  deleteCharacter as dbDeleteCharacter,
  reorderCharacters as dbReorderCharacters,
} from '../db/queries/characters.js';
import { runOnDelete } from '../utils/cleanup-hooks.js';
import { unlinkUploadFile } from '../utils/file-cleanup.js';
import { getCharacterStateFieldsByWorldId } from '../db/queries/character-state-fields.js';
import { upsertCharacterStateValue } from '../db/queries/character-state-values.js';

function getInitialValueJson(field) {
  return field.default_value ?? null;
}

export function createCharacter(data) {
  const character = dbCreateCharacter(data);
  // 根据所属世界的 character_state_fields 初始化角色状态值
  const fields = getCharacterStateFieldsByWorldId(character.world_id);
  for (const field of fields) {
    upsertCharacterStateValue(character.id, field.field_key, { defaultValueJson: getInitialValueJson(field) });
  }
  return character;
}

export function getCharacterById(id) {
  return dbGetCharacterById(id);
}

export function getCharactersByWorldId(worldId) {
  return dbGetCharactersByWorldId(worldId);
}

export async function updateCharacter(id, patch) {
  let oldAvatarPath;
  if ('avatar_path' in patch) {
    oldAvatarPath = dbGetCharacterById(id)?.avatar_path;
  }
  const updated = dbUpdateCharacter(id, patch);
  if (oldAvatarPath && oldAvatarPath !== patch.avatar_path) {
    await unlinkUploadFile(oldAvatarPath);
  }
  return updated;
}

export async function deleteCharacter(id) {
  await runOnDelete('character', id);
  return dbDeleteCharacter(id);
}

export function reorderCharacters(items) {
  return dbReorderCharacters(items);
}
