import { request } from './request.js';

const BASE = '/api';

export function getCharactersByWorld(worldId) {
  return request(`${BASE}/worlds/${worldId}/characters`);
}

export function getCharacter(id) {
  return request(`${BASE}/characters/${id}`);
}

export function createCharacter(worldId, data) {
  return request(`${BASE}/worlds/${worldId}/characters`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateCharacter(id, data) {
  return request(`${BASE}/characters/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteCharacter(id) {
  return request(`${BASE}/characters/${id}`, { method: 'DELETE' });
}

export function reorderCharacters(items) {
  return request(`${BASE}/characters/reorder`, {
    method: 'PUT',
    body: JSON.stringify({ items }),
  });
}

export function uploadAvatar(characterId, file) {
  const formData = new FormData();
  formData.append('avatar', file);
  return fetch(`${BASE}/characters/${characterId}/avatar`, {
    method: 'POST',
    body: formData,
  }).then(async (res) => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `上传失败：${res.status}`);
    }
    return res.json();
  });
}
