import {
  createWorldEntry, getWorldEntryById, getAllWorldEntries, updateWorldEntry, deleteWorldEntry, reorderWorldEntries,
} from '../db/queries/prompt-entries.js';

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
