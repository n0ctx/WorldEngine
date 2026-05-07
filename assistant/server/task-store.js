// assistant/server/task-store.js
//
// 写卡助手任务存储（重构后的单代理模型）。
// 一个 task 对应父代理一次会话；状态机详见 spec §3。
// SSE 客户端按 taskId 注册，emit() 群发事件给所有订阅者。
//
// 注意：旧 API（updateTask / appendTaskEvent / clearExpiredTasks）已被删除；
// 仅 routes.js 仍引用旧 API，将在 Phase 7 一并清理。
import { randomUUID } from 'node:crypto';

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
  return task;
}

export function getTask(id) {
  return tasks.get(id) ?? null;
}

export function setStatus(id, status) {
  const t = tasks.get(id);
  if (t) t.status = status;
}

export function deleteTask(id) {
  tasks.delete(id);
  sseClients.delete(id);
}

export function appendMessage(id, msg) {
  const t = tasks.get(id);
  if (t) t.messages.push(msg);
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
}

export function detachSse(taskId, res) {
  sseClients.get(taskId)?.delete(res);
}

export function emit(taskId, event) {
  const clients = sseClients.get(taskId);
  if (!clients) return;
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) {
    try { res.write(line); } catch { /* SSE 客户端已断开，忽略 */ }
  }
}

export const __testables = { tasks, sseClients };
