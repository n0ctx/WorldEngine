const TASK_TTL_MS = 30 * 60 * 1000;
const tasks = new Map();

function now() {
  return Date.now();
}

export function createTask(task) {
  const stored = {
    events: [],
    expiresAt: now() + TASK_TTL_MS,
    ...task,
  };
  tasks.set(stored.id, stored);
  return stored;
}

export function getTask(taskId) {
  const task = tasks.get(taskId);
  if (!task) return null;
  if (task.expiresAt <= now()) {
    tasks.delete(taskId);
    return null;
  }
  return task;
}

export function updateTask(taskId, patch) {
  const current = getTask(taskId);
  if (!current) return null;
  const next = {
    ...current,
    ...patch,
    expiresAt: now() + TASK_TTL_MS,
  };
  tasks.set(taskId, next);
  return next;
}

export function appendTaskEvent(taskId, event) {
  const task = getTask(taskId);
  if (!task) return null;
  const storedEvent = {
    timestamp: now(),
    ...event,
  };
  task.events.push(storedEvent);
  task.expiresAt = now() + TASK_TTL_MS;
  return storedEvent;
}

export function clearExpiredTasks() {
  const ts = now();
  let removed = 0;
  for (const [taskId, task] of tasks.entries()) {
    if (task.expiresAt <= ts) {
      tasks.delete(taskId);
      removed += 1;
    }
  }
  return removed;
}

setInterval(() => {
  clearExpiredTasks();
}, 10 * 60 * 1000).unref();

export const __testables = {
  tasks,
  TASK_TTL_MS,
};
