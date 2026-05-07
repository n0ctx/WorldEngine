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

const log = createLogger('as-store', 'magenta');

const tasks = new Map();
const sseClients = new Map(); // taskId -> Set<res>

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
  t.status = status;
  if (prev !== status) log.info(`STATUS  ${formatMeta({ taskId: id, from: prev, to: status })}`);
}

export function deleteTask(id) {
  tasks.delete(id);
  sseClients.delete(id);
}

export function appendMessage(id, msg) {
  const t = tasks.get(id);
  if (!t) return null;
  const stamped = { id: msg?.id ?? `msg-${randomUUID().slice(0, 8)}`, ...msg };
  t.messages.push(stamped);
  return stamped;
}

export function deleteMessage(taskId, messageId) {
  const t = tasks.get(taskId);
  if (!t) return false;
  const idx = t.messages.findIndex((m) => m.id === messageId);
  if (idx < 0) return false;
  t.messages.splice(idx, 1);
  return true;
}

export function truncateFrom(taskId, messageId) {
  const t = tasks.get(taskId);
  if (!t) return -1;
  const idx = t.messages.findIndex((m) => m.id === messageId);
  if (idx < 0) return -1;
  const dropped = t.messages.splice(idx);
  return dropped.length;
}

export function queueUserMessage(id, msg) {
  const t = tasks.get(id);
  if (t) t.pendingUserMessages.push(msg);
}

export function takeUserMessages(id) {
  const t = tasks.get(id);
  if (!t) return [];
  const msgs = t.pendingUserMessages;
  t.pendingUserMessages = [];
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

export const __testables = { tasks, sseClients };
