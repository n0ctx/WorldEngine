import { editMessage } from './sessions.js';

async function parseSSEStream(response, callbacks) {
  const {
    onDelta,
    onDone,
    onAborted,
    onError,
    onTitleUpdated,
    onUserSaved,
    onMemoryRecallStart,
    onMemoryRecallDone,
    onMemoryExpandStart,
    onMemoryExpandDone,
  } = callbacks;

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
          if (evt.delta !== undefined) onDelta?.(evt.delta);
          else if (evt.done) onDone?.(evt.assistant ?? null, evt.options ?? []);
          else if (evt.aborted) onAborted?.(evt.assistant ?? null);
          else if (evt.type === 'error') onError?.(evt.error);
          else if (evt.type === 'title_updated') onTitleUpdated?.(evt.title);
          else if (evt.type === 'user_saved') onUserSaved?.(evt.id);
          else if (evt.type === 'memory_recall_start') onMemoryRecallStart?.();
          else if (evt.type === 'memory_recall_done') onMemoryRecallDone?.(evt);
          else if (evt.type === 'memory_expand_start') onMemoryExpandStart?.(evt);
          else if (evt.type === 'memory_expand_done') onMemoryExpandDone?.(evt);
        } catch {
          // ignore malformed events
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * 发送消息，返回 abort 函数
 * callbacks 额外支持 onStreamEnd()：流连接实际关闭时触发（晚于 onDone，因为 title_updated 在 done 后发送）
 */
export function sendMessage(sessionId, content, attachments, callbacks) {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, attachments: attachments?.length ? attachments : undefined }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        callbacks.onError?.(err.error || `HTTP ${res.status}`);
        return;
      }
      await parseSSEStream(res, callbacks);
    } catch (err) {
      if (err.name !== 'AbortError') {
        callbacks.onError?.(err.message);
      }
    } finally {
      callbacks.onStreamEnd?.();
    }
  })();

  return () => controller.abort();
}

/**
 * 停止生成
 */
export async function stopGeneration(sessionId) {
  await fetch(`/api/sessions/${sessionId}/stop`, { method: 'POST' });
}

/**
 * 重新生成，返回 abort 函数
 */
export function regenerate(sessionId, afterMessageId, callbacks) {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ afterMessageId }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        callbacks.onError?.(err.error || `HTTP ${res.status}`);
        return;
      }
      await parseSSEStream(res, callbacks);
    } catch (err) {
      if (err.name !== 'AbortError') {
        callbacks.onError?.(err.message);
      }
    } finally {
      callbacks.onStreamEnd?.();
    }
  })();

  return () => controller.abort();
}

/**
 * 编辑消息并重新生成，返回 abort 函数
 */
export function editAndRegenerate(sessionId, messageId, newContent, callbacks) {
  const controller = new AbortController();

  (async () => {
    try {
      const updated = await editMessage(messageId, newContent);
      const res = await fetch(`/api/sessions/${sessionId}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ afterMessageId: updated.id }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        callbacks.onError?.(err.error || `HTTP ${res.status}`);
        return;
      }
      await parseSSEStream(res, callbacks);
    } catch (err) {
      if (err.name !== 'AbortError') {
        callbacks.onError?.(err.message);
      }
    } finally {
      callbacks.onStreamEnd?.();
    }
  })();

  return () => controller.abort();
}

/**
 * 续写：流式追加到最后一条 assistant 消息，返回 abort 函数
 */
export function continueGeneration(sessionId, callbacks) {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/continue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        callbacks.onError?.(err.error || `HTTP ${res.status}`);
        return;
      }
      await parseSSEStream(res, callbacks);
    } catch (err) {
      if (err.name !== 'AbortError') {
        callbacks.onError?.(err.message);
      }
    } finally {
      callbacks.onStreamEnd?.();
    }
  })();

  return () => controller.abort();
}

/**
 * 代入：AI 代拟用户消息，返回 { content }
 */
export async function impersonate(sessionId) {
  const res = await fetch(`/api/sessions/${sessionId}/impersonate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * 清空会话消息，返回 { success, firstMessage }
 */
export async function clearMessages(sessionId) {
  const res = await fetch(`/api/sessions/${sessionId}/messages`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * 编辑 AI 消息内容并触发摘要重新生成（不重新生成 AI 回复）
 */
export async function editAssistantMessage(sessionId, messageId, content) {
  const res = await fetch(`/api/sessions/${sessionId}/edit-assistant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId, content }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * 用最近一轮完整上下文重新生成并覆盖会话标题
 */
export async function retitle(sessionId) {
  const res = await fetch(`/api/sessions/${sessionId}/retitle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * 手动触发摘要生成
 */
export async function triggerSummary(sessionId) {
  const res = await fetch(`/api/sessions/${sessionId}/summary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}
