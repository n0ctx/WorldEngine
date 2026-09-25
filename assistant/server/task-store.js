// assistant/server/task-store.js
//
// 写卡助手任务存储（SQLite 持久化 + 运行期内存缓存）。
// SSE 客户端只保存在内存中；任务态持久化到 assistant_tasks 表，
// 启动时会先从旧 JSON sidecar 导入，再从 DB hydrate。

import { randomUUID } from 'node:crypto';

import { createLogger, formatMeta } from '../../backend/utils/logger.js';
import {
  deleteAssistantTask,
  getLatestAssistantTask,
  listAssistantTasks,
  upsertAssistantTask,
} from '../../backend/db/queries/assistant-tasks.js';

import { deleteTaskFile, readAllTasks } from './state-store.js';
import { SSE_EVENTS } from './sse-events.js';

const log = createLogger('as-store', 'magenta');

const tasks = new Map();
const sseClients = new Map(); // taskId -> Set<res>

export const TERMINAL_TASK_STATUSES = new Set(['completed', 'failed', 'cancelled']);
export const RESTART_INTERRUPTED_ERROR = 'interrupted by restart';

function cloneTaskForPersist(task) {
  return {
    id: task.id,
    status: task.status,
    context: task.context ?? {},
    messages: Array.isArray(task.messages) ? task.messages : [],
    pendingUserMessages: Array.isArray(task.pendingUserMessages) ? task.pendingUserMessages : [],
    modelContext: task.modelContext ?? null,
    createdAt: typeof task.createdAt === 'number' ? task.createdAt : Date.now(),
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

function normalizeRecoveredUiMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.map((m) => {
    if (!m || typeof m !== 'object') return m;
    if (m.role === 'tool_call' && m.status === 'running') {
      return { ...m, status: 'error', error: m.error ?? 'interrupted by restart' };
    }
    if (m.role === 'assistant' && m.streaming) {
      const { streaming, ...rest } = m;
      return rest;
    }
    return m;
  });
}

function hydrateTask(data) {
  if (!data || typeof data.id !== 'string') return null;
  const task = {
    id: data.id,
    status: data.status,
    context: data.context ?? {},
    messages: normalizeRecoveredUiMessages(data.messages),
    pendingUserMessages: Array.isArray(data.pendingUserMessages) ? data.pendingUserMessages : [],
    modelContext: data.modelContext ?? null,
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
    executionActive: false,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : (typeof data.createdAt === 'number' ? data.createdAt : Date.now()),
  };
  if (typeof data.error === 'string') task.error = data.error;
  return task;
}

function upsertMessageById(task, message) {
  if (!task || !message?.id) return false;
  const idx = task.messages.findIndex((m) => m?.id === message.id);
  if (idx >= 0) {
    task.messages[idx] = { ...task.messages[idx], ...message };
  } else {
    task.messages.push(message);
  }
  touch(task);
  persist(task);
  return true;
}

function persistUiEvent(taskId, event) {
  const t = tasks.get(taskId);
  if (!t || !event?.callId) return;
  if (event.type === SSE_EVENTS.TOOL_CALL_STARTED) {
    upsertMessageById(t, {
      id: event.callId,
      role: 'tool_call',
      toolName: event.toolName,
      summary: event.summary,
      target: event.target,
      status: 'running',
    });
  } else if (event.type === SSE_EVENTS.TOOL_CALL_COMPLETED) {
    upsertMessageById(t, {
      id: event.callId,
      role: 'tool_call',
      status: event.success ? 'done' : 'error',
      error: event.success ? undefined : (event.error ?? 'tool failed'),
      result: event.result,
    });
  }
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
  // guard-allow(perf-shape): 旧版 sidecar 一次性导入，导入后不再执行
  for (const row of rows) {
    const task = hydrateTask({
      ...row,
      modelContext: row.modelContext ?? null,
      updatedAt: row.updatedAt ?? row.createdAt,
    });
    if (!task) continue;
    try {
      // 走 cloneTaskForPersist 净化运行期字段（executionActive 等），避免把瞬时状态塞进 DB 行。
      upsertAssistantTask(cloneTaskForPersist(task));
      imported += 1;
      try { deleteTaskFile(task.id); } catch { /* ignore */ }
    } catch (err) {
      log.warn(`IMPORT_LEGACY_FAIL  ${formatMeta({ taskId: task.id, error: err.message })}`);
    }
  }
  if (imported > 0) log.info(`IMPORT_LEGACY  ${formatMeta({ imported })}`);
}

export function hydrateAssistantTasks() {
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
    if (!TERMINAL_TASK_STATUSES.has(task.status) && task.status !== 'running') {
      task.status = 'failed';
      task.error = RESTART_INTERRUPTED_ERROR;
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
    status: 'idle',
    context: context ?? {},
    messages: [],
    pendingUserMessages: [],
    modelContext: null,
    createdAt: now,
    executionActive: false,
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

function isRestartInterruptedTask(task) {
  return task?.status === 'failed' && task?.error === RESTART_INTERRUPTED_ERROR;
}

function isRecoverableTask(task) {
  return task?.status === 'running' || isRestartInterruptedTask(task);
}

function contextMatches(task, context) {
  if (!context) return true;
  const want = {
    worldId: context.worldId ?? null,
    characterId: context.characterId ?? null,
  };
  const got = {
    worldId: task?.context?.worldId ?? null,
    characterId: task?.context?.characterId ?? null,
  };
  return got.worldId === want.worldId && got.characterId === want.characterId;
}

/**
 * 找回当前 context 下最近的可恢复任务。
 * - 传入 context（含 worldId / characterId）：仅返回 context 严格匹配的任务，无匹配返回 null（不再跨上下文兜底，避免任务串台）。
 * - 不传 context：保持旧行为，返回最近任意可恢复任务（向后兼容）。
 */
export function getLatestRecoverableTask(context = null) {
  let latest = null;
  for (const task of tasks.values()) {
    if (!isRecoverableTask(task)) continue;
    if (!contextMatches(task, context)) continue;
    if (!latest || (task.updatedAt ?? 0) > (latest.updatedAt ?? 0)) {
      latest = task;
    }
  }
  if (latest) return latest;
  // 内存缓存覆盖 hydrate 后的全部任务，跨上下文兜底查询只在无 context 时走 DB。
  if (context) return null;
  return getLatestAssistantTask(
    `status = 'running' OR (status = 'failed' AND error = ?)`,
    [RESTART_INTERRUPTED_ERROR],
  );
}

/**
 * 列出所有可恢复任务的轻量摘要；可选排除某个 context（用于"当前世界没有任务，但其他世界还有 N 个未完成"提示）。
 */
export function listRecoverableTasks({ excludeContext = null } = {}) {
  const out = [];
  for (const task of tasks.values()) {
    if (!isRecoverableTask(task)) continue;
    if (excludeContext && contextMatches(task, excludeContext)) continue;
    out.push({
      id: task.id,
      status: task.status,
      context: task.context ?? {},
      updatedAt: task.updatedAt ?? 0,
    });
  }
  out.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  return out;
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

export function setExecutionActive(id, active) {
  const t = tasks.get(id);
  if (!t) return;
  t.executionActive = active === true;
}

export function isExecutionActive(id) {
  return tasks.get(id)?.executionActive === true;
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
  const remaining = sseClients.get(taskId)?.size ?? 0;
  log.debug(`DETACH  ${formatMeta({ taskId, remaining })}`);
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
  persistUiEvent(taskId, event);
  const clients = sseClients.get(taskId);
  const subscribers = clients?.size ?? 0;
  log.debug(`EMIT  ${formatMeta({ taskId, type: event.type, subscribers })}`);
  if (!clients) return;
  const line = `data: ${JSON.stringify(event)}\n\n`;
  let dead = null;
  for (const res of clients) {
    try {
      res.write(line);
    } catch (err) {
      (dead ??= []).push(res);
      log.warn(`EMIT_DROP  ${formatMeta({ taskId, type: event.type, error: err.message })}`);
    }
  }
  if (dead) {
    // 失效连接不及时清理会让后续 emit 每次都重复抛错刷日志，长跑任务下还会泄漏内存。
    for (const res of dead) clients.delete(res);
    log.warn(`EMIT_PARTIAL  ${formatMeta({ taskId, type: event.type, dropped: dead.length, ofTotal: subscribers })}`);
  }
}

export function buildTaskSnapshot(task) {
  if (!task) return null;
  return {
    id: task.id,
    status: task.status,
    context: task.context ?? {},
    messages: Array.isArray(task.messages) ? task.messages : [],
    pendingUserMessages: Array.isArray(task.pendingUserMessages) ? task.pendingUserMessages : [],
    modelContext: task.modelContext ?? null,
    createdAt: task.createdAt ?? null,
    error: task.error,
    updatedAt: task.updatedAt ?? null,
  };
}

export const __testables = {
  tasks,
  sseClients,
  RESTART_INTERRUPTED_ERROR,
  isRecoverableTask,
  buildTaskSnapshot,
};
