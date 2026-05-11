/**
 * 示例：监听异步任务队列事件（用于可观测性、统计、调试）
 *
 * 可用事件：
 *   queue:task:start — 任务开始执行（payload: { sessionId, label, priority }）
 *   queue:task:done  — 任务成功完成（payload: { sessionId, label, priority, ms }）
 *   queue:task:fail  — 任务执行失败（payload: { sessionId, label, priority, error }）
 *
 * 内置任务 label：title / all-state / turn-record / diary / session-title / chapter-title
 */

export default function register({ registerHook }) {
  registerHook('queue:task:done', async ({ sessionId, label, priority, ms }) => {
    console.log(`[my-hook] task done  session=${sessionId.slice(0, 8)} [${label}] p=${priority} ${ms}ms`);
  }, { label: 'example-task-done' });

  registerHook('queue:task:fail', async ({ sessionId, label, error }) => {
    console.warn(`[my-hook] task failed  session=${sessionId.slice(0, 8)} [${label}] error=${error}`);
  }, { label: 'example-task-fail' });
}
