import { request } from './request.js';

const BASE = '/api';

// ─── list ───────────────────────────────────────────────────────

export function listGlobalEntries({ mode } = {}) {
  const params = new URLSearchParams();
  if (mode) params.set('mode', mode);
  const query = params.toString() ? `?${params}` : '';
  return request(`${BASE}/global-entries${query}`);
}

export function listWorldEntries(worldId) {
  return request(`${BASE}/worlds/${worldId}/entries`);
}

export function listCharacterEntries(characterId) {
  return request(`${BASE}/characters/${characterId}/entries`);
}

// ─── create ─────────────────────────────────────────────────────

export function createGlobalEntry(data) {
  return request(`${BASE}/global-entries`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function createWorldEntry(worldId, data) {
  return request(`${BASE}/worlds/${worldId}/entries`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function createCharacterEntry(characterId, data) {
  return request(`${BASE}/characters/${characterId}/entries`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ─── update / delete ─────────────────────────────────────────────

export function updateEntry(type, id, data) {
  return request(`${BASE}/entries/${type}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteEntry(type, id) {
  return request(`${BASE}/entries/${type}/${id}`, { method: 'DELETE' });
}

// ─── reorder ────────────────────────────────────────────────────

export function reorderEntries(type, orderedIds, { worldId, characterId } = {}) {
  return request(`${BASE}/entries/${type}/reorder`, {
    method: 'PUT',
    body: JSON.stringify({ orderedIds, worldId, characterId }),
  });
}
