import {
  createWorldEntry, getWorldEntryById, getAllWorldEntries, updateWorldEntry, deleteWorldEntry, reorderWorldEntries,
} from '../db/queries/prompt-entries.js';
import { createLogger, formatMeta } from '../utils/logger.js';

const log = createLogger('svc', 'green');

// ─── world ───────────────────────────────────────────────────────

export function createWorldPromptEntry(worldId, data) {
  const entry = createWorldEntry({ ...data, world_id: worldId });
  log.info(`prompt_entry.create  ${formatMeta({ worldId, entryId: entry.id, title: entry.title, trigger: entry.trigger_type })}`);
  return entry;
}

export function getWorldPromptEntryById(id) {
  return getWorldEntryById(id);
}

export function listWorldPromptEntries(worldId) {
  return getAllWorldEntries(worldId);
}

export function updateWorldPromptEntry(id, patch) {
  const entry = updateWorldEntry(id, patch);
  if (entry) {
    log.info(`prompt_entry.update  ${formatMeta({ entryId: id, worldId: entry.world_id, fields: Object.keys(patch) })}`);
  }
  return entry;
}

export function deleteWorldPromptEntry(id) {
  const result = deleteWorldEntry(id);
  log.info(`prompt_entry.delete  ${formatMeta({ entryId: id })}`);
  return result;
}

export function reorderWorldPromptEntries(worldId, orderedIds) {
  reorderWorldEntries(worldId, orderedIds);
}
