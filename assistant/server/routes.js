/**
 * 写卡助手后端路由
 *
 * POST /api/assistant/agent                 — 单代理入口（SSE）
 * POST /api/assistant/agent/:taskId/approve — 批准计划
 * POST /api/assistant/agent/:taskId/reject  — 拒绝当前计划，保留任务继续对话
 * POST /api/assistant/agent/:taskId/cancel  — 取消任务
 * GET  /api/assistant/agent/recover         — 找回最近可恢复任务
 * GET  /api/assistant/agent/:taskId/stream  — 只订阅任务 SSE
 * GET  /api/assistant/agent/:taskId/plan-doc — 读取持久化计划文档
 * GET  /api/assistant/agent/:taskId         — 任务快照
 */

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { createLogger, formatMeta } from '../../backend/utils/logger.js';
import {
  normalizeProposal,
  normalizeEntryOps,
  normalizeStateFieldOps,
  normalizeStateValueOps,
  normalizeRegexRuleChanges,
  pickAllowed,
  deepOmit,
} from './normalize-proposal.js';
import * as taskStore from './task-store.js';
import * as planDoc from './plan-doc.js';
import { runParentAgent, RESUME_SENTINEL } from './parent-agent.js';
import { SSE_EVENTS } from './sse-events.js';

const router = Router();
const log = createLogger('as-route', 'yellow');
export const PLAN_REJECTED_PAUSE_REASON = 'plan rejected by user';

function writeSse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function buildTaskResponse(task) {
  return task ? { task: taskStore.buildTaskSnapshot(task) } : { task: null };
}

function contextMatchesTask(reqContext, task) {
  const taskWorld = task?.context?.worldId ?? null;
  const taskChar = task?.context?.characterId ?? null;
  const reqWorld = reqContext?.worldId ?? null;
  const reqChar = reqContext?.characterId ?? null;
  return taskWorld === reqWorld && taskChar === reqChar;
}

// ─── 提案归一化已移至 ./normalize-proposal.js ─────────────────────

export const __testables = {
  normalizeProposal,
  normalizeEntryOps,
  normalizeStateFieldOps,
  normalizeStateValueOps,
  normalizeRegexRuleChanges,
  pickAllowed,
  deepOmit,
};

// === 单代理端点 ===

router.post('/agent', async (req, res) => {
  const { taskId, message, messageId, context, resume = false } = req.body ?? {};
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders?.();

  let task = taskId ? taskStore.getTask(taskId) : null;
  if (task && context && !contextMatchesTask(context, task)) {
    // 跨上下文请求拒绝：标签页 A（世界 a）拿着 task X 切到世界 b 后再发送，
    // 会把另一个世界的消息塞进 X 的 pendingUserMessages 串台。
    log.warn(`/agent REJECT_CROSS_CONTEXT  ${formatMeta({
      taskId,
      reqWorld: context.worldId ?? null,
      taskWorld: task.context?.worldId ?? null,
      reqChar: context.characterId ?? null,
      taskChar: task.context?.characterId ?? null,
    })}`);
    res.status(409);
    writeSse(res, { type: SSE_EVENTS.TASK_FAILED, taskId: task.id, error: 'context mismatch' });
    res.end();
    return;
  }
  const isNew = !task;
  // 与 runParentAgent 内部 run 共享同一 runId，保证 task_created 事件也携带 runId，
  // 满足 ARCHITECTURE.md §14 "所有由 runParentAgent 触发的 SSE 事件携带 runId" 的契约。
  const runId = randomUUID().slice(0, 8);
  if (!task) {
    task = taskStore.createTask({ context });
    writeSse(res, { type: SSE_EVENTS.TASK_CREATED, taskId: task.id, task: taskStore.buildTaskSnapshot(task), runId });
  }
  taskStore.attachSse(task.id, res);
  // 注意：必须用 res.on('close')，不能用 req.on('close')。
  // express.json() 消费完请求体后 IncomingMessage 立即 emit 'close'，
  // 导致 SSE 客户端在 LLM 还在跑时就被提前 detach（事件全丢）。
  res.on('close', () => taskStore.detachSse(task.id, res));

  log.info(`/agent  ${formatMeta({ taskId: task.id, status: task.status, isNew, msgChars: (message ?? '').length })}`);

  let keepAlive = false;
  try {
    if (task.status === 'running') {
      if (resume) {
        if (taskStore.isExecutionActive(task.id)) {
          log.info(`/agent RESUME_ATTACH  ${formatMeta({ taskId: task.id })}`);
          keepAlive = true;
          return;
        }
      } else {
        taskStore.queueUserMessage(task.id, message);
        log.info(`/agent QUEUE  ${formatMeta({ taskId: task.id, queueSize: task.pendingUserMessages.length })}`);
        keepAlive = true;
        return;
      }
    }
    if (resume) {
      const canResume =
        task.status === 'paused' ||
        task.status === 'running' ||
        (task.status === 'failed' && task.error === taskStore.RESTART_INTERRUPTED_ERROR);
      if (!canResume) {
        log.warn(`/agent RESUME_REJECT  ${formatMeta({ taskId: task.id, status: task.status })}`);
        res.status(400);
        writeSse(res, { type: SSE_EVENTS.TASK_FAILED, taskId: task.id, error: 'task is not resumable' });
        taskStore.detachSse(task.id, res);
        res.end();
        return;
      }
    }
    if (task.status !== 'awaiting_approval') {
      taskStore.setStatus(task.id, 'running', { error: null });
    }
    await runParentAgent(
      task,
      resume ? RESUME_SENTINEL : message,
      { runId, userMessageId: resume ? undefined : messageId },
    );
  } catch (err) {
    log.error(`/agent FAIL  ${formatMeta({ taskId: task.id, error: err.message })}`);
    if (!res.writableEnded) {
      writeSse(res, { type: SSE_EVENTS.TASK_FAILED, taskId: task.id, error: err.message });
    }
  } finally {
    const finalStatus = task.status;
    const longLived =
      finalStatus === 'awaiting_approval' ||
      finalStatus === 'paused' ||
      finalStatus === 'running';
    if (!keepAlive && !longLived && !res.writableEnded) {
      taskStore.detachSse(task.id, res);
      res.end();
    }
  }
});

router.post('/agent/:taskId/approve', async (req, res) => {
  const task = taskStore.getTask(req.params.taskId);
  if (!task || task.status !== 'awaiting_approval') {
    log.warn(`/agent/approve REJECT  ${formatMeta({ taskId: req.params.taskId, status: task?.status ?? 'missing' })}`);
    return res.status(400).json({ error: 'not awaiting approval' });
  }
  log.info(`/agent/approve  ${formatMeta({ taskId: task.id })}`);
  taskStore.setStatus(task.id, 'running', { error: null });
  taskStore.emit(task.id, { type: SSE_EVENTS.PLAN_APPROVED, taskId: task.id });
  runParentAgent(task, '<<approved>>').catch((err) => {
    log.error(`/agent/approve RESUME_FAIL  ${formatMeta({ taskId: task.id, error: err.message })}`);
    taskStore.emit(task.id, { type: SSE_EVENTS.TASK_FAILED, taskId: task.id, error: err.message });
  });
  res.json({ ok: true });
});

router.post('/agent/:taskId/reject', async (req, res) => {
  const task = taskStore.getTask(req.params.taskId);
  if (!task || task.status !== 'awaiting_approval') {
    log.warn(`/agent/reject REJECT  ${formatMeta({ taskId: req.params.taskId, status: task?.status ?? 'missing' })}`);
    return res.status(400).json({ error: 'not awaiting approval' });
  }
  log.info(`/agent/reject  ${formatMeta({ taskId: task.id })}`);
  await planDoc.deletePlanDoc(task.id);
  taskStore.deleteMessage(task.id, `plan-doc-${task.id}`);
  taskStore.setApprovalCheckpoint(task.id, null);
  taskStore.setStatus(task.id, 'paused', { error: PLAN_REJECTED_PAUSE_REASON });
  taskStore.emit(task.id, { type: SSE_EVENTS.MESSAGES_CHANGED, taskId: task.id, messages: task.messages });
  taskStore.emit(task.id, { type: SSE_EVENTS.PAUSED, taskId: task.id });
  taskStore.emit(task.id, { type: SSE_EVENTS.TASK_SNAPSHOT, taskId: task.id, task: taskStore.buildTaskSnapshot(task) });
  res.json({ ok: true, task: taskStore.buildTaskSnapshot(task) });
});

router.post('/agent/:taskId/cancel', async (req, res) => {
  const task = taskStore.getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'not found' });
  log.info(`/agent/cancel  ${formatMeta({ taskId: task.id, fromStatus: task.status })}`);
  if (taskStore.TERMINAL_TASK_STATUSES.has(task.status)) {
    return res.json({ ok: true, ignored: true });
  }
  await planDoc.deletePlanDoc(task.id);
  taskStore.setStatus(task.id, 'cancelled');
  taskStore.emit(task.id, { type: SSE_EVENTS.TASK_CANCELLED, taskId: task.id });
  res.json({ ok: true });
});

router.post('/agent/:taskId/truncate', (req, res) => {
  const task = taskStore.getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'not found' });
  if (task.status === 'running') {
    log.warn(`/agent/truncate REJECT  ${formatMeta({ taskId: task.id, status: task.status })}`);
    return res.status(400).json({ error: 'cannot truncate while running' });
  }
  const messageId = req.body?.messageId;
  const dropped = taskStore.truncateFrom(task.id, messageId);
  if (dropped < 0) return res.status(404).json({ error: 'message not found' });
  log.info(`/agent/truncate  ${formatMeta({ taskId: task.id, messageId, dropped })}`);
  taskStore.emit(task.id, { type: SSE_EVENTS.MESSAGES_CHANGED, taskId: task.id, messages: task.messages });
  res.json({ ok: true, messages: task.messages });
});

router.post('/agent/:taskId/delete', (req, res) => {
  const task = taskStore.getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'not found' });
  if (task.status === 'running') {
    log.warn(`/agent/delete REJECT  ${formatMeta({ taskId: task.id, status: task.status })}`);
    return res.status(400).json({ error: 'cannot delete while running' });
  }
  const messageId = req.body?.messageId;
  const ok = taskStore.deleteMessage(task.id, messageId);
  if (!ok) return res.status(404).json({ error: 'message not found' });
  log.info(`/agent/delete  ${formatMeta({ taskId: task.id, messageId })}`);
  taskStore.emit(task.id, { type: SSE_EVENTS.MESSAGES_CHANGED, taskId: task.id, messages: task.messages });
  res.json({ ok: true, messages: task.messages });
});

router.get('/agent/recover', (req, res) => {
  const { worldId, characterId } = req.query ?? {};
  const context = (worldId !== undefined || characterId !== undefined)
    ? {
        worldId: worldId ? String(worldId) : null,
        characterId: characterId ? String(characterId) : null,
      }
    : null;
  const task = taskStore.getLatestRecoverableTask(context);
  if (!task) return res.json({ task: null });
  res.json(buildTaskResponse(task));
});

router.get('/agent/recoverable-tasks', (req, res) => {
  const { worldId, characterId } = req.query ?? {};
  const excludeContext = (worldId !== undefined || characterId !== undefined)
    ? {
        worldId: worldId ? String(worldId) : null,
        characterId: characterId ? String(characterId) : null,
      }
    : null;
  res.json({ tasks: taskStore.listRecoverableTasks({ excludeContext }) });
});

router.get('/agent/:taskId/stream', (req, res) => {
  const task = taskStore.getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'not found' });
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders?.();
  taskStore.attachSse(task.id, res);
  res.on('close', () => taskStore.detachSse(task.id, res));
  writeSse(res, { type: SSE_EVENTS.TASK_SNAPSHOT, taskId: task.id, task: taskStore.buildTaskSnapshot(task) });
});

router.get('/agent/:taskId/plan-doc', async (req, res) => {
  const content = await planDoc.readPlanDoc(req.params.taskId).catch(() => '');
  res.json({ content });
});

router.get('/agent/:taskId', (req, res) => {
  const task = taskStore.getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'not found' });
  res.json(buildTaskResponse(task));
});

export default router;
