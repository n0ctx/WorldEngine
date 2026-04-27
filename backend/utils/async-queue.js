import { ASYNC_QUEUE_MAX_SIZE } from './constants.js';
import { createLogger } from './logger.js';

const log = createLogger('queue');

/**
 * 按 sessionId 分组的优先级串行队列。
 * - 同一 sessionId 严格串行
 * - 不同 sessionId 互不干扰
 * - priority 数字越小越优先
 * - 队列满时丢弃同 sessionId 中优先级最低（数字最大）的任务
 */

// sessionId → { running: boolean, items: Array<{ taskFn, priority, resolve, reject }>, idleWaiters: Array<function> }
const queues = new Map();

function getQueue(sessionId) {
  if (!queues.has(sessionId)) {
    queues.set(sessionId, { running: false, items: [], idleWaiters: [] });
  }
  return queues.get(sessionId);
}

function insertSorted(items, entry) {
  // 按 priority 升序插入（数字小 = 高优先级排前面）
  let i = items.length;
  while (i > 0 && items[i - 1].priority > entry.priority) {
    i--;
  }
  items.splice(i, 0, entry);
}

async function drain(sessionId) {
  const q = queues.get(sessionId);
  if (!q || q.running) return;

  q.running = true;
  while (q.items.length > 0) {
    const entry = q.items.shift();
    const sid = sessionId.slice(0, 8);
    const tag = `session=${sid} p=${entry.priority} [${entry.label || '?'}]`;
    log.debug(`START  ${tag}`);
    const t0 = Date.now();
    try {
      const result = await entry.taskFn();
      log.debug(`DONE   ${tag} +${Date.now() - t0}ms`);
      entry.resolve(result);
    } catch (err) {
      log.debug(`FAIL   ${tag} +${Date.now() - t0}ms  err=${err.message}`);
      entry.reject(err);
    }
  }
  q.running = false;

  // 队列清空后删除 map 条目，避免内存泄漏
  if (q.items.length === 0) {
    const waiters = q.idleWaiters.splice(0);
    for (const resolve of waiters) resolve();
    queues.delete(sessionId);
  }
}

/**
 * @param {string} sessionId
 * @param {() => Promise<any>} taskFn
 * @param {number} priority — 数字越小优先级越高
 * @param {string} [label]  — 可选任务标签，用于日志
 * @returns {Promise<any>} taskFn 的返回值
 */
export function enqueue(sessionId, taskFn, priority = 5, label = '') {
  const q = getQueue(sessionId);
  const sid = sessionId.slice(0, 8);

  log.debug(`ENQUEUE  session=${sid} p=${priority} [${label || '?'}]`);

  return new Promise((resolve, reject) => {
    const entry = { taskFn, priority, label, resolve, reject };
    insertSorted(q.items, entry);

    // 超过上限时，丢弃优先级最低（数组末尾）的任务
    while (q.items.length > ASYNC_QUEUE_MAX_SIZE) {
      const dropped = q.items.pop();
      log.debug(`DROP     session=${sid} p=${dropped.priority} [${dropped.label || '?'}] queue full`);
      dropped.reject(new Error('Queue full — task dropped'));
    }

    // 如果当前没有在消费，启动 drain
    if (!q.running) {
      drain(sessionId);
    }
  });
}

/**
 * 清除指定 sessionId 中优先级 >= minPriority 且尚未开始的任务。
 * 用于编辑消息或重新生成时丢弃低优先级的待处理任务。
 */
export function clearPending(sessionId, minPriority) {
  const q = queues.get(sessionId);
  if (!q) return;

  const kept = [];
  for (const entry of q.items) {
    if (entry.priority >= minPriority) {
      entry.reject(new Error('Task cleared'));
    } else {
      kept.push(entry);
    }
  }
  q.items = kept;
}

/**
 * 等待指定 session 当前队列完全空闲。
 * 用于重新生成/编辑前，确保已入队的状态整理、turn record、日记等任务
 * 不会和即将开始的新一轮截断、回滚、生成互相覆盖。
 */
export function waitForQueueIdle(sessionId) {
  const q = queues.get(sessionId);
  if (!q || (!q.running && q.items.length === 0)) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    q.idleWaiters.push(resolve);
  });
}
