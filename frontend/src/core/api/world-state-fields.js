import { createStateFieldsApi } from './state-fields-factory.js';

const api = createStateFieldsApi('world-state-fields');

export const {
  list: listWorldStateFields,
  create: createWorldStateField,
  update: updateWorldStateField,
  delete: deleteWorldStateField,
  reorder: reorderWorldStateFields,
} = api;

/** 清除所有会话的日记数据（用户确认关闭日记功能后调用） */
export async function clearAllDiaries() {
  await fetch('/api/worlds/clear-all-diaries', { method: 'POST' });
}
