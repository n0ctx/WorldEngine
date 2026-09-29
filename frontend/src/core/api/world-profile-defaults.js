import { request } from './request.js';

const BASE = '/api';

/** 世界卡的档案默认值（开场时间 / 开场地点），行形状：{ field_key, label, type, value_json } */
export function getWorldProfileDefaults(worldId) {
  return request(`${BASE}/worlds/${worldId}/profile-defaults`);
}

export function updateWorldProfileDefault(worldId, fieldKey, valueJson) {
  return request(`${BASE}/worlds/${worldId}/profile-defaults/${fieldKey}`, {
    method: 'PATCH',
    body: JSON.stringify({ value_json: valueJson }),
  });
}
