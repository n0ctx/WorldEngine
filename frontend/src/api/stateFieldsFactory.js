/**
 * stateFieldsFactory.js — 状态字段 API 工厂
 *
 * 三套状态字段（world/character/persona）的 CRUD 仅 URL 前缀不同，
 * 通过工厂函数统一生成，消除重复实现。
 *
 * URL 规律：
 *   集合：/api/worlds/:worldId/{typePath}
 *   单项：/api/{typePath}/:id
 *
 * @param {string} typePath  如 'world-state-fields' | 'character-state-fields' | 'persona-state-fields'
 */
import { request } from './request.js';

export function createStateFieldsApi(typePath) {
  const base = '/api';

  return {
    list(worldId) {
      return request(`${base}/worlds/${worldId}/${typePath}`);
    },
    create(worldId, data) {
      return request(`${base}/worlds/${worldId}/${typePath}`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    update(id, patch) {
      return request(`${base}/${typePath}/${id}`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
    },
    delete(id) {
      return request(`${base}/${typePath}/${id}`, { method: 'DELETE' });
    },
    reorder(worldId, orderedIds) {
      return request(`${base}/worlds/${worldId}/${typePath}/reorder`, {
        method: 'PUT',
        body: JSON.stringify({ orderedIds }),
      });
    },
  };
}
