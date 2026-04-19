import crypto from 'node:crypto';
import {
  createGlobalEntry, getGlobalEntryById, getAllGlobalEntries, updateGlobalEntry, deleteGlobalEntry, reorderGlobalEntries,
  createWorldEntry, getWorldEntryById, getAllWorldEntries, updateWorldEntry, deleteWorldEntry, reorderWorldEntries,
  createCharacterEntry, getCharacterEntryById, getAllCharacterEntries, updateCharacterEntry, deleteCharacterEntry, reorderCharacterEntries,
} from '../db/queries/prompt-entries.js';
import { embed } from '../llm/embedding.js';
import { upsertEntry, deleteEntry } from '../utils/vector-store.js';
import db from '../db/index.js';

// ─── 向量化辅助 ──────────────────────────────────────────────────

function writeEmbeddingId(table, id, embeddingId) {
  db.prepare(`UPDATE ${table} SET embedding_id = ? WHERE id = ?`).run(embeddingId, id);
}

async function vectorize(entry, table) {
  try {
    const text = `${entry.title} ${entry.summary || ''}`.trim();
    const vector = await embed(text);
    if (!vector) return; // embedding 未配置，跳过
    const embeddingId = entry.embedding_id || crypto.randomUUID();
    upsertEntry(embeddingId, entry.id, table, vector);
    writeEmbeddingId(table, entry.id, embeddingId);
  } catch (err) {
    console.error(`[prompt-entries] vectorize failed for ${table}/${entry.id}:`, err.message);
  }
}

// ─── global ──────────────────────────────────────────────────────

export function createGlobalPromptEntry(data) {
  const entry = createGlobalEntry(data);
  vectorize(entry, 'global_prompt_entries');
  return entry;
}

export function getGlobalPromptEntryById(id) {
  return getGlobalEntryById(id);
}

export function listGlobalPromptEntries(mode) {
  return getAllGlobalEntries(mode);
}

export function updateGlobalPromptEntry(id, patch) {
  const entry = updateGlobalEntry(id, patch);
  vectorize(entry, 'global_prompt_entries');
  return entry;
}

export function deleteGlobalPromptEntry(id) {
  const entry = getGlobalEntryById(id);
  const result = deleteGlobalEntry(id);
  if (entry?.embedding_id) deleteEntry(entry.embedding_id);
  return result;
}

export function reorderGlobalPromptEntries(orderedIds) {
  reorderGlobalEntries(orderedIds);
}

// ─── world ───────────────────────────────────────────────────────

export function createWorldPromptEntry(worldId, data) {
  const entry = createWorldEntry({ ...data, world_id: worldId });
  vectorize(entry, 'world_prompt_entries');
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
  vectorize(entry, 'world_prompt_entries');
  return entry;
}

export function deleteWorldPromptEntry(id) {
  const entry = getWorldEntryById(id);
  const result = deleteWorldEntry(id);
  if (entry?.embedding_id) deleteEntry(entry.embedding_id);
  return result;
}

export function reorderWorldPromptEntries(worldId, orderedIds) {
  reorderWorldEntries(worldId, orderedIds);
}

// ─── character ───────────────────────────────────────────────────

export function createCharacterPromptEntry(characterId, data) {
  const entry = createCharacterEntry({ ...data, character_id: characterId });
  vectorize(entry, 'character_prompt_entries');
  return entry;
}

export function getCharacterPromptEntryById(id) {
  return getCharacterEntryById(id);
}

export function listCharacterPromptEntries(characterId) {
  return getAllCharacterEntries(characterId);
}

export function updateCharacterPromptEntry(id, patch) {
  const entry = updateCharacterEntry(id, patch);
  vectorize(entry, 'character_prompt_entries');
  return entry;
}

export function deleteCharacterPromptEntry(id) {
  const entry = getCharacterEntryById(id);
  const result = deleteCharacterEntry(id);
  if (entry?.embedding_id) deleteEntry(entry.embedding_id);
  return result;
}

export function reorderCharacterPromptEntries(characterId, orderedIds) {
  reorderCharacterEntries(characterId, orderedIds);
}
