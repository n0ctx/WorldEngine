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
