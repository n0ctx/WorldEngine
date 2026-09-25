import { editMessage } from './sessions.js';
import { recoverStream, streamPost, subscribeStream } from './sse-post.js';

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
  const res = await fetch(`/api/sessions/${sessionId}/stop`, { method: 'POST' });
  try { return await res.json(); } catch { return {}; }
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
  return streamPost(
    `/api/sessions/${sessionId}/regenerate`,
    async () => ({ afterMessageId: (await editMessage(messageId, newContent)).id }),
    callbacks
  );
}

/**
 * 续写：流式追加到最后一条 assistant 消息，返回 abort 函数
 */
export function continueGeneration(sessionId, callbacks) {
  return streamPost(`/api/sessions/${sessionId}/continue`, undefined, callbacks);
}

export async function recoverChatStream(sessionId) {
  return recoverStream(`/api/sessions/${sessionId}/recover-stream`);
}

export function subscribeChatStream(sessionId, callbacks) {
  return subscribeStream(`/api/sessions/${sessionId}/stream`, callbacks);
}

/**
 * 代入：AI 代拟用户消息，返回 { content }
 */
export function impersonate(sessionId) {
  return postSessionAction(sessionId, 'impersonate');
}

/**
 * 编辑 AI 消息内容并触发摘要重新生成（不重新生成 AI 回复）
 */
export function editAssistantMessage(sessionId, messageId, content) {
  return postSessionAction(sessionId, 'edit-assistant', { messageId, content });
}

/**
 * 用最近一轮完整上下文重新生成并覆盖会话标题
 */
export function retitle(sessionId) {
  return postSessionAction(sessionId, 'retitle');
}

async function postSessionAction(sessionId, action, body) {
  const res = await fetch(`/api/sessions/${sessionId}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}
