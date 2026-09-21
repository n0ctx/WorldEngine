import { parseSSEStream, subscribeSse } from './stream-parser.js';

/**
 * POST 请求 + SSE 流解析，返回 abort 函数。
 * body 可以是普通值，也可以是返回 body 的异步函数（用于先做一次前置请求再开流）。
 * onStreamEnd 通过 finally 保证在任何情况下都被调用（包括 HTTP 错误和非 Abort 异常）。
 */
export function streamPost(url, body, callbacks) {
  const controller = new AbortController();

  (async () => {
    try {
      const payload = typeof body === 'function' ? await body() : body;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
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
 * 订阅正在进行中的流（断线续流），返回 abort 函数
 */
export function subscribeStream(url, callbacks) {
  const controller = new AbortController();
  (async () => {
    try {
      await subscribeSse(url, callbacks, controller.signal);
    } catch (err) {
      if (err.name !== 'AbortError') callbacks.onError?.(err.message);
    } finally {
      callbacks.onStreamEnd?.();
    }
  })();
  return () => controller.abort();
}

/**
 * 查询会话是否有未完成的生成任务，没有则返回 null
 */
export async function recoverStream(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.task || null;
}
