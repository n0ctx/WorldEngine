import { createStateFieldsApi } from './state-fields-factory.js';

const api = createStateFieldsApi('world-state-fields');

export const listWorldStateFields    = (worldId)            => api.list(worldId);
export const createWorldStateField   = (worldId, data)      => api.create(worldId, data);
export const updateWorldStateField   = (id, patch)          => api.update(id, patch);
export const deleteWorldStateField   = (id)                 => api.delete(id);
export const reorderWorldStateFields = (worldId, orderedIds) => api.reorder(worldId, orderedIds);

/** 根据当前日记设置同步 diary_time 字段（页面进入时调用） */
export async function syncDiaryTimeField(worldId) {
  await fetch(`/api/worlds/${worldId}/sync-diary`, { method: 'POST' });
}

/** 清除所有会话的日记数据（用户确认关闭日记功能后调用） */
export async function clearAllDiaries() {
  await fetch('/api/worlds/clear-all-diaries', { method: 'POST' });
}
