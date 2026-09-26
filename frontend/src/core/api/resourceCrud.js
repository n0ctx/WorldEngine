import { request } from './request.js';

export function createResourceCrud(base) {
  return {
    create(data) {
      return request(base, { method: 'POST', body: JSON.stringify(data) });
    },
    update(id, patch) {
      return request(`${base}/${id}`, { method: 'PUT', body: JSON.stringify(patch) });
    },
    remove(id) {
      return request(`${base}/${id}`, { method: 'DELETE' });
    },
    reorder(items) {
      return request(`${base}/reorder`, { method: 'PUT', body: JSON.stringify({ items }) });
    },
  };
}
