import { randomUUID } from 'node:crypto';

import {
  getSessionStreamTask,
  listSessionStreamTasks,
  updateSessionStreamProgress,
  upsertSessionStreamTask,
} from '../db/queries/session-stream-tasks.js';
import { createLogger, formatMeta } from '../utils/logger.js';
import { RESTART_INTERRUPTED_ERROR } from '../../shared/runtime-constants.mjs';

export { RESTART_INTERRUPTED_ERROR };

const log = createLogger('stream-task', 'cyan');

const tasks = new Map();
const sseClients = new Map();

export const ACTIVE_STREAM_TASK_STATUSES = new Set(['streaming', 'postprocessing']);
export const TERMINAL_STREAM_TASK_STATUSES = new Set(['completed', 'failed', 'cancelled']);

function cloneTask(task) {
  return {
    id: task.id,
    gen: typeof task.gen === 'number' ? task.gen : 0,
    sessionId: task.sessionId,
    mode: task.mode,
    status: task.status,
    messages: Array.isArray(task.messages) ? task.messages : [],
    streamingText: typeof task.streamingText === 'string' ? task.streamingText : '',
    continuingMessageId: task.continuingMessageId ?? null,
    continuingText: typeof task.continuingText === 'string' ? task.continuingText : '',
    options: Array.isArray(task.options) ? task.options : [],
    activatedEntries: Array.isArray(task.activatedEntries) ? task.activatedEntries : [],
    error: typeof task.error === 'string' ? task.error : undefined,
    createdAt: typeof task.createdAt === 'number' ? task.createdAt : Date.now(),
    updatedAt: typeof task.updatedAt === 'number' ? task.updatedAt : Date.now(),
  };
}

function persist(task) {
  if (!task) return;
  upsertSessionStreamTask(cloneTask(task));
}

function touch(task) {
  task.updatedAt = Date.now();
}

function writeSse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function hydrateSessionStreamTasks() {
  const rows = listSessionStreamTasks();
  let restored = 0;
  let interrupted = 0;
  for (const row of rows) {
    const task = cloneTask(row);
    if (ACTIVE_STREAM_TASK_STATUSES.has(task.status)) {
      task.status = 'failed';
      task.error = RESTART_INTERRUPTED_ERROR;
      touch(task);
      persist(task);
      interrupted += 1;
    }
    tasks.set(task.sessionId, task);
    restored += 1;
  }
  if (restored > 0) {
    log.info(`HYDRATE  ${formatMeta({ restored, interrupted })}`);
  }
}

export function buildSessionStreamSnapshot(task) {
  if (!task) return null;
  return cloneTask(task);
}

export function getSessionStreamTaskSnapshot(sessionId) {
  const inMemory = tasks.get(sessionId);
  if (inMemory) return buildSessionStreamSnapshot(inMemory);
  const fromDb = getSessionStreamTask(sessionId);
  return fromDb ? buildSessionStreamSnapshot(fromDb) : null;
}

export function getRecoverableSessionStreamTask(sessionId) {
  const task = getSessionStreamTaskSnapshot(sessionId);
  if (!task) return null;
  if (ACTIVE_STREAM_TASK_STATUSES.has(task.status)) return task;
  if (task.status === 'failed' && task.error === RESTART_INTERRUPTED_ERROR) return task;
  return null;
}

function isNonTerminalStatus(status) {
  return !TERMINAL_STREAM_TASK_STATUSES.has(status);
}

// 并发创建同 sessionId 任务时，旧的非终态任务被新 gen 取代（supersede），
// 仅记录可观测性日志，不在此处触碰 SSE。
//
// 关键：SSE 客户端的收尾（emit `aborted` → end response）由 chat.js 的
// runStreamLifecycle single-flight 独占（新流 abort 旧 controller，旧 lifecycle
// 负责写出中断事件并结束自己的响应）。store 若在这里抢先 closeSessionStreamSse，
// 会在旧 lifecycle 写出 `aborted` 之前强行 end 响应，与中断契约抢跑并导致客户端挂死。
// 旧 DB 行随后被新任务的 upsert（session_id 唯一键）原子替换，不会再被恢复链路命中，
// 因此 store 无需、也不应主动断开旧 SSE。
function supersedePriorTask(sessionId, nextGen) {
  const prior = tasks.get(sessionId) ?? getSessionStreamTask(sessionId);
  if (prior && isNonTerminalStatus(prior.status)) {
    log.info(
      `SUPERSEDE ${formatMeta({
        session: sessionId.slice(0, 8),
        priorId: prior.id,
        priorStatus: prior.status,
        gen: nextGen,
      })}`,
    );
  }
}

export function createSessionStreamTask({
  sessionId,
  mode,
  messages,
  continuingMessageId = null,
}) {
  const now = Date.now();
  const priorGen = tasks.get(sessionId)?.gen ?? getSessionStreamTask(sessionId)?.gen ?? 0;
  const gen = priorGen + 1;
  supersedePriorTask(sessionId, gen);
  const task = {
    id: `stream-${randomUUID().slice(0, 8)}`,
    gen,
    sessionId,
    mode,
    status: 'streaming',
    messages: Array.isArray(messages) ? messages : [],
    streamingText: '',
    continuingMessageId,
    continuingText: '',
    options: [],
    activatedEntries: [],
    createdAt: now,
    updatedAt: now,
  };
  // 先持久化成功，再提交到内存（persist-then-commit / CAS 风格）：
  // upsert 以 session_id 为唯一键，会原子地用新任务行替换旧任务行；
  // 若持久化抛错，则保留旧内存指针不变，避免内存与 DB 分裂。
  persist(task);
  tasks.set(sessionId, task);
  return task;
}

export function setSessionStreamTaskStatus(sessionId, status, { error } = {}) {
  const task = tasks.get(sessionId);
  if (!task) return null;
  // 持久化失败时不能让内存与 DB 分裂：先快照旧字段，persist 抛错则回滚内存。
  const prev = { status: task.status, error: task.error, updatedAt: task.updatedAt };
  task.status = status;
  if (error === undefined) {
    // keep
  } else if (error == null) {
    delete task.error;
  } else {
    task.error = String(error);
  }
  touch(task);
  try {
    persist(task);
  } catch (err) {
    task.status = prev.status;
    if (prev.error === undefined) delete task.error;
    else task.error = prev.error;
    task.updatedAt = prev.updatedAt;
    throw err;
  }
  return task;
}

export function attachSessionStreamSse(sessionId, taskId, res) {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders?.();
  let set = sseClients.get(sessionId);
  if (!set) {
    set = new Set();
    sseClients.set(sessionId, set);
  }
  const entry = { res, taskId: taskId ?? null };
  set.add(entry);
  res.on('close', () => {
    set.delete(entry);
    if (set.size === 0) sseClients.delete(sessionId);
  });
}

export function writeSessionStreamSse(res, payload) {
  writeSse(res, payload);
}

export function closeSessionStreamSse(sessionId, taskId) {
  const set = sseClients.get(sessionId);
  if (!set) return;
  for (const entry of [...set]) {
    if (taskId && entry.taskId !== taskId) continue;
    try {
      if (!entry.res.writableEnded) entry.res.end();
    } catch {
      // ignore
    }
    set.delete(entry);
  }
  if (set.size === 0) sseClients.delete(sessionId);
}

function applyAssistantToMessages(task, assistant) {
  if (!assistant) return;
  if (task.continuingMessageId) {
    task.messages = task.messages.map((msg) =>
      msg.id === task.continuingMessageId ? { ...msg, ...assistant } : msg,
    );
    return;
  }
  task.messages = [...task.messages, assistant];
}

function applyEvent(task, payload) {
  if (!task || !payload) return;
  if (payload.delta !== undefined) {
    if (task.continuingMessageId) {
      task.continuingText += payload.delta;
    } else {
      task.streamingText += payload.delta;
    }
    task.updatedAt = Date.now();
    updateSessionStreamProgress(task.sessionId, {
      streamingText: task.streamingText,
      continuingText: task.continuingText,
      updatedAt: task.updatedAt,
    });
    return;
  }
  let changed = false;
  switch (payload.type) {
    case 'entries_activated':
      task.activatedEntries = Array.isArray(payload.entries) ? payload.entries : [];
      changed = true;
      break;
    case 'error':
      task.status = 'failed';
      task.error = payload.error || 'stream failed';
      changed = true;
      break;
    default:
      break;
  }
  if (payload.done === true) {
    task.status = 'postprocessing';
    task.streamingText = '';
    task.continuingText = '';
    task.options = Array.isArray(payload.options) ? payload.options : [];
    applyAssistantToMessages(task, payload.assistant ?? null);
    task.continuingMessageId = null;
    delete task.error;
    changed = true;
  } else if (payload.aborted === true) {
    task.status = 'cancelled';
    task.streamingText = '';
    task.continuingText = '';
    task.options = [];
    applyAssistantToMessages(task, payload.assistant ?? null);
    task.continuingMessageId = null;
    changed = true;
  }
  if (!changed) return;
  touch(task);
  persist(task);
}

export function emitSessionStreamEvent(sessionId, payload, { taskId } = {}) {
  const task = tasks.get(sessionId);
  if (task && (!taskId || task.id === taskId)) {
    applyEvent(task, payload);
  }
  const set = sseClients.get(sessionId);
  if (!set) return;
  for (const entry of [...set]) {
    if (taskId && entry.taskId !== taskId) continue;
    try {
      if (!entry.res.writableEnded) writeSse(entry.res, payload);
    } catch {
      set.delete(entry);
    }
  }
}

const TERMINAL_EVICTION_DELAY_MS = 60_000;

function scheduleEviction(sessionId) {
  setTimeout(() => {
    const current = tasks.get(sessionId);
    if (current && TERMINAL_STREAM_TASK_STATUSES.has(current.status)) {
      tasks.delete(sessionId);
    }
  }, TERMINAL_EVICTION_DELAY_MS).unref?.();
}

export function completeSessionStreamTask(sessionId, taskId) {
  const task = tasks.get(sessionId);
  if (!task) return;
  if (taskId && task.id !== taskId) return;
  task.status = 'completed';
  touch(task);
  persist(task);
  scheduleEviction(sessionId);
}

export function failSessionStreamTask(sessionId, error, taskId) {
  const task = tasks.get(sessionId);
  if (!task) return;
  if (taskId && task.id !== taskId) return;
  task.status = 'failed';
  task.error = error || 'stream failed';
  touch(task);
  persist(task);
  scheduleEviction(sessionId);
}
