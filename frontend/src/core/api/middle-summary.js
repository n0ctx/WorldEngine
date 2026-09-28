const BASE = '/api';

export async function getMiddleSummary(sessionId) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/middle-summary`);
  if (!res.ok) throw new Error(`getMiddleSummary failed: ${res.status}`);
  return res.json();
}

export async function updateMiddleSummary(sessionId, content) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/middle-summary`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`updateMiddleSummary failed: ${res.status}`);
  return res.json();
}
