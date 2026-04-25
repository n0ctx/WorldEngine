import { request } from './request.js';

const BASE = '/api/worlds';

export function getWorlds() {
  return request(BASE);
}

export function getWorld(id) {
  return request(`${BASE}/${id}`);
}

export function createWorld(data) {
  return request(BASE, { method: 'POST', body: JSON.stringify(data) });
}

export function updateWorld(id, data) {
  return request(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteWorld(id) {
  return request(`${BASE}/${id}`, { method: 'DELETE' });
}

export function uploadWorldCover(worldId, file) {
  const formData = new FormData();
  formData.append('cover', file);
  return fetch(`${BASE}/${worldId}/cover`, {
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
