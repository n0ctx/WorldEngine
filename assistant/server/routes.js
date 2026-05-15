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

// 把 ?worldId=&characterId= 查询参数标准化成 { worldId, characterId }；
// 两个参数都未提供时返回 null（表示"任意上下文"）。
function parseContextQuery(query) {
  const { worldId, characterId } = query ?? {};
  if (worldId === undefined && characterId === undefined) return null;
  return {
    worldId: worldId ? String(worldId) : null,
    characterId: characterId ? String(characterId) : null,
  };
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
  if (message !== undefined && message !== null && typeof message !== 'string') {
    return res.status(400).json({ error: 'message must be a string' });
  }

  // 跨上下文请求拒绝必须在 SSE 头 flush 前完成，否则 status 改不了。
  // 场景：标签页 A（世界 a）拿着 task X 切到世界 b 后再发送，会把另一个世界的消息塞进 X 串台。
  let task = taskId ? taskStore.getTask(taskId) : null;
  if (task && context && !contextMatchesTask(context, task)) {
    log.warn(`/agent REJECT_CROSS_CONTEXT  ${formatMeta({
      taskId,
      reqWorld: context.worldId ?? null,
      taskWorld: task.context?.worldId ?? null,
      reqChar: context.characterId ?? null,
      taskChar: task.context?.characterId ?? null,
    })}`);
    res.status(409).json({ error: 'context mismatch' });
    return;
  }

  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders?.();
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
  // 幂等：若已有父代理在跑（前一次 approve 还没结束，或用户重复点击），直接 ack 不再启动。
  if (taskStore.isExecutionActive(task.id)) {
    log.info(`/agent/approve SKIP_ACTIVE  ${formatMeta({ taskId: task.id })}`);
    return res.json({ ok: true, alreadyRunning: true });
  }
  log.info(`/agent/approve  ${formatMeta({ taskId: task.id })}`);
  // 同步把 plan doc 文件头部的"状态：awaiting_approval"改为"approved"——
  // 否则父代理新一轮读到的 plan_doc 仍标记为待审批，与 task.status 实时状态自相矛盾，
  // 模型可能误判要再次发起审批，输出"请确认执行"之类的冗余提示。
  try {
    const md = await planDoc.readPlanDoc(task.id).catch(() => '');
    if (md) {
      const parsed = planDoc.parsePlanDoc(md);
      if (parsed.status !== 'approved') {
        const updated = planDoc.renderPlanDoc({
          title: parsed.title,
          status: 'approved',
          createdAt: parsed.createdAt,
          updatedAt: new Date().toISOString(),
          intent: parsed.intent ?? '',
          assumptions: parsed.assumptions ?? [],
          steps: parsed.steps ?? [],
        });
        await planDoc.writePlanDoc(task.id, updated);
        taskStore.emit(task.id, { type: SSE_EVENTS.PLAN_DOC_UPDATED, taskId: task.id, content: updated });
      }
    }
  } catch (err) {
    log.warn(`/agent/approve PLAN_DOC_SYNC_FAIL  ${formatMeta({ taskId: task.id, error: err.message })}`);
  }
  taskStore.setApprovalCheckpoint(task.id, {
    ...(task.approvalCheckpoint ?? {}),
    status: 'approved',
    approvedAt: Date.now(),
  });
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
  // 拒绝计划只是清掉审批 checkpoint、把任务切到 paused（带 PLAN_REJECTED 标记），
  // 计划文档**保留**：用户随后可在同一 task 上继续对话，让父代理用 edit_plan_doc / write_plan_doc 修改方案。
  // HUD 端通过 status==='paused' && error===PLAN_REJECTED_PAUSE_REASON 判断不显示，避免误以为已批准。
  taskStore.setApprovalCheckpoint(task.id, null);
  taskStore.setStatus(task.id, 'paused', { error: PLAN_REJECTED_PAUSE_REASON });
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
  // plan doc 删除失败不能阻塞 cancel：磁盘错误时仍要把任务标记为 cancelled。
  try {
    await planDoc.deletePlanDoc(task.id);
  } catch (err) {
    log.warn(`/agent/cancel PLAN_DOC_DELETE_FAIL  ${formatMeta({ taskId: task.id, error: err.message })}`);
  }
  taskStore.setStatus(task.id, 'cancelled');
  taskStore.emit(task.id, { type: SSE_EVENTS.TASK_CANCELLED, taskId: task.id });
  res.json({ ok: true });
});

router.post('/agent/:taskId/truncate', async (req, res) => {
  const task = taskStore.getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'not found' });
  if (task.status === 'running') {
    log.warn(`/agent/truncate REJECT  ${formatMeta({ taskId: task.id, status: task.status })}`);
    return res.status(400).json({ error: 'cannot truncate while running' });
  }
  const messageId = req.body?.messageId;
  // 记录截断前是否有 plan_doc 消息，用于决定是否清理 plan doc 文件
  const hadPlanDoc = task.messages.some((m) => m.role === 'plan_doc');
  const dropped = taskStore.truncateFrom(task.id, messageId);
  if (dropped < 0) return res.status(404).json({ error: 'message not found' });
  log.info(`/agent/truncate  ${formatMeta({ taskId: task.id, messageId, dropped })}`);
  // 若截断导致 plan_doc 消息被删除，同步清理文件和内存中的 plan doc 状态，
  // 否则重新生成时 parent-agent 会读到旧 plan doc 并跳过 write_plan_doc 直接执行
  const stillHasPlanDoc = task.messages.some((m) => m.role === 'plan_doc');
  if (hadPlanDoc && !stillHasPlanDoc) {
    taskStore.setPlanDocContent(task.id, '');
    taskStore.setApprovalCheckpoint(task.id, null);
    planDoc.deletePlanDoc(task.id).catch(() => {});
    taskStore.emit(task.id, { type: SSE_EVENTS.PLAN_DOC_UPDATED, taskId: task.id, content: '' });
  }
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
  const task = taskStore.getLatestRecoverableTask(parseContextQuery(req.query));
  if (!task) return res.json({ task: null });
  res.json(buildTaskResponse(task));
});

router.get('/agent/recoverable-tasks', (req, res) => {
  res.json({ tasks: taskStore.listRecoverableTasks({ excludeContext: parseContextQuery(req.query) }) });
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
