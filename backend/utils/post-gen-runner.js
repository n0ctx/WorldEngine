import { enqueue } from './async-queue.js';
import { trackStateUpdate } from './state-update-tracker.js';
import { createLogger, formatMeta } from './logger.js';

const log = createLogger('post-gen');

/**
 * 流式生成结束后，统一入队后台异步任务并管理 SSE 连接生命周期。
 *
 * @param {string} sessionId
 * @param {Array<TaskSpec>} taskSpecs  — 任务描述列表，按声明顺序入队
 * @param {object} ctx
 * @param {object} ctx.res             — Express Response，用于推送 SSE 和关闭连接
 * @param {object} ctx.streamState     — beginStreamSession 返回的 streamState 对象
 * @param {string} ctx.sid             — sessionId 短前缀（8 字符），用于日志
 * @param {function} ctx.emitSse       — (payload) => void，推送单条 SSE 事件
 *
 * @typedef {object} TaskSpec
 * @property {string}               label         — 日志/队列标签
 * @property {number}               priority      — 队列优先级（数字越小越优先）
 * @property {() => Promise<any>}   fn            — 任务函数
 * @property {boolean}              [condition]   — false 时跳过，默认 true
 * @property {string}               [sseEvent]    — 完成后推送的 SSE event type（不设则不推）
 * @property {(result: any) => object} [ssePayload] — SSE payload 构造器（默认使用 { type: sseEvent }）
 * @property {boolean}              [keepSseAlive] — 是否将此任务加入 ssePromises 控制连接关闭时机
 * @property {boolean}              [tracksState]  — 是否调用 trackStateUpdate（state 任务专用）
 *
 * @returns {{ hasSseWaits: boolean }}
 *   hasSseWaits=true 时调用方应立即 return（连接由 Promise.allSettled 关闭）
 */
export function runPostGenTasks(sessionId, taskSpecs, { res, streamState, sid, emitSse }) {
  const ssePromises = [];

  for (const spec of taskSpecs) {
    // condition 默认 true；显式传 false 时跳过
    if (spec.condition === false) continue;

    log.info(`QUEUE ${spec.label.toUpperCase()}  ${formatMeta({ session: sid, priority: spec.priority })}`);

    const rawPromise = enqueue(sessionId, spec.fn, spec.priority, spec.label);

    // state 任务：记录 Promise，供下一轮 buildContext/buildWritingPrompt 前 await
    if (spec.tracksState) {
      trackStateUpdate(sessionId, rawPromise.catch(() => {}));
    }

    if (spec.keepSseAlive) {
      const ssePromise = rawPromise
        .then((result) => {
          if (spec.sseEvent && !streamState.isClientClosed()) {
            const payload = spec.ssePayload
              ? spec.ssePayload(result)
              : { type: spec.sseEvent };
            // ssePayload 返回 null/undefined 时跳过（用于 title 为空时不推送）
            if (payload) emitSse(payload);
          }
        })
        .catch((err) => log.warn(`后台任务失败 [${spec.label}]:`, err.message));
      ssePromises.push(ssePromise);
    } else {
      rawPromise.catch((err) => log.warn(`后台任务失败 [${spec.label}]:`, err.message));
    }
  }

  if (ssePromises.length > 0) {
    Promise.allSettled(ssePromises).finally(() => {
      if (!streamState.isClientClosed()) res.end();
    });
    return { hasSseWaits: true };
  }

  return { hasSseWaits: false };
}
