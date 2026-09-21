import { createHttpError } from '../shared/http-error.js';
import { ALL_MESSAGES_LIMIT } from '../../utils/constants.js';
import { formatMeta } from '../../utils/logger.js';
import {
  closeSessionStreamSse,
  failSessionStreamTask,
} from '../../services/session-stream-task-store.js';

/** 本轮用户输入；调用方未显式传入时用于补选项的上下文 */
export function getLastUserContent(mode, sessionId) {
  const messages = mode.session.getMessages(sessionId, ALL_MESSAGES_LIMIT, 0);
  return [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';
}

/**
 * 续写的起点：最后一条 assistant，以及它之前最近的一条 user。
 * 不满足续写前提时抛 400，由路由层统一转成响应。
 */
export function resolveContinuationBase(mode, sessionId) {
  const messages = mode.session.getMessages(sessionId, ALL_MESSAGES_LIMIT, 0);
  const lastAssistantIndex = messages.map((message) => message.role).lastIndexOf('assistant');
  const lastAssistant = lastAssistantIndex >= 0 ? messages[lastAssistantIndex] : null;
  if (!lastAssistant) {
    throw createHttpError(400, '当前会话没有 AI 回复可续写');
  }

  const hasUserBeforeAssistant = messages
    .slice(0, lastAssistantIndex)
    .some((message) => message.role === 'user');
  if (!hasUserBeforeAssistant) {
    throw createHttpError(400, '当前会话没有可续写的用户-助手轮次');
  }

  const lastUser = [...messages.slice(0, lastAssistantIndex)]
    .reverse()
    .find((message) => message.role === 'user');

  return { messages, lastAssistant, lastUser };
}

/**
 * 流式异常处理：已产出内容时继续走收尾（保留半截回复），
 * 一个字都没产出时直接判流失败并关闭 SSE。
 */
export function makeStreamErrorHandler({ log, label, sessionId, taskId, emitSse }) {
  return async ({ err, sid, fullContent, streamState }) => {
    log.error(`${label}  ${formatMeta({ session: sid, error: err.message })}`);
    emitSse({ type: 'error', error: err.message });
    if (!fullContent) {
      streamState.clear();
      failSessionStreamTask(sessionId, err.message, taskId);
      closeSessionStreamSse(sessionId, taskId);
      return { stopLifecycle: true };
    }
    return null;
  };
}
