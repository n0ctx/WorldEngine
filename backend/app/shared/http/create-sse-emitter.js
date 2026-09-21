import { emitSessionStreamEvent } from '../../../services/session-stream-task-store.js';
import { formatMeta } from '../../../utils/logger.js';

/**
 * 生成一个带日志的 SSE 推送函数。字段取两种模式的并集，
 * formatMeta 会跳过 undefined，所以多出来的字段对不产生它们的事件无影响。
 */
export function createSseEmitter(log) {
  return function emitSse(sessionId, payload, { logEvent = true, taskId } = {}) {
    if (logEvent && payload?.type && payload.type !== 'delta') {
      log.info(
        `SSE ${payload.type.toUpperCase()}  ${formatMeta({
          session: sessionId.slice(0, 8),
          keys: Object.keys(payload),
          hit: payload.hit,
          candidates: Array.isArray(payload.candidates) ? payload.candidates.length : undefined,
          expanded: Array.isArray(payload.expanded) ? payload.expanded.length : undefined,
          hasAssistant: !!payload.assistant,
          title: payload.title,
          error: payload.error,
        })}`
      );
    }
    emitSessionStreamEvent(sessionId, payload, { taskId });
  };
}
