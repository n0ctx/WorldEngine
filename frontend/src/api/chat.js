import { editMessage } from './sessions.js';
import { parseSSEStream } from './stream-parser.js';

/**
 * 内部辅助：POST 请求 + SSE 流解析
 * onStreamEnd 通过 finally 保证在任何情况下都被调用（包括 HTTP 错误和非 Abort 异常）
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
 * 发送消息，返回 abort 函数
 * callbacks 额外支持 onStreamEnd()：流连接实际关闭时触发（晚于 onDone，因为 title_updated 在 done 后发送）
 */
export function sendMessage(sessionId, content, attachments, callbacks, opts = {}) {
  const body = { content, attachments: attachments?.length ? attachments : undefined };
  if (opts.diaryInjection) body.diaryInjection = opts.diaryInjection;
  return streamPost(`/api/sessions/${sessionId}/chat`, body, callbacks);
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
  return streamPost(`/api/sessions/${sessionId}/regenerate`, { afterMessageId }, callbacks);
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
  return streamPost(`/api/sessions/${sessionId}/continue`, undefined, callbacks);
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
