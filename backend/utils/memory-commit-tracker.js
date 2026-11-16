/**
 * memory-commit-tracker.js
 *
 * 跟踪每个 session 正在进行中的「记忆提交」Promise（turn-record：状态/表格快照 + 建行；
 * context-compress：剧情摘要块的压缩与修复）。
 * 下一轮 chat/writing 请求在组装 prompt 前调用 awaitMemoryCommit，
 * 确保读到本轮写入的最新剧情摘要块、状态与表格快照，避免 stale-state 导致上下文偏差。
 * 同一轮登记多个提交时合并等待，不依赖队列的执行顺序。
 */

// sessionId → Promise<void>（resolve 表示提交完成或失败后已静默处理）
const pending = new Map();

/**
 * 注册一个记忆提交 Promise。
 * 完成（无论成功/失败）后自动从 Map 删除。
 */
export function trackMemoryCommit(sessionId, promise) {
  const previous = pending.get(sessionId);
  const combined = previous ? Promise.all([previous, promise]).then(() => {}) : promise;
  pending.set(sessionId, combined);
  combined.finally(() => {
    if (pending.get(sessionId) === combined) {
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
