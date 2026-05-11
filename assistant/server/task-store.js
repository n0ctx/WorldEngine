// assistant/server/task-store.js
//
// 写卡助手任务存储（SQLite 持久化 + 运行期内存缓存）。
// SSE 客户端只保存在内存中；任务态持久化到 assistant_tasks 表，
// 启动时会先从旧 JSON sidecar 导入，再从 DB hydrate。

import { randomUUID } from 'node:crypto';

import { createLogger, formatMeta } from '../../backend/utils/logger.js';
import {
  deleteAssistantTask,
  listAssistantTasks,
  upsertAssistantTask,
} from '../../backend/db/queries/assistant-tasks.js';

import { deleteTaskFile, readAllTasks } from './state-store.js';

const log = createLogger('as-store', 'magenta');

const tasks = new Map();
const sseClients = new Map(); // taskId -> Set<res>

export const TERMINAL_TASK_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const RESUMABLE_TASK_STATUSES = new Set(['awaiting_approval', 'paused']);

function cloneTaskForPersist(task) {
  return {
    id: task.id,
    status: task.status,
    context: task.context ?? {},
    messages: Array.isArray(task.messages) ? task.messages : [],
    pendingUserMessages: Array.isArray(task.pendingUserMessages) ? task.pendingUserMessages : [],
    modelContext: task.modelContext ?? null,
    createdAt: typeof task.createdAt === 'number' ? task.createdAt : Date.now(),
    currentStepId: task.currentStepId ?? null,
    error: typeof task.error === 'string' ? task.error : undefined,
    updatedAt: typeof task.updatedAt === 'number' ? task.updatedAt : Date.now(),
  };
}

function persist(task) {
  if (!task) return;
  try {
    upsertAssistantTask(cloneTaskForPersist(task));
  } catch (err) {
    log.warn(`PERSIST_FAIL  ${formatMeta({ taskId: task.id, error: err.message })}`);
  }
}

function touch(task) {
  if (!task) return;
  task.updatedAt = Date.now();
}

function hydrateTask(data) {
  if (!data || typeof data.id !== 'string') return null;
  const task = {
    id: data.id,
    status: data.status,
    context: data.context ?? {},
    messages: Array.isArray(data.messages) ? data.messages : [],
    pendingUserMessages: Array.isArray(data.pendingUserMessages) ? data.pendingUserMessages : [],
    modelContext: data.modelContext ?? null,
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
    currentStepId: data.currentStepId ?? null,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : (typeof data.createdAt === 'number' ? data.createdAt : Date.now()),
  };
  if (typeof data.error === 'string') task.error = data.error;
  return task;
}

function importLegacySidecars() {
  let rows;
  try {
    rows = readAllTasks();
  } catch (err) {
    log.warn(`IMPORT_LEGACY_SCAN_FAIL  ${formatMeta({ error: err.message })}`);
    return;
  }
  let imported = 0;
  for (const row of rows) {
    const task = hydrateTask({
      ...row,
      modelContext: row.modelContext ?? null,
      updatedAt: row.updatedAt ?? row.createdAt,
    });
    if (!task) continue;
    try {
      upsertAssistantTask(task);
      imported += 1;
      try { deleteTaskFile(task.id); } catch { /* ignore */ }
    } catch (err) {
      log.warn(`IMPORT_LEGACY_FAIL  ${formatMeta({ taskId: task.id, error: err.message })}`);
    }
  }
  if (imported > 0) log.info(`IMPORT_LEGACY  ${formatMeta({ imported })}`);
}

function hydrate() {
  importLegacySidecars();
  let rows;
  try {
    rows = listAssistantTasks();
  } catch (err) {
    log.warn(`HYDRATE_SCAN_FAIL  ${formatMeta({ error: err.message })}`);
    return;
  }
  let restored = 0;
  let orphaned = 0;
  for (const row of rows) {
    const task = hydrateTask(row);
    if (!task) continue;
    if (!TERMINAL_TASK_STATUSES.has(task.status) && !RESUMABLE_TASK_STATUSES.has(task.status)) {
      task.status = 'failed';
      task.error = 'interrupted by restart';
      touch(task);
      persist(task);
      orphaned += 1;
    }
    tasks.set(task.id, task);
    restored += 1;
  }
  if (restored > 0) log.info(`HYDRATE  ${formatMeta({ restored, orphaned })}`);
}

export function createTask({ context } = {}) {
  const id = `task-${randomUUID().slice(0, 8)}`;
  const now = Date.now();
  const task = {
    id,
    status: 'planning',
    context: context ?? {},
    messages: [],
    pendingUserMessages: [],
    modelContext: null,
    createdAt: now,
    currentStepId: null,
    updatedAt: now,
  };
  tasks.set(id, task);
  persist(task);
  log.info(`CREATE  ${formatMeta({ taskId: id, hasWorld: Boolean(context?.worldId), hasChar: Boolean(context?.characterId) })}`);
  return task;
}

export function getTask(id) {
  return tasks.get(id) ?? null;
}

export function setStatus(id, status, { error } = {}) {
  const t = tasks.get(id);
  if (!t) return;
  const errorChanged = error !== undefined && t.error !== (error == null ? undefined : String(error));
  if (t.status === status && !errorChanged) return;
  const prev = t.status;
  t.status = status;
  if (error !== undefined) {
    if (error == null) delete t.error;
    else t.error = String(error);
  }
  touch(t);
  persist(t);
  log.info(`STATUS  ${formatMeta({ taskId: id, from: prev, to: status })}`);
}

export function setCurrentStep(id, stepId) {
  const t = tasks.get(id);
  if (!t) return;
  if (t.currentStepId === stepId) return;
  t.currentStepId = stepId ?? null;
  touch(t);
  persist(t);
}

export function setModelContext(id, modelContext) {
  const t = tasks.get(id);
  if (!t) return;
  const next = modelContext ?? null;
  if (JSON.stringify(t.modelContext ?? null) === JSON.stringify(next)) return;
  t.modelContext = next;
  touch(t);
  persist(t);
}

export function deleteTask(id) {
  tasks.delete(id);
  sseClients.delete(id);
  try {
    deleteAssistantTask(id);
  } catch (err) {
    log.warn(`DELETE_DB_FAIL  ${formatMeta({ taskId: id, error: err.message })}`);
  }
  try {
    deleteTaskFile(id);
  } catch (err) {
    log.warn(`DELETE_FILE_FAIL  ${formatMeta({ taskId: id, error: err.message })}`);
  }
}

export function appendMessage(id, msg) {
  const t = tasks.get(id);
  if (!t) return null;
  const stamped = { id: msg?.id ?? `msg-${randomUUID().slice(0, 8)}`, ...msg };
  t.messages.push(stamped);
  touch(t);
  persist(t);
  return stamped;
}

export function updateMessageContent(taskId, messageId, content) {
  const t = tasks.get(taskId);
  if (!t) return false;
  const msg = t.messages.find((m) => m.id === messageId);
  if (!msg) return false;
  msg.content = content;
  touch(t);
  persist(t);
  return true;
}

export function deleteMessage(taskId, messageId) {
  const t = tasks.get(taskId);
  if (!t) return false;
  const idx = t.messages.findIndex((m) => m.id === messageId);
  if (idx < 0) return false;
  t.messages.splice(idx, 1);
  touch(t);
  persist(t);
  return true;
}

export function truncateFrom(taskId, messageId) {
  const t = tasks.get(taskId);
  if (!t) return -1;
  const idx = t.messages.findIndex((m) => m.id === messageId);
  if (idx < 0) return -1;
  const dropped = t.messages.splice(idx);
  touch(t);
  persist(t);
  return dropped.length;
}

export function queueUserMessage(id, msg) {
  const t = tasks.get(id);
  if (!t) return;
  t.pendingUserMessages.push(msg);
  touch(t);
  persist(t);
}

export function takeUserMessages(id) {
  const t = tasks.get(id);
  if (!t) return [];
  const msgs = t.pendingUserMessages;
  t.pendingUserMessages = [];
  touch(t);
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

hydrate();

export const __testables = { tasks, sseClients };
