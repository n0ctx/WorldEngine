import { request, uploadForm } from './request.js';

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

export function reorderWorlds(items) {
  return request(`${BASE}/reorder`, { method: 'PUT', body: JSON.stringify({ items }) });
}

/**
 * 上传封面图。accentColor 为前端 canvas 取色结果（见 core/utils/extractAccentColor.js），
 * 随封面一并提交；后端只在世界当前主色来源不是 'manual' 时才会用它覆盖 accent_color。
 */
export function uploadWorldCover(worldId, file, accentColor) {
  const formData = new FormData();
  formData.append('cover', file);
  if (accentColor) formData.append('accent_color', accentColor);
  return uploadForm(`${BASE}/${worldId}/cover`, formData);
}
