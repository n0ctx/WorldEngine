import { request } from './request.js';

const BASE = '/api';

function nearbyBase(worldId, sessionId) {
  return `${BASE}/worlds/${worldId}/writing-sessions/${sessionId}/nearby`;
}

export function fetchNearby(worldId, sessionId) {
  return request(nearbyBase(worldId, sessionId));
}

export function addSavedNearbyFromCharacter(worldId, sessionId, characterId) {
  return request(nearbyBase(worldId, sessionId), {
    method: 'POST',
    body: JSON.stringify({ character_id: characterId }),
  });
}

export function patchNearby(worldId, sessionId, nearbyId, body) {
  return request(`${nearbyBase(worldId, sessionId)}/${nearbyId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function setNearbySaved(worldId, sessionId, nearbyId, isSaved) {
  return patchNearby(worldId, sessionId, nearbyId, { is_saved: isSaved });
}

export function patchNearbyPersona(worldId, sessionId, nearbyId, persona) {
  return patchNearby(worldId, sessionId, nearbyId, { persona });
}

export function patchNearbyName(worldId, sessionId, nearbyId, name) {
  return patchNearby(worldId, sessionId, nearbyId, { name });
}

export function patchNearbyState(worldId, sessionId, nearbyId, fieldKey, valueJson) {
  return request(`${nearbyBase(worldId, sessionId)}/${nearbyId}/state`, {
    method: 'PATCH',
    body: JSON.stringify({ field_key: fieldKey, value_json: valueJson }),
  });
}

export function removeNearby(worldId, sessionId, nearbyId) {
  return request(`${nearbyBase(worldId, sessionId)}/${nearbyId}`, { method: 'DELETE' });
}

export function analyzeNearbyForCard(worldId, sessionId, nearbyId) {
  return request(`${nearbyBase(worldId, sessionId)}/${nearbyId}/analyze`, { method: 'POST' });
}

export function createCharacterFromNearby(worldId, payload) {
  return request(`${BASE}/worlds/${worldId}/characters/from-nearby`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
