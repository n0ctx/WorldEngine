import {
  createCharacter as dbCreateCharacter,
  getCharacterById as dbGetCharacterById,
  getCharactersByWorldId as dbGetCharactersByWorldId,
  updateCharacter as dbUpdateCharacter,
  deleteCharacter as dbDeleteCharacter,
} from '../db/queries/characters.js';

export function createCharacter(data) {
  return dbCreateCharacter(data);
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
