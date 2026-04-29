const BASE = '/api';

export async function getLongTermMemory(sessionId) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/long-term-memory`);
  if (!res.ok) throw new Error(`getLongTermMemory failed: ${res.status}`);
  return res.json();
}

export async function updateLongTermMemory(sessionId, content) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/long-term-memory`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`updateLongTermMemory failed: ${res.status}`);
  return res.json();
}
