import { request } from './request.js';

const BASE = '/api';

export function getWorldStateValues(worldId) {
  return request(`${BASE}/worlds/${worldId}/state-values`);
}

export function updateWorldStateValue(worldId, fieldKey, valueJson) {
  return request(`${BASE}/worlds/${worldId}/state-values/${fieldKey}`, {
    method: 'PATCH',
    body: JSON.stringify({ value_json: valueJson }),
  });
}

export function resetWorldStateValues(worldId) {
  return request(`${BASE}/worlds/${worldId}/state-values/reset`, { method: 'POST' }, '重置失败');
}
