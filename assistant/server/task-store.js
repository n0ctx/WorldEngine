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
const RESUMABLE_TASK_STATUSES = new Set(['running', 'awaiting_approval', 'paused']);
const LIVE_RECOVERABLE_TASK_STATUSES = new Set(['running', 'awaiting_approval', 'paused']);
const RESTART_INTERRUPTED_ERROR = 'interrupted by restart';
export const HARNESS_ERROR_PREFIX = 'agent loop error: ';

export function isHarnessError(err) {
  return typeof err === 'string' && err.startsWith(HARNESS_ERROR_PREFIX);
}

function cloneTaskForPersist(task) {
  return {
    id: task.id,
    status: task.status,
    context: task.context ?? {},
    messages: Array.isArray(task.messages) ? task.messages : [],
    pendingUserMessages: Array.isArray(task.pendingUserMessages) ? task.pendingUserMessages : [],
    planDocContent: typeof task.planDocContent === 'string' ? task.planDocContent : '',
    modelContext: task.modelContext ?? null,
    createdAt: typeof task.createdAt === 'number' ? task.createdAt : Date.now(),
    currentStepId: task.currentStepId ?? null,
    lastToolFailure: task.lastToolFailure ?? null,
    lastSubagentResult: task.lastSubagentResult ?? null,
    approvalCheckpoint: task.approvalCheckpoint ?? null,
    loopIteration: Number.isFinite(task.loopIteration) ? task.loopIteration : 0,
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
    if ((m.role === 'tool_call' || m.role === 'step') && m.status === 'running') {
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
    planDocContent: typeof data.planDocContent === 'string' ? data.planDocContent : '',
    modelContext: data.modelContext ?? null,
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
    currentStepId: data.currentStepId ?? null,
    lastToolFailure: data.lastToolFailure ?? null,
    lastSubagentResult: data.lastSubagentResult ?? null,
    approvalCheckpoint: data.approvalCheckpoint ?? null,
    loopIteration: Number.isFinite(data.loopIteration) ? data.loopIteration : 0,
    pauseRequested: false,
    executionActive: false,
    appliedResources: [],
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

function upsertToolCallStarted(task, event) {
  if (!task || !event?.callId) return false;
  const message = {
    id: event.callId,
    role: 'tool_call',
    toolName: event.toolName,
    status: 'running',
  };

  const existingIdx = task.messages.findIndex((m) => m?.id === event.callId);
  if (existingIdx >= 0) {
    task.messages[existingIdx] = { ...task.messages[existingIdx], ...message };
  } else {
    const prevFailedIdx = event.toolName
      ? task.messages.reduce(
        (found, m, i) =>
          m?.role === 'tool_call' && m.toolName === event.toolName && m.status === 'error'
            ? i
            : found,
        -1,
      )
      : -1;
    if (prevFailedIdx >= 0) {
      task.messages[prevFailedIdx] = message;
    } else {
      task.messages.push(message);
    }
  }
  touch(task);
  persist(task);
  return true;
}

function persistUiEvent(taskId, event) {
  const t = tasks.get(taskId);
  if (!t || !event?.type) return;
  switch (event.type) {
    case SSE_EVENTS.PLAN_DOC_UPDATED: {
      const planTaskId = event.taskId ?? taskId;
      t.planDocContent = event.content ?? '';
      upsertMessageById(t, {
        id: `plan-doc-${planTaskId}`,
        role: 'plan_doc',
        content: event.content ?? '',
      });
      return;
    }
    case SSE_EVENTS.TOOL_CALL_STARTED:
      upsertToolCallStarted(t, event);
      return;
    case SSE_EVENTS.TOOL_CALL_COMPLETED:
      if (!event.callId) return;
      upsertMessageById(t, {
        id: event.callId,
        role: 'tool_call',
        toolName: event.toolName ?? t.messages.find((m) => m?.id === event.callId)?.toolName,
        status: event.success ? 'done' : 'error',
      });
      t.lastToolFailure = event.success
        ? null
        : {
            toolName: event.toolName ?? t.messages.find((m) => m?.id === event.callId)?.toolName ?? null,
            error: event.error ?? 'tool failed',
            at: Date.now(),
          };
      touch(t);
      persist(t);
      return;
    case SSE_EVENTS.STEP_STARTED:
      if (!event.stepId) return;
      upsertMessageById(t, {
        id: event.stepId,
        role: 'step',
        stepId: event.stepId,
        title: event.title,
        status: 'running',
      });
      return;
    case SSE_EVENTS.STEP_COMPLETED:
      if (!event.stepId) return;
      upsertMessageById(t, {
        id: event.stepId,
        role: 'step',
        stepId: event.stepId,
        status: 'done',
      });
      return;
    case SSE_EVENTS.STEP_FAILED:
      if (!event.stepId) return;
      upsertMessageById(t, {
        id: event.stepId,
        role: 'step',
        stepId: event.stepId,
        status: 'error',
        error: event.error,
      });
      return;
    default:
      return;
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
    planDocContent: '',
    modelContext: null,
    createdAt: now,
    currentStepId: null,
    lastToolFailure: null,
    lastSubagentResult: null,
    approvalCheckpoint: null,
    loopIteration: 0,
    executionActive: false,
    appliedResources: [],
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
  return LIVE_RECOVERABLE_TASK_STATUSES.has(task?.status) || isRestartInterruptedTask(task);
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
  return getLatestAssistantTask(`
    status IN ('running', 'awaiting_approval', 'paused')
    OR (status = 'failed' AND error = '${RESTART_INTERRUPTED_ERROR}')
  `);
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
      title: task.approvalCheckpoint?.title ?? null,
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

export function setCurrentStep(id, stepId) {
  const t = tasks.get(id);
  if (!t) return;
  if (t.currentStepId === stepId) return;
  t.currentStepId = stepId ?? null;
  touch(t);
  persist(t);
}

export function setLastToolFailure(id, payload) {
  const t = tasks.get(id);
  if (!t) return;
  const next = payload ?? null;
  if (JSON.stringify(t.lastToolFailure ?? null) === JSON.stringify(next)) return;
  t.lastToolFailure = next;
  touch(t);
  persist(t);
}

export function setLastSubagentResult(id, payload) {
  const t = tasks.get(id);
  if (!t) return;
  const next = payload ?? null;
  if (JSON.stringify(t.lastSubagentResult ?? null) === JSON.stringify(next)) return;
  t.lastSubagentResult = next;
  touch(t);
  persist(t);
}

export function setApprovalCheckpoint(id, payload) {
  const t = tasks.get(id);
  if (!t) return;
  const next = payload ?? null;
  if (JSON.stringify(t.approvalCheckpoint ?? null) === JSON.stringify(next)) return;
  t.approvalCheckpoint = next;
  touch(t);
  persist(t);
}

export function incrementLoopIteration(id) {
  const t = tasks.get(id);
  if (!t) return 0;
  t.loopIteration = Number.isFinite(t.loopIteration) ? t.loopIteration + 1 : 1;
  touch(t);
  persist(t);
  return t.loopIteration;
}

export function setExecutionActive(id, active) {
  const t = tasks.get(id);
  if (!t) return;
  t.executionActive = active === true;
}

export function isExecutionActive(id) {
  return tasks.get(id)?.executionActive === true;
}

// 连续失败计数：父代理工具循环里若同一轮内连续 N 次失败，主动暂停等用户介入，
// 避免模型在错误状态下无意义反复重试 → 5/10/25 个失败气泡刷屏。
export function bumpConsecutiveFailure(id) {
  const t = tasks.get(id);
  if (!t) return 0;
  t.consecutiveFailures = Number.isFinite(t.consecutiveFailures) ? t.consecutiveFailures + 1 : 1;
  return t.consecutiveFailures;
}

export function resetConsecutiveFailure(id) {
  const t = tasks.get(id);
  if (!t) return;
  if (t.consecutiveFailures) t.consecutiveFailures = 0;
}

// preview 缓存：子代理在 update/delete 前必须 preview_card；同一 task 内的多个步骤可能针对同一实体，
// 各自独立跑 preview 浪费时间 / token。这里把命中标记落在 task 内存上，TTL 30s 内同 key 直接放行。
const PREVIEW_CACHE_TTL_MS = 30_000;

function previewCacheMap(task) {
  if (!task.previewCache) task.previewCache = new Map();
  return task.previewCache;
}

export function markPreviewed(id, key) {
  const t = tasks.get(id);
  if (!t || !key) return;
  previewCacheMap(t).set(key, Date.now() + PREVIEW_CACHE_TTL_MS);
}

export function hasFreshPreview(id, key) {
  const t = tasks.get(id);
  if (!t || !key) return false;
  const cache = previewCacheMap(t);
  const expiresAt = cache.get(key);
  if (!expiresAt) return false;
  if (expiresAt < Date.now()) {
    cache.delete(key);
    return false;
  }
  return true;
}

export function recordAppliedResource(id, entry) {
  const t = tasks.get(id);
  if (!t || !entry) return;
  if (!Array.isArray(t.appliedResources)) t.appliedResources = [];
  t.appliedResources.push({ at: Date.now(), ...entry });
  touch(t);
}

export function findAppliedResource(id, predicate) {
  const t = tasks.get(id);
  if (!t || typeof predicate !== 'function') return null;
  const list = Array.isArray(t.appliedResources) ? t.appliedResources : [];
  return list.find(predicate) ?? null;
}

export function clearAppliedResources(id) {
  const t = tasks.get(id);
  if (!t) return;
  if (!Array.isArray(t.appliedResources) || t.appliedResources.length === 0) return;
  t.appliedResources = [];
  touch(t);
}

export function resetLoopState(id) {
  const t = tasks.get(id);
  if (!t) return;
  t.lastToolFailure = null;
  t.lastSubagentResult = null;
  t.approvalCheckpoint = null;
  t.currentStepId = null;
  t.loopIteration = 0;
  t.pauseRequested = false;
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

export function setPlanDocContent(id, content) {
  const t = tasks.get(id);
  if (!t) return;
  const next = typeof content === 'string' ? content : '';
  if (t.planDocContent === next) return;
  t.planDocContent = next;
  touch(t);
  persist(t);
}

export function requestPauseAfterCurrentStep(id) {
  const t = tasks.get(id);
  if (!t || t.pauseRequested) return;
  t.pauseRequested = true;
}

export function consumePauseAfterCurrentStep(id) {
  const t = tasks.get(id);
  if (!t) return false;
  const requested = t.pauseRequested === true;
  t.pauseRequested = false;
  return requested;
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
  const task = tasks.get(taskId);
  if (remaining === 0 && task?.status === 'running') {
    requestPauseAfterCurrentStep(taskId);
    log.info(`PAUSE_ON_DETACH  ${formatMeta({ taskId, currentStepId: task.currentStepId ?? null })}`);
  }
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

export function buildTaskSnapshot(task) {
  if (!task) return null;
  return {
    id: task.id,
    status: task.status,
    context: task.context ?? {},
    messages: Array.isArray(task.messages) ? task.messages : [],
    pendingUserMessages: Array.isArray(task.pendingUserMessages) ? task.pendingUserMessages : [],
    planDocContent: typeof task.planDocContent === 'string' ? task.planDocContent : '',
    modelContext: task.modelContext ?? null,
    createdAt: task.createdAt ?? null,
    currentStepId: task.currentStepId ?? null,
    lastToolFailure: task.lastToolFailure ?? null,
    lastSubagentResult: task.lastSubagentResult ?? null,
    approvalCheckpoint: task.approvalCheckpoint ?? null,
    loopIteration: Number.isFinite(task.loopIteration) ? task.loopIteration : 0,
    appliedResources: Array.isArray(task.appliedResources) ? task.appliedResources : [],
    error: task.error,
    updatedAt: task.updatedAt ?? null,
  };
}

hydrate();

export const __testables = {
  tasks,
  sseClients,
  RESTART_INTERRUPTED_ERROR,
  isRecoverableTask,
  buildTaskSnapshot,
};
