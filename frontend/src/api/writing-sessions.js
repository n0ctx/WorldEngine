// ─── 解析 SSE 流 ─────────────────────────────────────────────────────
async function parseSSEStream(response, callbacks) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const json = line.slice(6).trim();
        if (!json) continue;
        try {
          const evt = JSON.parse(json);
          if (evt.delta !== undefined) callbacks.onDelta?.(evt.delta);
          else if (evt.done) callbacks.onDone?.(evt.assistant, evt.options ?? []);
          else if (evt.aborted) callbacks.onAborted?.(evt.assistant);
          else if (evt.type === 'error') callbacks.onError?.(evt.error);
          else if (evt.type === 'title_updated') callbacks.onTitleUpdated?.(evt.title);
        } catch {
          // ignore malformed events
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
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
export function generate(worldId, sessionId, content, callbacks) {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(
        `/api/worlds/${worldId}/writing-sessions/${sessionId}/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: content || '' }),
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
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(
        `/api/worlds/${worldId}/writing-sessions/${sessionId}/regenerate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ afterMessageId }),
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
 * 续写，返回 abort 函数
 */
export function continueGeneration(worldId, sessionId, callbacks) {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(
        `/api/worlds/${worldId}/writing-sessions/${sessionId}/continue`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
