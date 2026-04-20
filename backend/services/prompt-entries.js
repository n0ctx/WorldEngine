import {
  createGlobalEntry, getGlobalEntryById, getAllGlobalEntries, updateGlobalEntry, deleteGlobalEntry, reorderGlobalEntries,
  createWorldEntry, getWorldEntryById, getAllWorldEntries, updateWorldEntry, deleteWorldEntry, reorderWorldEntries,
  createCharacterEntry, getCharacterEntryById, getAllCharacterEntries, updateCharacterEntry, deleteCharacterEntry, reorderCharacterEntries,
} from '../db/queries/prompt-entries.js';

// ─── global ──────────────────────────────────────────────────────

export function createGlobalPromptEntry(data) {
  return createGlobalEntry(data);
}

export function getGlobalPromptEntryById(id) {
  return getGlobalEntryById(id);
}

export function listGlobalPromptEntries(mode) {
  return getAllGlobalEntries(mode);
}

export function updateGlobalPromptEntry(id, patch) {
  return updateGlobalEntry(id, patch);
}

export function deleteGlobalPromptEntry(id) {
  return deleteGlobalEntry(id);
}

export function reorderGlobalPromptEntries(orderedIds) {
  reorderGlobalEntries(orderedIds);
}

// ─── world ───────────────────────────────────────────────────────

export function createWorldPromptEntry(worldId, data) {
  return createWorldEntry({ ...data, world_id: worldId });
}

export function getWorldPromptEntryById(id) {
  return getWorldEntryById(id);
}

export function listWorldPromptEntries(worldId) {
  return getAllWorldEntries(worldId);
}

export function updateWorldPromptEntry(id, patch) {
  return updateWorldEntry(id, patch);
}

export function deleteWorldPromptEntry(id) {
  return deleteWorldEntry(id);
}

export function reorderWorldPromptEntries(worldId, orderedIds) {
  reorderWorldEntries(worldId, orderedIds);
}

// ─── character ───────────────────────────────────────────────────

export function createCharacterPromptEntry(characterId, data) {
  return createCharacterEntry({ ...data, character_id: characterId });
}

export function getCharacterPromptEntryById(id) {
  return getCharacterEntryById(id);
}

export function listCharacterPromptEntries(characterId) {
  return getAllCharacterEntries(characterId);
}

export function updateCharacterPromptEntry(id, patch) {
  return updateCharacterEntry(id, patch);
}

export function deleteCharacterPromptEntry(id) {
  return deleteCharacterEntry(id);
}

export function reorderCharacterPromptEntries(characterId, orderedIds) {
  reorderCharacterEntries(characterId, orderedIds);
}
