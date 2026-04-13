const BASE = '/api';

async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `请求失败：${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ─── list ───────────────────────────────────────────────────────

export function listGlobalEntries() {
  return request(`${BASE}/global-entries`);
}

export function listWorldEntries(worldId) {
  return request(`${BASE}/worlds/${worldId}/entries`);
}

export function listCharacterEntries(characterId) {
  return request(`${BASE}/characters/${characterId}/entries`);
}

// ─── create ─────────────────────────────────────────────────────

export function createGlobalEntry(data) {
  return request(`${BASE}/global-entries`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function createWorldEntry(worldId, data) {
  return request(`${BASE}/worlds/${worldId}/entries`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function createCharacterEntry(characterId, data) {
  return request(`${BASE}/characters/${characterId}/entries`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ─── update / delete ─────────────────────────────────────────────

export function updateEntry(type, id, data) {
  return request(`${BASE}/entries/${type}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteEntry(type, id) {
  return request(`${BASE}/entries/${type}/${id}`, { method: 'DELETE' });
}

// ─── reorder ────────────────────────────────────────────────────

export function reorderEntries(type, orderedIds, { worldId, characterId } = {}) {
  return request(`${BASE}/entries/${type}/reorder`, {
    method: 'PUT',
    body: JSON.stringify({ orderedIds, worldId, characterId }),
  });
}
