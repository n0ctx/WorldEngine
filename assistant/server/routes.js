/**
 * 写卡助手后端路由
 *
 * POST /api/assistant/agent                 — 单代理入口（SSE）
 * POST /api/assistant/agent/:taskId/approve — 批准计划
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
import { runParentAgent } from './parent-agent.js';
import { SSE_EVENTS } from './sse-events.js';

const router = Router();
const log = createLogger('as-route', 'yellow');

function writeSse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function buildTaskResponse(task) {
  return task ? { task: taskStore.buildTaskSnapshot(task) } : { task: null };
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
  const { taskId, message, messageId, context } = req.body ?? {};
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders?.();

  let task = taskId ? taskStore.getTask(taskId) : null;
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

  // executing 分支会把 res 留作长连接订阅后续 step 事件，不主动结束；
  // 其余分支跑完 runParentAgent 后必须主动 res.end()，
  // 否则旧 fetch 一直挂在 reader.read()，下一次 send/regen 会出现多客户端订阅
  // 同一份 emit 的并发写入（"你你好好"字符级双写）以及 messages_changed 广播
  // 误覆盖本地 store 等竞态。
  let keepAlive = false;
  try {
    if (task.status === 'executing') {
      // executing 时仅入队；当前 step 跑完后 dispatch_subagent 钩子会消费 pendingMessages
      // 并把任务切到 paused（spec §6.4）。下一轮用户消息进入 paused 分支才触发 LLM。
      taskStore.queueUserMessage(task.id, message);
      log.info(`/agent QUEUE  ${formatMeta({ taskId: task.id, queueSize: task.pendingUserMessages.length })}`);
      keepAlive = true; // 保持 SSE 连接
      return;
    }
    if (task.status !== 'planning') {
      // paused / awaiting_approval / recoverable failed 等恢复后，用户主动发新消息
      // 视为重新进入 planning；这样前端 dots / 流式状态与父代理语义一致。
      taskStore.setStatus(task.id, 'planning', { error: null });
    }
    // planning / awaiting_approval / clarifying / paused 都直接走父代理
    await runParentAgent(task, message, { runId, userMessageId: messageId });
  } catch (err) {
    log.error(`/agent FAIL  ${formatMeta({ taskId: task.id, error: err.message })}`);
    if (!res.writableEnded) {
      writeSse(res, { type: SSE_EVENTS.TASK_FAILED, taskId: task.id, error: err.message });
    }
  } finally {
    // 关闭策略：
    // - 直接对话回复（status 仍是 planning，本轮 runParentAgent 已 emit done）→ res.end()
    // - 终态（completed / failed / cancelled）→ res.end()
    // - awaiting_approval / paused / executing：仍需等用户 /approve 或后续 step 事件
    //   通过本连接广播，保留长连接，依赖客户端 abort（handleSend / handleRegenerate
    //   / handleEdit 起新流前会主动 abort 上一条）解订阅
    const finalStatus = task.status;
    const longLived =
      finalStatus === 'awaiting_approval' ||
      finalStatus === 'paused' ||
      finalStatus === 'executing';
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
  taskStore.setStatus(task.id, 'executing');
  taskStore.emit(task.id, { type: SSE_EVENTS.PLAN_APPROVED, taskId: task.id });
  // 触发 parent-agent 继续派发；用一个空消息触发执行循环
  runParentAgent(task, '<<approved>>').catch((err) => {
    log.error(`/agent/approve RESUME_FAIL  ${formatMeta({ taskId: task.id, error: err.message })}`);
    taskStore.emit(task.id, { type: SSE_EVENTS.TASK_FAILED, taskId: task.id, error: err.message });
  });
  res.json({ ok: true });
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
  if (task.status === 'executing') {
    log.warn(`/agent/truncate REJECT  ${formatMeta({ taskId: task.id, status: task.status })}`);
    return res.status(400).json({ error: 'cannot truncate while executing' });
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
  if (task.status === 'executing') {
    log.warn(`/agent/delete REJECT  ${formatMeta({ taskId: task.id, status: task.status })}`);
    return res.status(400).json({ error: 'cannot delete while executing' });
  }
  const messageId = req.body?.messageId;
  const ok = taskStore.deleteMessage(task.id, messageId);
  if (!ok) return res.status(404).json({ error: 'message not found' });
  log.info(`/agent/delete  ${formatMeta({ taskId: task.id, messageId })}`);
  taskStore.emit(task.id, { type: SSE_EVENTS.MESSAGES_CHANGED, taskId: task.id, messages: task.messages });
  res.json({ ok: true, messages: task.messages });
});

router.get('/agent/recover', (req, res) => {
  const task = taskStore.getLatestRecoverableTask();
  if (!task) return res.json({ task: null });
  res.json(buildTaskResponse(task));
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
