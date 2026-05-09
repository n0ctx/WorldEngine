import db from '../index.js';

/**
 * 关键词条目跨轮激活状态：sessions.keyword_active_state（JSON 字符串）。
 * 结构：{ "<entry_id>": { "round": <激活时的 round_index>, "ttl": <active_turns 快照> } }
 * ttl=0 表示永久；ttl>=1 时在 currentRound - round < ttl 期间有效。
 */

export function getKeywordActiveState(sessionId) {
  const row = db.prepare('SELECT keyword_active_state FROM sessions WHERE id = ?').get(sessionId);
  if (!row) return {};
  const raw = row.keyword_active_state;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {}
  return {};
}

export function setKeywordActiveState(sessionId, stateMap) {
  const safe = stateMap && typeof stateMap === 'object' && !Array.isArray(stateMap) ? stateMap : {};
  db.prepare('UPDATE sessions SET keyword_active_state = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(safe), Date.now(), sessionId);
}
