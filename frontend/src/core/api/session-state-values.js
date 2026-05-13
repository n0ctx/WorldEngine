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

/**
 * 手动更新单个会话状态值
 * @param {string} sessionId
 * @param {'world'|'persona'|'character'} category
 * @param {string} fieldKey
 * @param {string|null} valueJson  JSON 编码的值，null 表示清空
 * @param {string} [characterId]  仅 category='character' 时必填
 */
export async function patchSessionStateValue(sessionId, category, fieldKey, valueJson, characterId) {
  let url;
  if (category === 'world') {
    url = `/api/sessions/${sessionId}/world-state-values/${fieldKey}`;
  } else if (category === 'persona') {
    url = `/api/sessions/${sessionId}/persona-state-values/${fieldKey}`;
  } else {
    url = `/api/sessions/${sessionId}/character-state-values/${characterId}/${fieldKey}`;
  }
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value_json: valueJson }),
  });
  if (!res.ok) throw new Error('更新状态值失败');
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
