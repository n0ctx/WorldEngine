import { request } from './request.js';

const BASE = '/api/regex-rules';

export function listRegexRules({ scope, worldId, mode } = {}) {
  const params = new URLSearchParams();
  if (scope) params.set('scope', scope);
  if (worldId !== undefined && worldId !== null) params.set('worldId', worldId);
  if (mode) params.set('mode', mode);
  const query = params.toString() ? `?${params}` : '';
  return request(`${BASE}${query}`);
}

export function createRegexRule(data) {
  return request(BASE, { method: 'POST', body: JSON.stringify(data) });
}

export function updateRegexRule(id, patch) {
  return request(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(patch) });
}

export function deleteRegexRule(id) {
  return request(`${BASE}/${id}`, { method: 'DELETE' });
}

export function reorderRegexRules(items) {
  return request(`${BASE}/reorder`, { method: 'PUT', body: JSON.stringify({ items }) });
}
