/**
 * 章节标题 API — 写作空间专用
 */

/**
 * 获取指定写作会话的所有章节标题。
 * @param {string} worldId
 * @param {string} sessionId
 * @returns {Promise<Array<{chapter_index: number, title: string, is_default: number}>>}
 */
export async function getChapterTitles(worldId, sessionId) {
  const res = await fetch(`/api/worlds/${worldId}/writing-sessions/${sessionId}/chapter-titles`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/**
 * 用户手动编辑章节标题（不调用 LLM）。
 * @param {string} worldId
 * @param {string} sessionId
 * @param {number} chapterIndex
 * @param {string} title
 */
export async function updateChapterTitle(worldId, sessionId, chapterIndex, title) {
  const res = await fetch(
    `/api/worlds/${worldId}/writing-sessions/${sessionId}/chapter-titles/${chapterIndex}`,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/**
 * LLM 重新生成章节标题。
 * @param {string} worldId
 * @param {string} sessionId
 * @param {number} chapterIndex
 * @returns {Promise<{title: string, chapterIndex: number}>}
 */
export async function retitleChapter(worldId, sessionId, chapterIndex) {
  const res = await fetch(
    `/api/worlds/${worldId}/writing-sessions/${sessionId}/chapter-titles/${chapterIndex}/retitle`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
