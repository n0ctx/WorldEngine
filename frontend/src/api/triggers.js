import { request } from './request.js';

const BASE = '/api';

// ─── list ───────────────────────────────────────────────────────

export function listTriggers(worldId) {
  return request(`${BASE}/worlds/${worldId}/triggers`);
}

// ─── create ─────────────────────────────────────────────────────

export function createTrigger(worldId, data) {
  return request(`${BASE}/worlds/${worldId}/triggers`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ─── update / delete ─────────────────────────────────────────────

export function updateTrigger(triggerId, data) {
  return request(`${BASE}/triggers/${triggerId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteTrigger(triggerId) {
  return request(`${BASE}/triggers/${triggerId}`, { method: 'DELETE' });
}
