// assistant/server/task-store.js
//
// 写卡助手任务存储（重构后的单代理模型）。
// 一个 task 对应父代理一次会话；状态机详见 spec §3。
// SSE 客户端按 taskId 注册，emit() 群发事件给所有订阅者。
//
// 注意：旧 API（updateTask / appendTaskEvent / clearExpiredTasks）已被删除；
// 仅 routes.js 仍引用旧 API，将在 Phase 7 一并清理。
import { randomUUID } from 'node:crypto';
import { createLogger, formatMeta } from '../../backend/utils/logger.js';
import { writeTaskFile, deleteTaskFile, readAllTasks } from './state-store.js';

const log = createLogger('as-store', 'magenta');

const tasks = new Map();
const sseClients = new Map(); // taskId -> Set<res>

function persist(task) {
  if (!task) return;
  try {
    writeTaskFile(task.id, {
      version: 1,
      id: task.id,
      status: task.status,
      context: task.context,
      messages: task.messages,
      pendingUserMessages: task.pendingUserMessages,
      createdAt: task.createdAt,
      currentStepId: task.currentStepId,
      error: task.error,
    });
  } catch (err) {
    log.warn(`PERSIST_FAIL  ${formatMeta({ taskId: task.id, error: err.message })}`);
  }
}

export function createTask({ context } = {}) {
  const id = `task-${randomUUID().slice(0, 8)}`;
  const task = {
    id,
    status: 'planning',
    context: context ?? {},
    messages: [],
    pendingUserMessages: [],
    createdAt: Date.now(),
    currentStepId: null,
  };
  tasks.set(id, task);
  persist(task);
  log.info(`CREATE  ${formatMeta({ taskId: id, hasWorld: Boolean(context?.worldId), hasChar: Boolean(context?.characterId) })}`);
  return task;
}

export function getTask(id) {
  return tasks.get(id) ?? null;
}

export function setStatus(id, status) {
  const t = tasks.get(id);
  if (!t) return;
  const prev = t.status;
  if (prev === status) return;
  t.status = status;
  persist(t);
  log.info(`STATUS  ${formatMeta({ taskId: id, from: prev, to: status })}`);
}

export function deleteTask(id) {
  tasks.delete(id);
  sseClients.delete(id);
  try { deleteTaskFile(id); } catch (err) {
    log.warn(`DELETE_FILE_FAIL  ${formatMeta({ taskId: id, error: err.message })}`);
  }
}

export function appendMessage(id, msg) {
  const t = tasks.get(id);
  if (!t) return null;
  const stamped = { id: msg?.id ?? `msg-${randomUUID().slice(0, 8)}`, ...msg };
  t.messages.push(stamped);
  persist(t);
  return stamped;
}

export function deleteMessage(taskId, messageId) {
  const t = tasks.get(taskId);
  if (!t) return false;
  const idx = t.messages.findIndex((m) => m.id === messageId);
  if (idx < 0) return false;
  t.messages.splice(idx, 1);
  persist(t);
  return true;
}

export function truncateFrom(taskId, messageId) {
  const t = tasks.get(taskId);
  if (!t) return -1;
  const idx = t.messages.findIndex((m) => m.id === messageId);
  if (idx < 0) return -1;
  const dropped = t.messages.splice(idx);
  persist(t);
  return dropped.length;
}

export function queueUserMessage(id, msg) {
  const t = tasks.get(id);
  if (t) {
    t.pendingUserMessages.push(msg);
    persist(t);
  }
}

export function takeUserMessages(id) {
  const t = tasks.get(id);
  if (!t) return [];
  const msgs = t.pendingUserMessages;
  t.pendingUserMessages = [];
  persist(t);
  return msgs;
}

export function attachSse(taskId, res) {
  if (!sseClients.has(taskId)) sseClients.set(taskId, new Set());
  sseClients.get(taskId).add(res);
  log.debug(`ATTACH  ${formatMeta({ taskId, subscribers: sseClients.get(taskId).size })}`);
}

export function detachSse(taskId, res) {
  sseClients.get(taskId)?.delete(res);
  log.debug(`DETACH  ${formatMeta({ taskId, remaining: sseClients.get(taskId)?.size ?? 0 })}`);
}

export function endAllSse(taskId) {
  const clients = sseClients.get(taskId);
  if (!clients || clients.size === 0) return;
  log.debug(`END_ALL_SSE  ${formatMeta({ taskId, count: clients.size })}`);
  for (const res of clients) {
    try {
      if (!res.writableEnded) res.end();
    } catch { /* ignore */ }
  }
  clients.clear();
}

export function emit(taskId, event) {
  const clients = sseClients.get(taskId);
  const subscribers = clients?.size ?? 0;
  log.debug(`EMIT  ${formatMeta({ taskId, type: event.type, subscribers })}`);
  if (!clients) return;
  const line = `data: ${JSON.stringify(event)}\n\n`;
  let dropped = 0;
  for (const res of clients) {
    try {
      res.write(line);
    } catch (err) {
      dropped += 1;
      log.warn(`EMIT_DROP  ${formatMeta({ taskId, type: event.type, error: err.message })}`);
    }
  }
  if (dropped > 0) log.warn(`EMIT_PARTIAL  ${formatMeta({ taskId, type: event.type, dropped, ofTotal: subscribers })}`);
}

// ─── 启动时同步 hydrate ──────────────────────────────────────────────
// 把磁盘上的 JSON 反序列化回内存 Map;非终态任务统一转 failed,
// 因为父代理循环已随上次进程一起死了,继续标 executing 会让前端永远等。
const TERMINAL = new Set(['completed', 'failed', 'cancelled']);
function hydrate() {
  let raw;
  try {
    raw = readAllTasks();
  } catch (err) {
    log.warn(`HYDRATE_SCAN_FAIL  ${formatMeta({ error: err.message })}`);
    return;
  }
  let restored = 0;
  let orphaned = 0;
  for (const data of raw) {
    if (!data || typeof data.id !== 'string') continue;
    const task = {
      id: data.id,
      status: data.status,
      context: data.context ?? {},
      messages: Array.isArray(data.messages) ? data.messages : [],
      pendingUserMessages: Array.isArray(data.pendingUserMessages) ? data.pendingUserMessages : [],
      createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
      currentStepId: data.currentStepId ?? null,
    };
    if (typeof data.error === 'string') task.error = data.error;
    if (!TERMINAL.has(task.status)) {
      task.status = 'failed';
      task.error = 'interrupted by restart';
      orphaned += 1;
      // 同步写回,避免下次再被识为非终态
      persist(task);
    }
    tasks.set(task.id, task);
    restored += 1;
  }
  if (restored > 0) log.info(`HYDRATE  ${formatMeta({ restored, orphaned })}`);
}

hydrate();

export const __testables = { tasks, sseClients };
