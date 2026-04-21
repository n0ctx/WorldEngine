/**
 * state-update-tracker.js
 *
 * 跟踪每个 session 正在进行中的状态更新 Promise。
 * 下一轮 chat/writing 请求在组装 prompt 前调用 awaitPendingStateUpdate，
 * 确保读到本轮 updateAllStates 写入的最新状态，避免 stale-state 导致上下文偏差。
 */

// sessionId → Promise<void>（resolve 表示更新完成或失败后已静默处理）
const pending = new Map();

/**
 * 注册一个状态更新 Promise。
 * 完成（无论成功/失败）后自动从 Map 删除。
 */
export function trackStateUpdate(sessionId, promise) {
  pending.set(sessionId, promise);
  promise.finally(() => {
    if (pending.get(sessionId) === promise) {
      pending.delete(sessionId);
    }
  });
}

/**
 * 等待该 session 当前正在进行的状态更新完成。
 * 若无挂起更新则立即返回。
 */
export async function awaitPendingStateUpdate(sessionId) {
  const p = pending.get(sessionId);
  if (p) await p;
}
