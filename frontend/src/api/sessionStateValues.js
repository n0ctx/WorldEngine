export async function fetchSessionStateValues(sessionId) {
  const res = await fetch(`/api/sessions/${sessionId}/state-values`);
  if (!res.ok) throw new Error('获取状态值失败');
  return res.json(); // { world, persona, character }
}

export async function resetSessionWorldStateValues(sessionId) {
  const res = await fetch(`/api/sessions/${sessionId}/world-state-values`, { method: 'DELETE' });
  if (!res.ok) throw new Error('重置世界状态失败');
  return fetchSessionStateValues(sessionId);
}

export async function resetSessionPersonaStateValues(sessionId) {
  const res = await fetch(`/api/sessions/${sessionId}/persona-state-values`, { method: 'DELETE' });
  if (!res.ok) throw new Error('重置玩家状态失败');
  return fetchSessionStateValues(sessionId);
}

export async function resetSessionCharacterStateValues(sessionId) {
  const res = await fetch(`/api/sessions/${sessionId}/character-state-values`, { method: 'DELETE' });
  if (!res.ok) throw new Error('重置角色状态失败');
  return fetchSessionStateValues(sessionId);
}

export async function fetchSessionCharacterStateValues(sessionId, characterId) {
  const res = await fetch(`/api/sessions/${sessionId}/characters/${characterId}/state-values`);
  if (!res.ok) throw new Error('获取角色状态失败');
  return res.json();
}

export async function resetSessionCharacterStateValuesByChar(sessionId, characterId) {
  const res = await fetch(`/api/sessions/${sessionId}/characters/${characterId}/state-values`, { method: 'DELETE' });
  if (!res.ok) throw new Error('重置角色状态失败');
  return res.json();
}
