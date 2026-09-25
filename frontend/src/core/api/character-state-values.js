import { request } from './request.js';

const BASE = '/api';

export function getCharacterStateValues(characterId) {
  return request(`${BASE}/characters/${characterId}/state-values`);
}

export function updateCharacterStateValue(characterId, fieldKey, valueJson) {
  return request(`${BASE}/characters/${characterId}/state-values/${fieldKey}`, {
    method: 'PATCH',
    body: JSON.stringify({ value_json: valueJson }),
  });
}

/** AI 从人设正文提取状态字段建议值（只读，不写库） */
export function extractCharacterStateValues(characterId) {
  return request(`${BASE}/characters/${characterId}/state-values/extract`, { method: 'POST' }, '提取失败');
}

export function resetCharacterStateValues(characterId) {
  return request(`${BASE}/characters/${characterId}/state-values/reset`, { method: 'POST' }, '重置失败');
}
