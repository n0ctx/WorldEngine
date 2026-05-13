const BASE = '/api/sessions';

/**
 * 获取某会话的所有日记条目（按 date_str ASC）
 * @returns {{ items: Array<{ date_str, date_display, summary, triggered_by_round_index, created_at }> }}
 */
export async function fetchDailyEntries(sessionId) {
  const res = await fetch(`${BASE}/${sessionId}/daily-entries`);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.items ?? [];
}

/**
 * 获取某日日记的完整正文（markdown）
 * @returns {string} 日记 markdown 内容
 */
export async function fetchDiaryContent(sessionId, dateStr) {
  const res = await fetch(`${BASE}/${sessionId}/daily-entries/${encodeURIComponent(dateStr)}`);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.content ?? '';
}
