import {
  createCharacter as dbCreateCharacter,
  getCharacterById as dbGetCharacterById,
  getCharactersByWorldId as dbGetCharactersByWorldId,
  updateCharacter as dbUpdateCharacter,
  deleteCharacter as dbDeleteCharacter,
  reorderCharacters as dbReorderCharacters,
} from '../db/queries/characters.js';
import { getCharacterStateFieldsByWorldId } from '../db/queries/character-state-fields.js';
import { upsertCharacterStateValue } from '../db/queries/character-state-values.js';

function getInitialValueJson(field) {
  if (field.default_value != null) return field.default_value;
  switch (field.type) {
    case 'text':    return JSON.stringify('');
    case 'number':  return JSON.stringify(0);
    case 'boolean': return JSON.stringify(false);
    case 'enum': {
      const opts = field.enum_options;
      return (Array.isArray(opts) && opts.length > 0) ? JSON.stringify(opts[0]) : null;
    }
    default:        return null;
  }
}

export function createCharacter(data) {
  const character = dbCreateCharacter(data);
  // 根据所属世界的 character_state_fields 初始化角色状态值
  const fields = getCharacterStateFieldsByWorldId(character.world_id);
  for (const field of fields) {
    upsertCharacterStateValue(character.id, field.field_key, getInitialValueJson(field));
  }
  return character;
}

export function getCharacterById(id) {
  return dbGetCharacterById(id);
}

export function getCharactersByWorldId(worldId) {
  return dbGetCharactersByWorldId(worldId);
}

export function updateCharacter(id, patch) {
  return dbUpdateCharacter(id, patch);
}

export function deleteCharacter(id) {
  return dbDeleteCharacter(id);
}

export function reorderCharacters(items) {
  return dbReorderCharacters(items);
}
