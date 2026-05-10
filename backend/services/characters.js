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
import { createLogger, formatMeta } from '../utils/logger.js';

const log = createLogger('svc', 'green');

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
  log.info(`character.create  ${formatMeta({ characterId: character.id, worldId: character.world_id, name: character.name })}`);
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
  if (updated) {
    log.info(`character.update  ${formatMeta({ characterId: id, worldId: updated.world_id, fields: Object.keys(patch) })}`);
  }
  return updated;
}

export async function deleteCharacter(id) {
  const existing = dbGetCharacterById(id);
  await runOnDelete('character', id);
  const result = dbDeleteCharacter(id);
  log.info(`character.delete  ${formatMeta({ characterId: id, worldId: existing?.world_id, name: existing?.name })}`);
  return result;
}

export function reorderCharacters(items) {
  return dbReorderCharacters(items);
}
