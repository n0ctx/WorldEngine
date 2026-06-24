const BASE = '/api';

export async function getTableMemory(sessionId) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/table-memory`);
  if (!res.ok) throw new Error(`getTableMemory failed: ${res.status}`);
  return res.json(); // { tables, markdown, schema }
}

export async function updateTableMemory(sessionId, tables) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/table-memory`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tables }),
  });
  if (!res.ok) throw new Error(`updateTableMemory failed: ${res.status}`);
  return res.json();
}
