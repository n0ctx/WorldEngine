import { request, uploadForm } from './request.js';
import { createResourceCrud } from './resourceCrud.js';

const BASE = '/api/worlds';
const { create: createWorld, update: updateWorld, remove: deleteWorld, reorder: reorderWorlds } = createResourceCrud(BASE);

export function getWorlds() {
  return request(BASE);
}

export function getWorld(id) {
  return request(`${BASE}/${id}`);
}

export { createWorld, updateWorld, deleteWorld, reorderWorlds };

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
