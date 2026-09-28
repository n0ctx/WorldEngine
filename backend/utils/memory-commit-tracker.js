/**
 * memory-commit-tracker.js
 *
 * 跟踪每个 session 正在进行中的「记忆提交」Promise（turn-record 任务：
 * 中期摘要 + 状态/表格快照 + 建行）。
 * 下一轮 chat/writing 请求在组装 prompt 前调用 awaitMemoryCommit，
 * 确保读到本轮写入的最新中期摘要、状态与表格快照，避免 stale-state 导致上下文偏差。
 */

// sessionId → Promise<void>（resolve 表示提交完成或失败后已静默处理）
const pending = new Map();

/**
 * 注册一个记忆提交 Promise。
 * 完成（无论成功/失败）后自动从 Map 删除。
 */
export function trackMemoryCommit(sessionId, promise) {
  pending.set(sessionId, promise);
  promise.finally(() => {
    if (pending.get(sessionId) === promise) {
      pending.delete(sessionId);
    }
  });
}

/**
 * 等待该 session 当前正在进行的记忆提交完成。
 * 若无挂起提交则立即返回。
 */
export async function awaitMemoryCommit(sessionId) {
  const p = pending.get(sessionId);
  if (p) await p;
}
