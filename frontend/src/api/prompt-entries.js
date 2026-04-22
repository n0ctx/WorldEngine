import { request } from './request.js';

const BASE = '/api';

export function listWorldEntries(worldId) {
  return request(`${BASE}/worlds/${worldId}/entries`);
}

export function createWorldEntry(worldId, data) {
  return request(`${BASE}/worlds/${worldId}/entries`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateWorldEntry(id, data) {
  return request(`${BASE}/world-entries/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteWorldEntry(id) {
  return request(`${BASE}/world-entries/${id}`, {
    method: 'DELETE',
  });
}

export function reorderWorldEntries(worldId, orderedIds) {
  return request(`${BASE}/world-entries/reorder`, {
    method: 'PUT',
    body: JSON.stringify({ orderedIds, worldId }),
  });
}
