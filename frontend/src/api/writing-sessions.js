import { parseSSEStream } from './stream-parser.js';

/**
 * 内部辅助：POST 请求 + SSE 流解析（写作版）
 * onStreamEnd 仅在成功完成或 AbortError 时调用；HTTP 错误和非 Abort 异常时不调用（由 onError 处理）
 */
function streamPost(url, body, callbacks) {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        callbacks.onError?.(err.error || `HTTP ${res.status}`);
        return;
      }
      await parseSSEStream(res, callbacks);
      callbacks.onStreamEnd?.();
    } catch (err) {
      if (err.name !== 'AbortError') {
        callbacks.onError?.(err.message);
      } else {
        callbacks.onStreamEnd?.();
      }
    }
  })();

  return () => controller.abort();
}

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

// ─── 消息 ─────────────────────────────────────────────────────────────

export async function listMessages(worldId, sessionId) {
  const res = await fetch(`/api/worlds/${worldId}/writing-sessions/${sessionId}/messages`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function clearMessages(worldId, sessionId) {
  const res = await fetch(`/api/worlds/${worldId}/writing-sessions/${sessionId}/messages`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── 激活角色 ─────────────────────────────────────────────────────────

export async function listActiveCharacters(worldId, sessionId) {
  const res = await fetch(`/api/worlds/${worldId}/writing-sessions/${sessionId}/characters`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function activateCharacter(worldId, sessionId, characterId) {
  const res = await fetch(
    `/api/worlds/${worldId}/writing-sessions/${sessionId}/characters/${characterId}`,
    { method: 'PUT' }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function extractCharactersFromMessage(worldId, sessionId, assistantMessageId, callbacks, { dryRun = false } = {}) {
  return streamPost(
    '/api/assistant/extract-characters',
    { worldId, sessionId, assistantMessageId, dryRun },
    callbacks,
  );
}

export function confirmCharacters(worldId, sessionId, characters, callbacks) {
  return streamPost(
    '/api/assistant/confirm-characters',
    { worldId, sessionId, characters },
    callbacks,
  );
}

export async function deactivateCharacter(worldId, sessionId, characterId) {
  const res = await fetch(
    `/api/worlds/${worldId}/writing-sessions/${sessionId}/characters/${characterId}`,
    { method: 'DELETE' }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── 世界角色列表 ──────────────────────────────────────────────────────

export async function listWorldCharacters(worldId) {
  const res = await fetch(`/api/worlds/${worldId}/characters`);
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
  await fetch(`/api/worlds/${worldId}/writing-sessions/${sessionId}/stop`, { method: 'POST' });
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
  const controller = new AbortController();

  (async () => {
    try {
      const editRes = await fetch(`/api/messages/${messageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent }),
      });
      if (!editRes.ok) throw new Error(`editMessage failed: ${editRes.status}`);
      const updated = await editRes.json();

      const res = await fetch(
        `/api/worlds/${worldId}/writing-sessions/${sessionId}/regenerate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ afterMessageId: updated.id }),
          signal: controller.signal,
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        callbacks.onError?.(err.error || `HTTP ${res.status}`);
        return;
      }
      await parseSSEStream(res, callbacks);
      callbacks.onStreamEnd?.();
    } catch (err) {
      if (err.name !== 'AbortError') {
        callbacks.onError?.(err.message);
      } else {
        callbacks.onStreamEnd?.();
      }
    }
  })();

  return () => controller.abort();
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
