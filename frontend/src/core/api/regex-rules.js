import { request } from './request.js';
import { createResourceCrud } from './resourceCrud.js';

const BASE = '/api/regex-rules';
const { create: createRegexRule, update: updateRegexRule, remove: deleteRegexRule, reorder: reorderRegexRules } = createResourceCrud(BASE);

export function listRegexRules({ scope, worldId, mode } = {}) {
  const params = new URLSearchParams();
  if (scope) params.set('scope', scope);
  if (worldId !== undefined && worldId !== null) params.set('worldId', worldId);
  if (mode) params.set('mode', mode);
  const query = params.toString() ? `?${params}` : '';
  return request(`${BASE}${query}`);
}

export { createRegexRule, updateRegexRule, deleteRegexRule, reorderRegexRules };
