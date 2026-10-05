import { request } from './request.js';

const BASE = '/api';

function stateMemoryBase(sessionId) {
  return `${BASE}/sessions/${sessionId}/state-memory`;
}

export function fetchStateMemory(sessionId) {
  return request(stateMemoryBase(sessionId));
}

export function createStateEntity(sessionId, body) {
  return request(`${stateMemoryBase(sessionId)}/entities`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateStateEntity(sessionId, entityId, body) {
  return request(`${stateMemoryBase(sessionId)}/entities/${entityId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteStateEntity(sessionId, entityId) {
  return request(`${stateMemoryBase(sessionId)}/entities/${entityId}`, { method: 'DELETE' });
}

export function updateStateEntityField(sessionId, entityId, fieldKey, value) {
  return request(`${stateMemoryBase(sessionId)}/entities/${entityId}/fields/${fieldKey}`, {
    method: 'PATCH',
    body: JSON.stringify({ value }),
  });
}

export function createEntityFromCard(sessionId, characterId) {
  return request(`${stateMemoryBase(sessionId)}/entities/from-card`, {
    method: 'POST',
    body: JSON.stringify({ character_id: characterId }),
  });
}

export function analyzeEntityForCard(sessionId, entityId) {
  return request(`${stateMemoryBase(sessionId)}/entities/${entityId}/analyze`, { method: 'POST' });
}

export function updateStateWorld(sessionId, body) {
  return request(`${stateMemoryBase(sessionId)}/world`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function createStateRelation(sessionId, body) {
  return request(`${stateMemoryBase(sessionId)}/relations`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function deleteStateRelation(sessionId, relationId) {
  return request(`${stateMemoryBase(sessionId)}/relations/${relationId}`, { method: 'DELETE' });
}

export function createStateThread(sessionId, body) {
  return request(`${stateMemoryBase(sessionId)}/threads`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateStateThread(sessionId, threadId, body) {
  return request(`${stateMemoryBase(sessionId)}/threads/${threadId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function createCharacterFromEntity(worldId, payload) {
  return request(`${BASE}/worlds/${worldId}/characters/from-entity`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createPersonaFromEntity(worldId, payload) {
  return request(`${BASE}/worlds/${worldId}/personas/from-entity`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchStateMemorySchema() {
  return request(`${BASE}/state-memory/schema`);
}
