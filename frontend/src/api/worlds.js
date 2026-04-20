import { request } from './request.js';

const BASE = '/api/worlds';

export function getWorlds() {
  return request(BASE);
}

export function getWorld(id) {
  return request(`${BASE}/${id}`);
}

export function createWorld(data) {
  return request(BASE, { method: 'POST', body: JSON.stringify(data) });
}

export function updateWorld(id, data) {
  return request(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteWorld(id) {
  return request(`${BASE}/${id}`, { method: 'DELETE' });
}
