// 跨 provider 共用的 fetch / SSE / 错误处理 / data URL 解析等纯工具。
import { isToolLoopCancelledError } from '../../tool-loop-control.js';

/** 解析 data URL → { mimeType, data } */
export function parseDataUrl(dataUrl) {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  return m ? { mimeType: m[1], data: m[2] } : null;
}

/** 创建带状态码的错误 */
export function apiError(message, status, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

async function* iterateBodyChunks(body) {
  if (!body) return;

  if (typeof body.getReader === 'function') {
    const reader = body.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) yield value;
      }
    } finally {
      reader.releaseLock();
    }
    return;
  }

  for await (const chunk of body) {
    yield chunk;
  }
}

export async function* parseSSE(body) {
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';

  const parseLine = (line) => {
    if (line.startsWith('event:')) {
      currentEvent = line.slice(6).trim();
      return null;
    }
    if (line.startsWith('data:')) {
      const data = line.slice(5).trimStart();
      if (data === '[DONE]') return { done: true };
      return { event: currentEvent, data };
    }
    if (line === '') {
      currentEvent = '';
    }
    return null;
  };

  for await (const chunk of iterateBodyChunks(body)) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      const parsed = parseLine(line.trimEnd());
      if (parsed?.done) return;
      if (parsed) yield parsed;
    }
  }

  buffer += decoder.decode();
  if (!buffer) return;

  for (const line of buffer.split('\n')) {
    const parsed = parseLine(line.trimEnd());
    if (parsed?.done) return;
    if (parsed) yield parsed;
  }
}

/** 执行单个 tool call，返回字符串结果 */
export async function executeToolCall(tc, toolHandlers) {
  const fn = toolHandlers[tc.function?.name];
  if (!fn) return `工具未定义：${tc.function?.name}`;
  try {
    const args = JSON.parse(tc.function.arguments || '{}');
    return String(await fn(args));
  } catch (e) {
    if (isToolLoopCancelledError(e)) throw e;
    return `工具执行失败：${e.message}`;
  }
}

/** 安全解析 JSON，失败时返回 fallback（默认 {}） */
export function safeParseJson(str, fallback = {}) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

export function extractProviderError(data) {
  if (!data || typeof data !== 'object') return null;
  if (typeof data.error === 'string') return data.error;
  if (data.error?.message) return data.error.message;
  if (typeof data.message === 'string' && (data.code || data.status)) return data.message;
  return null;
}
