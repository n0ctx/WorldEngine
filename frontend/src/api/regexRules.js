const BASE = '/api/regex-rules';

export async function listRegexRules({ scope, worldId } = {}) {
  const params = new URLSearchParams();
  if (scope) params.set('scope', scope);
  if (worldId !== undefined && worldId !== null) params.set('worldId', worldId);
  const query = params.toString() ? `?${params}` : '';
  const res = await fetch(`${BASE}${query}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createRegexRule(data) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateRegexRule(id, patch) {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteRegexRule(id) {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
}

export async function reorderRegexRules(items) {
  const res = await fetch(`${BASE}/reorder`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
