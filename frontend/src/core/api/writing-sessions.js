import { recoverStream, streamPost, subscribeStream } from './sse-post.js';
import { editMessage } from './sessions.js';

// ─── 会话 CRUD ────────────────────────────────────────────────────────

export async function listWritingSessions(worldId) {
  const res = await fetch(`/api/worlds/${worldId}/writing-sessions`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function createWritingSession(worldId) {
  const res = await fetch(`/api/worlds/${worldId}/writing-sessions`, { method: 'POST' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function deleteWritingSession(worldId, sessionId) {
  const res = await fetch(`/api/worlds/${worldId}/writing-sessions/${sessionId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── 生成 ─────────────────────────────────────────────────────────────

/**
 * 生成（含可选用户输入），返回 abort 函数
 */
export function generate(worldId, sessionId, content, callbacks, opts = {}) {
  const body = { content: content || '' };
  if (opts.diaryInjection) body.diaryInjection = opts.diaryInjection;
  return streamPost(
    `/api/worlds/${worldId}/writing-sessions/${sessionId}/generate`,
    body,
    callbacks
  );
}

/**
 * 停止生成
 */
export async function stopGeneration(worldId, sessionId) {
  const res = await fetch(`/api/worlds/${worldId}/writing-sessions/${sessionId}/stop`, { method: 'POST' });
  try { return await res.json(); } catch { return {}; }
}

/**
 * AI 代拟玩家消息
 */
export async function impersonateWriting(worldId, sessionId) {
  const res = await fetch(
    `/api/worlds/${worldId}/writing-sessions/${sessionId}/impersonate`,
    { method: 'POST' }
  );
  if (!res.ok) throw new Error(`impersonate failed: ${res.status}`);
  return res.json();
}

/**
 * 重新生成（从 afterMessageId 之后重新生成），返回 abort 函数
 */
export function regenerateWriting(worldId, sessionId, afterMessageId, callbacks) {
  return streamPost(
    `/api/worlds/${worldId}/writing-sessions/${sessionId}/regenerate`,
    { afterMessageId },
    callbacks
  );
}

/**
 * 编辑用户消息并重新生成，返回 abort 函数
 */
export function editAndRegenerateWriting(worldId, sessionId, messageId, newContent, callbacks) {
  return streamPost(
    `/api/worlds/${worldId}/writing-sessions/${sessionId}/regenerate`,
    async () => ({ afterMessageId: (await editMessage(messageId, newContent)).id }),
    callbacks
  );
}

/**
 * 编辑 AI 消息内容（不重新生成）
 */
export async function editWritingAssistantMessage(worldId, sessionId, messageId, content) {
  const res = await fetch(
    `/api/worlds/${worldId}/writing-sessions/${sessionId}/edit-assistant`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId, content }),
    }
  );
  if (!res.ok) throw new Error(`editWritingAssistant failed: ${res.status}`);
  return res.json();
}

/**
 * 重新生成写作会话标题
 * @returns {Promise<{title: string|null}>}
 */
export async function retitleWritingSession(worldId, sessionId) {
  const res = await fetch(
    `/api/worlds/${worldId}/writing-sessions/${sessionId}/retitle`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/**
 * 续写，返回 abort 函数
 */
export function continueGeneration(worldId, sessionId, callbacks) {
  return streamPost(
    `/api/worlds/${worldId}/writing-sessions/${sessionId}/continue`,
    undefined,
    callbacks
  );
}

export async function recoverWritingStream(worldId, sessionId) {
  return recoverStream(`/api/worlds/${worldId}/writing-sessions/${sessionId}/recover-stream`);
}

export function subscribeWritingStream(worldId, sessionId, callbacks) {
  return subscribeStream(`/api/worlds/${worldId}/writing-sessions/${sessionId}/stream`, callbacks);
}
