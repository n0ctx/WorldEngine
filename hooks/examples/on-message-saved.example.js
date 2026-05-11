/**
 * 示例：监听消息生命周期事件
 *
 * 可用事件：
 *   message:user:before    — 用户消息保存前（payload: { sessionId, content, attachments }）
 *   message:user:saved     — 用户消息保存后（payload: { message, sessionId }）
 *   message:assistant:saved — AI 消息保存后（payload: { message, sessionId, aborted }）
 *   message:deleted        — 消息删除后（payload: { id, sessionId }）
 *   message:edited         — 消息内容更新后（payload: { id, sessionId, content }）
 */

export default function register({ registerHook }) {
  registerHook('message:user:before', async ({ sessionId, content }) => {
    console.log(`[my-hook] user message incoming  session=${sessionId.slice(0, 8)} len=${content.length}`);
  }, { label: 'example-user-before' });

  registerHook('message:assistant:saved', async ({ message, sessionId, aborted }) => {
    if (aborted) return;
    console.log(`[my-hook] assistant message saved  session=${sessionId.slice(0, 8)} id=${message?.id?.slice(0, 8)}`);
  }, { label: 'example-assistant-saved' });

  registerHook('message:deleted', async ({ id, sessionId }) => {
    console.log(`[my-hook] message deleted  session=${sessionId.slice(0, 8)} id=${id.slice(0, 8)}`);
  }, { label: 'example-message-deleted' });
}
