import { request } from './request.js';

const BASE = '/api';

export function getPersonaStateValues(worldId) {
  return request(`${BASE}/worlds/${worldId}/persona-state-values`);
}

export function updatePersonaStateValue(worldId, fieldKey, valueJson) {
  return request(`${BASE}/worlds/${worldId}/persona-state-values/${fieldKey}`, {
    method: 'PATCH',
    body: JSON.stringify({ value_json: valueJson }),
  });
}

export function getPersonaStateValuesByPersonaId(worldId, personaId) {
  return request(`${BASE}/worlds/${worldId}/personas/${personaId}/state-values`);
}

export function updatePersonaStateValueByPersonaId(worldId, personaId, fieldKey, valueJson) {
  return request(`${BASE}/worlds/${worldId}/personas/${personaId}/state-values/${fieldKey}`, {
    method: 'PATCH',
    body: JSON.stringify({ value_json: valueJson }),
  });
}

export function resetPersonaStateValuesByPersonaId(worldId, personaId) {
  return request(`${BASE}/worlds/${worldId}/personas/${personaId}/state-values/reset`, { method: 'POST' }, '重置失败');
}

export function resetPersonaStateValues(worldId) {
  return request(`${BASE}/worlds/${worldId}/persona-state-values/reset`, { method: 'POST' }, '重置失败');
}

/** 玩家卡的档案初始值（身份 / 外貌），行形状同状态值：{ field_key, label, group, type, value_json } */
export function getPersonaProfileDefaults(personaId) {
  return request(`${BASE}/personas/${personaId}/profile-defaults`);
}

export function updatePersonaProfileDefault(personaId, fieldKey, valueJson) {
  return request(`${BASE}/personas/${personaId}/profile-defaults/${fieldKey}`, {
    method: 'PATCH',
    body: JSON.stringify({ value_json: valueJson }),
  });
}
