/**
 * 写卡助手后端路由
 *
 * POST /api/assistant/chat                   — 兼容旧版 SSE 对话（主代理 + 执行子代理）
 * POST /api/assistant/execute               — 应用提案（写入数据库）
 * POST /api/assistant/tasks                 — 通用 agent 任务入口（SSE）
 * POST /api/assistant/tasks/:taskId/answer  — 回答澄清问题（SSE）
 * POST /api/assistant/tasks/:taskId/approve-plan — 确认计划并执行（SSE）
 * POST /api/assistant/tasks/:taskId/approve-step — 确认高风险步骤（SSE）
 * GET  /api/assistant/tasks/:taskId         — 获取任务快照
 */

import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { runAgent } from './main-agent.js';
import { READ_FILE_TOOL } from './tools/project-reader.js';
import { createPreviewCardTool } from './tools/card-preview.js';
import { ALL_AGENTS } from './agents/index.js';
import { createAgentTool } from './agent-factory.js';
import { getWorldById, createWorld, updateWorld, deleteWorld } from '../../backend/services/worlds.js';
import { getCharacterById, createCharacter, updateCharacter, deleteCharacter } from '../../backend/services/characters.js';
import { getOrCreatePersona, updatePersona } from '../../backend/services/personas.js';
import { getConfig, updateConfig } from '../../backend/services/config.js';
import {
  createWorldPromptEntry,
  listWorldPromptEntries,
  updateWorldPromptEntry,
  deleteWorldPromptEntry,
} from '../../backend/services/prompt-entries.js';
import {
  createWorldStateField,
  listWorldStateFields,
  updateWorldStateField,
  deleteWorldStateField,
} from '../../backend/services/world-state-fields.js';
import {
  createCharacterStateField,
  listCharacterStateFields,
  updateCharacterStateField,
  deleteCharacterStateField,
} from '../../backend/services/character-state-fields.js';
import {
  createPersonaStateField,
  getPersonaStateFieldsByWorldId,
  updatePersonaStateField,
  deletePersonaStateField,
} from '../../backend/services/persona-state-fields.js';
import {
  createCustomCssSnippet,
  updateCustomCssSnippet,
  deleteCustomCssSnippet,
} from '../../backend/db/queries/custom-css-snippets.js';
import {
  createRegexRule,
  updateRegexRule,
  deleteRegexRule,
} from '../../backend/db/queries/regex-rules.js';
import {
  replaceEntryConditions,
} from '../../backend/db/queries/entry-conditions.js';
import { createPersona as createPersonaDb } from '../../backend/db/queries/personas.js';
import { createLogger, formatMeta, previewJson, previewText, shouldLogRaw } from '../../backend/utils/logger.js';
import { createTask, getTask, updateTask, appendTaskEvent } from './task-store.js';
import { createBaseTask, planTask } from './task-planner.js';
import { executeTaskSteps } from './task-executor.js';

const router = Router();
const log = createLogger('as-route', 'yellow');

// ─── 服务端提案存储（Token → Proposal，TTL 30 分钟） ──────────────
const proposalStore = new Map();
const PROPOSAL_TTL_MS = 30 * 60 * 1000;

// 每 10 分钟清理过期提案，防止内存泄漏
setInterval(() => {
  const now = Date.now();
  let removed = 0;
  for (const [token, entry] of proposalStore.entries()) {
    if (now > entry.expiresAt) { proposalStore.delete(token); removed++; }
  }
  if (removed > 0) log.info(`proposalStore GC  ${formatMeta({ removed })}`);
}, 10 * 60 * 1000).unref();
const VALID_REGEX_SCOPES = new Set(['user_input', 'ai_output', 'display_only', 'prompt_only']);
const VALID_MODES = new Set(['chat', 'writing']);
const VALID_STATE_TYPES = new Set(['number', 'text', 'enum', 'list', 'boolean']);
const VALID_UPDATE_MODES = new Set(['llm_auto', 'manual']);
const VALID_TRIGGER_MODES = new Set(['manual_only', 'every_turn', 'keyword_based']);
const PROPOSAL_ALLOWED_OPERATIONS = {
  'world-card': new Set(['create', 'update', 'delete']),
  'character-card': new Set(['create', 'update', 'delete']),
  'persona-card': new Set(['create', 'update']),
  'global-config': new Set(['update']),
  'css-snippet': new Set(['create', 'update', 'delete']),
  'regex-rule': new Set(['create', 'update', 'delete']),
};
const STATE_TARGETS_BY_PROPOSAL_TYPE = {
  'world-card': new Set(['world', 'persona', 'character']),
  'character-card': new Set(['persona', 'character']),
  'persona-card': new Set(['persona']),
};

// ─── SSE 工具 ─────────────────────────────────────────────────────

function sendSSE(res, data) {
  if (data?.type && data.type !== 'delta' && data.type !== 'thinking') {
    log.info(`sse  ${formatMeta({
      type: data.type,
      taskId: data.taskId,
      target: data.target,
      hasProposal: !!data.proposal,
      hasToken: !!data.token,
      error: data.error,
    })}`);
  }
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function openSSE(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
}

function endSSE(res) {
  sendSSE(res, { done: true });
  res.end();
}

function snapshotTask(task) {
  if (!task) return null;
  const { events: _events, ...rest } = task;
  return rest;
}

function buildTaskEmitter(res, taskId) {
  return (event) => {
    const storedEvent = {
      ...event,
      task: snapshotTask(event.task),
    };
    appendTaskEvent(taskId, storedEvent);
    sendSSE(res, event);
  };
}

async function enrichAssistantContext(context = {}) {
  const next = { ...context };
  const worldId = next?.worldId ?? next?.world?.id ?? null;
  if (worldId) {
    try {
      const entries = listWorldPromptEntries(worldId);
      const worldSf = listWorldStateFields(worldId);
      const personaSf = getPersonaStateFieldsByWorldId(worldId);
      const charSf = listCharacterStateFields(worldId);
      next._worldSummary = {
        entryCount: entries.length,
        alwaysCount: entries.filter((e) => e.trigger_type === 'always').length,
        keywordCount: entries.filter((e) => e.trigger_type === 'keyword').length,
        llmCount: entries.filter((e) => e.trigger_type === 'llm').length,
        stateCount: entries.filter((e) => e.trigger_type === 'state').length,
        worldStateFieldCount: worldSf.length,
        personaStateFieldCount: personaSf.length,
        characterStateFieldCount: charSf.length,
      };
    } catch {
      // 摘要查询失败不阻断流程
    }
  }
  return next;
}

function classifyRiskFlags(steps) {
  return steps
    .filter((step) => step.riskLevel === 'high' || step.operation === 'delete')
    .map((step) => `${step.targetType}:${step.operation}:${step.title}`);
}

async function streamTaskAnswer({ res, task, message, history = [], context = {} }) {
  const worldId = context?.worldId ?? context?.world?.id ?? null;
  const previewCardTool = createPreviewCardTool(context);
  const agentTools = ALL_AGENTS.map((def) =>
    createAgentTool(def, { res, proposalStore, normalizeProposal, previewCardTool }),
  );
  const allTools = [READ_FILE_TOOL, previewCardTool, ...agentTools];
  const gen = runAgent(message, history, context, allTools, {
    onToolCall: (name) => sendSSE(res, { type: 'tool_call', name, taskId: task.id }),
  });

  log.info(`task ANSWER  ${formatMeta({ taskId: task.id, worldId })}`);
  for await (const chunk of gen) {
    sendSSE(res, { delta: chunk, taskId: task.id });
  }
  updateTask(task.id, { status: 'completed' });
  appendTaskEvent(task.id, { type: 'task_completed', taskId: task.id });
  sendSSE(res, { type: 'task_completed', taskId: task.id });
}

function compileTaskGraph(steps = []) {
  return steps.map((step) => ({
    ...step,
    status: 'pending',
    approved: false,
    proposal: null,
    result: null,
    error: null,
    entityId: null,
  }));
}

// ─── POST /api/assistant/chat ─────────────────────────────────────

router.post('/chat', async (req, res) => {
  const { message, history = [], context = {} } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message 为必填项' });
  }

  openSSE(res);
  const enrichedContext = await enrichAssistantContext(context);
  const worldId = enrichedContext?.worldId ?? enrichedContext?.world?.id ?? null;

  log.info(`chat START  ${formatMeta({
    message: previewText(message, { limit: 160 }),
    history: Array.isArray(history) ? history.length : 0,
    worldId,
    characterId: context?.characterId ?? context?.character?.id ?? null,
  })}`);

  // 构建按请求绑定的完整工具集
  const previewCardTool = createPreviewCardTool(enrichedContext);
  const agentTools = ALL_AGENTS.map((def) =>
    createAgentTool(def, { res, proposalStore, normalizeProposal, previewCardTool }),
  );
  const allTools = [READ_FILE_TOOL, previewCardTool, ...agentTools];

  try {
    const gen = runAgent(message, history, enrichedContext, allTools, {
      onToolCall: (name) => sendSSE(res, { type: 'tool_call', name }),
    });
    for await (const chunk of gen) {
      sendSSE(res, { delta: chunk });
    }
    log.info(`chat DONE`);
  } catch (err) {
    log.error(`chat FAIL  ${formatMeta({ error: err.message, message: previewText(message, { limit: 120 }) })}`);
    sendSSE(res, { type: 'error', error: err.message });
  } finally {
    endSSE(res);
  }
});

router.post('/tasks', async (req, res) => {
  const { message, history = [], context = {} } = req.body;
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message 为必填项' });
  }

  openSSE(res);
  const enrichedContext = await enrichAssistantContext(context);
  const task = createTask({
    ...createBaseTask({ message, context: enrichedContext }),
    context: {
      worldId: enrichedContext?.worldId ?? enrichedContext?.world?.id ?? null,
      characterId: enrichedContext?.characterId ?? enrichedContext?.character?.id ?? null,
      world: enrichedContext?.world ?? null,
      character: enrichedContext?.character ?? null,
      config: enrichedContext?.config ?? null,
    },
    sourceHistory: history,
  });
  const emit = buildTaskEmitter(res, task.id);
  emit({ type: 'task_created', taskId: task.id, task });

  try {
    const planned = await planTask({ message, history, context: enrichedContext });
    if (planned.kind === 'clarify') {
      const next = updateTask(task.id, {
        status: 'clarifying',
        summary: planned.summary,
        pendingQuestions: planned.clarificationQuestions,
      });
      emit({
        type: 'clarification_requested',
        taskId: task.id,
        summary: planned.summary,
        questions: planned.clarificationQuestions,
        task: next,
      });
      return;
    }

    if (planned.kind === 'answer') {
      updateTask(task.id, { status: 'executing', summary: planned.summary });
      await streamTaskAnswer({ res, task, message, history, context: enrichedContext });
      return;
    }

    const graph = compileTaskGraph(planned.steps);
    const riskFlags = classifyRiskFlags(graph);
    const next = updateTask(task.id, {
      status: 'awaiting_plan_approval',
      summary: planned.summary,
      plan: {
        summary: planned.summary,
        assumptions: planned.assumptions,
        steps: graph,
      },
      graph,
      riskFlags,
    });
    emit({
      type: 'plan_ready',
      taskId: task.id,
      plan: next.plan,
      riskFlags,
      task: next,
    });
  } catch (error) {
    const next = updateTask(task.id, { status: 'failed', error: error.message });
    emit({
      type: 'task_failed',
      taskId: task.id,
      error: error.message,
      task: next,
    });
  } finally {
    endSSE(res);
  }
});

router.post('/tasks/:taskId/answer', async (req, res) => {
  const task = getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: '任务不存在或已过期' });
  if (task.status !== 'clarifying') return res.status(400).json({ error: '当前任务不处于待澄清状态' });
  const { answer } = req.body;
  if (!answer || typeof answer !== 'string' || !answer.trim()) {
    return res.status(400).json({ error: 'answer 为必填项' });
  }

  openSSE(res);
  const emit = buildTaskEmitter(res, task.id);
  const clarifications = [...(task.clarifications || []), answer.trim()];
  const mergedMessage = `${task.goal}\n\n补充信息：\n${clarifications.map((item, index) => `${index + 1}. ${item}`).join('\n')}`;
  const nextBase = updateTask(task.id, {
    status: 'planning',
    clarifications,
    pendingQuestions: [],
  });
  emit({
    type: 'clarification_answered',
    taskId: task.id,
    answer: answer.trim(),
    task: nextBase,
  });

  try {
    const planned = await planTask({
      message: mergedMessage,
      history: task.sourceHistory || [],
      context: task.context,
    });
    if (planned.kind === 'clarify') {
      const next = updateTask(task.id, {
        status: 'clarifying',
        summary: planned.summary,
        pendingQuestions: planned.clarificationQuestions,
      });
      emit({
        type: 'clarification_requested',
        taskId: task.id,
        summary: planned.summary,
        questions: planned.clarificationQuestions,
        task: next,
      });
      return;
    }

    if (planned.kind === 'answer') {
      updateTask(task.id, { status: 'executing', summary: planned.summary });
      await streamTaskAnswer({ res, task, message: mergedMessage, history: task.sourceHistory || [], context: task.context });
      return;
    }

    const graph = compileTaskGraph(planned.steps);
    const riskFlags = classifyRiskFlags(graph);
    const next = updateTask(task.id, {
      status: 'awaiting_plan_approval',
      summary: planned.summary,
      plan: {
        summary: planned.summary,
        assumptions: planned.assumptions,
        steps: graph,
      },
      graph,
      riskFlags,
    });
    emit({
      type: 'plan_ready',
      taskId: task.id,
      plan: next.plan,
      riskFlags,
      task: next,
    });
  } catch (error) {
    const next = updateTask(task.id, { status: 'failed', error: error.message });
    emit({
      type: 'task_failed',
      taskId: task.id,
      error: error.message,
      task: next,
    });
  } finally {
    endSSE(res);
  }
});

router.post('/tasks/:taskId/approve-plan', async (req, res) => {
  const task = getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: '任务不存在或已过期' });
  if (task.status !== 'awaiting_plan_approval') return res.status(400).json({ error: '当前任务不处于待确认计划状态' });

  openSSE(res);
  const emit = buildTaskEmitter(res, task.id);
  const next = updateTask(task.id, { status: 'executing' });
  emit({
    type: 'plan_approved',
    taskId: task.id,
    task: next,
  });

  try {
    await executeTaskSteps({
      task: next,
      normalizeProposal,
      applyProposal,
      emit,
    });
  } catch (error) {
    updateTask(task.id, { status: 'failed', error: error.message });
    emit({
      type: 'task_failed',
      taskId: task.id,
      error: error.message,
    });
  } finally {
    endSSE(res);
  }
});

router.post('/tasks/:taskId/approve-step', async (req, res) => {
  const task = getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: '任务不存在或已过期' });
  const stepId = req.body?.stepId || task.awaitingStepId;
  const editedProposal = req.body?.editedProposal;
  if (task.status !== 'awaiting_step_approval' || !stepId) {
    return res.status(400).json({ error: '当前任务不处于待确认步骤状态' });
  }
  const step = task.graph.find((item) => item.id === stepId);
  if (!step) return res.status(404).json({ error: '步骤不存在' });
  if (!step.proposal) {
    return res.status(400).json({ error: '当前步骤提案尚未生成，无法审阅确认' });
  }
  if (editedProposal) {
    try {
      const base = step.proposal;
      step.proposal = normalizeProposal({
        ...base,
        explanation: typeof editedProposal.explanation === 'string' ? editedProposal.explanation : base.explanation,
        changes: editedProposal.changes ?? base.changes,
        entryOps: Array.isArray(editedProposal.entryOps) ? editedProposal.entryOps : base.entryOps,
        stateFieldOps: Array.isArray(editedProposal.stateFieldOps) ? editedProposal.stateFieldOps : base.stateFieldOps,
      }, {
        type: base.type,
        operation: base.operation,
        entityId: base.entityId ?? null,
      });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  openSSE(res);
  step.approved = true;
  step.status = 'pending';
  const emit = buildTaskEmitter(res, task.id);
  const next = updateTask(task.id, {
    status: 'executing',
    awaitingStepId: null,
    graph: task.graph,
  });
  emit({
    type: 'step_approved',
    taskId: task.id,
    stepId,
    task: next,
  });

  try {
    await executeTaskSteps({
      task: next,
      normalizeProposal,
      applyProposal,
      emit,
      startFromStepId: stepId,
    });
  } catch (error) {
    updateTask(task.id, { status: 'failed', error: error.message });
    emit({
      type: 'task_failed',
      taskId: task.id,
      error: error.message,
    });
  } finally {
    endSSE(res);
  }
});

router.post('/tasks/:taskId/cancel', (req, res) => {
  const task = getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: '任务不存在或已过期' });
  const next = updateTask(task.id, { status: 'cancelled' });
  appendTaskEvent(task.id, { type: 'task_cancelled', taskId: task.id });
  res.json({ ok: true, task: next });
});

router.get('/tasks/:taskId', (req, res) => {
  const task = getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: '任务不存在或已过期' });
  res.json(task);
});

// ─── POST /api/assistant/execute ─────────────────────────────────

router.post('/execute', async (req, res) => {
  const { token, worldRefId, editedProposal } = req.body;
  log.info(`execute START  ${formatMeta({ token: typeof token === 'string' ? token.slice(0, 8) : null, worldRefId: worldRefId ? String(worldRefId).slice(0, 8) : null, edited: !!editedProposal })}`);

  if (!token) return res.status(400).json({ error: 'token 为必填项' });

  const entry = proposalStore.get(token);
  if (!entry) return res.status(400).json({ error: '提案不存在或已过期，请重新生成' });
  if (Date.now() > entry.expiresAt) {
    proposalStore.delete(token);
    return res.status(400).json({ error: '提案已过期，请重新生成' });
  }
  proposalStore.delete(token); // 一次性消费

  // 用户编辑：以 token 锚定的 type/operation/entityId 为准，内容字段可被覆盖
  const base = entry.proposal;
  const effective = editedProposal
    ? normalizeProposal({
        ...base,
        changes: editedProposal.changes ?? base.changes,
        entryOps: Array.isArray(editedProposal.entryOps) ? editedProposal.entryOps : base.entryOps,
        stateFieldOps: Array.isArray(editedProposal.stateFieldOps) ? editedProposal.stateFieldOps : base.stateFieldOps,
      }, {
        type: base.type,
        operation: base.operation,
        entityId: base.entityId ?? null,
      })
    : base;

  try {
    log.info(`execute APPLY  ${formatMeta({
      token: token.slice(0, 8),
      type: effective.type,
      operation: effective.operation,
      entityId: effective.entityId ?? null,
      changeKeys: Object.keys(effective.changes || {}),
      entryOps: Array.isArray(effective.entryOps) ? effective.entryOps.length : undefined,
      stateFieldOps: Array.isArray(effective.stateFieldOps) ? effective.stateFieldOps.length : undefined,
      preview: shouldLogRaw('llm_raw') ? previewJson(effective) : undefined,
    })}`);
    const result = await applyProposal(effective, worldRefId);
    log.info(`execute DONE  ${formatMeta({ token: token.slice(0, 8), type: effective.type, operation: effective.operation, resultKeys: result && typeof result === 'object' ? Object.keys(result) : undefined })}`);
    res.json({ ok: true, result });
  } catch (err) {
    log.error(`execute FAIL  ${formatMeta({ token: token.slice(0, 8), error: err.message })}`);
    res.status(500).json({ error: err.message });
  }
});

// ─── 提案执行器 ───────────────────────────────────────────────────

async function applyProposal(proposal, worldRefId = null) {
  const { type, operation = 'update', entityId, changes = {}, newEntries = [] } = proposal;
  log.info(`apply START  ${formatMeta({ type, operation, entityId: entityId ?? null, worldRefId: worldRefId ?? null })}`);

  switch (type) {
    case 'world-card': {
      if (operation === 'create') {
        const safeChanges = pickAllowed(changes, ['name', 'description', 'temperature', 'max_tokens']);
        const newWorld = createWorld({
          name: safeChanges.name || '新世界',
          description: safeChanges.description ?? '',
          temperature: safeChanges.temperature ?? null,
          max_tokens: safeChanges.max_tokens ?? null,
        });
        for (const op of (Array.isArray(proposal.entryOps) ? proposal.entryOps : [])) {
          if (op.op === 'create') {
            const entry = createWorldPromptEntry(newWorld.id, op);
            if (op.trigger_type === 'state' && Array.isArray(op.conditions) && op.conditions.length > 0) {
              replaceEntryConditions(entry.id, op.conditions);
            }
          }
        }
        for (const op of (Array.isArray(proposal.stateFieldOps) ? proposal.stateFieldOps : [])) {
          if (op.op === 'create') applyStateFieldCreate(op, newWorld.id);
        }
        return newWorld;
      }
      if (operation === 'delete') {
        if (!entityId) throw new Error('world-card delete 需要 entityId');
        await deleteWorld(entityId);
        return { deleted: entityId };
      }
      // update
      if (!entityId) throw new Error('world-card 提案缺少 entityId');
      const safeChanges = pickAllowed(changes, ['name', 'description', 'temperature', 'max_tokens']);
      let updated = null;
      if (Object.keys(safeChanges).length > 0) updated = await updateWorld(entityId, safeChanges);
      const worldOps = proposal.entryOps?.length ? proposal.entryOps : newEntries.map((e) => ({ op: 'create', ...e }));
      for (const op of worldOps) {
        if (op.op === 'create') {
          const entry = createWorldPromptEntry(entityId, op);
          if (op.trigger_type === 'state' && Array.isArray(op.conditions) && op.conditions.length > 0) {
            replaceEntryConditions(entry.id, op.conditions);
          }
        } else if (op.op === 'update' && op.id) {
          updateWorldPromptEntry(op.id, pickAllowed(op, ['title', 'description', 'content', 'keywords', 'keyword_scope', 'trigger_type', 'token']));
          if (op.trigger_type === 'state' && Array.isArray(op.conditions)) {
            replaceEntryConditions(op.id, op.conditions);
          }
        } else if (op.op === 'delete' && op.id) deleteWorldPromptEntry(op.id);
      }
      for (const op of (Array.isArray(proposal.stateFieldOps) ? proposal.stateFieldOps : [])) {
        if (op.op === 'create') applyStateFieldCreate(op, entityId);
        else if (op.op === 'update' && op.id) await applyStateFieldUpdate(op);
        else if (op.op === 'delete' && op.id) await applyStateFieldDelete(op);
      }
      return updated;
    }

    case 'character-card': {
      if (operation === 'create') {
        const worldId = worldRefId || entityId;
        if (!worldId) throw new Error('character-card create 需要 worldId（请先应用对应的世界卡提案）');
        const safeChanges = pickAllowed(changes, ['name', 'description', 'system_prompt', 'post_prompt', 'first_message']);
        const newChar = createCharacter({
          world_id: worldId,
          name: safeChanges.name || '新角色',
          description: safeChanges.description || '',
          system_prompt: safeChanges.system_prompt || '',
          post_prompt: safeChanges.post_prompt || '',
          first_message: safeChanges.first_message || '',
        });
        for (const op of (Array.isArray(proposal.stateFieldOps) ? proposal.stateFieldOps : [])) {
          if (op.op === 'create') applyStateFieldCreate(op, worldId);
        }
        return newChar;
      }
      if (operation === 'delete') {
        if (!entityId) throw new Error('character-card delete 需要 entityId');
        await deleteCharacter(entityId);
        return { deleted: entityId };
      }
      // update
      if (!entityId) throw new Error('character-card 提案缺少 entityId');
      const safeChanges = pickAllowed(changes, ['name', 'description', 'system_prompt', 'post_prompt', 'first_message']);
      let updated = null;
      if (Object.keys(safeChanges).length > 0) updated = await updateCharacter(entityId, safeChanges);
      const charSfOps = Array.isArray(proposal.stateFieldOps) ? proposal.stateFieldOps : [];
      if (charSfOps.length > 0) {
        const character = getCharacterById(entityId);
        if (character) {
          for (const op of charSfOps) {
            if (op.op === 'create') applyStateFieldCreate(op, character.world_id);
            else if (op.op === 'update' && op.id) await applyStateFieldUpdate(op);
            else if (op.op === 'delete' && op.id) await applyStateFieldDelete(op);
          }
        }
      }
      return updated;
    }

    case 'persona-card': {
      if (operation === 'create') {
        const worldId = entityId;
        if (!worldId) throw new Error('persona-card create 需要 worldId（entityId）');
        const safeChanges = pickAllowed(changes, ['name', 'description', 'system_prompt']);
        const newPersona = createPersonaDb(worldId, {
          name: safeChanges.name || '新玩家',
          description: safeChanges.description || '',
          system_prompt: safeChanges.system_prompt || '',
        });
        for (const op of (Array.isArray(proposal.stateFieldOps) ? proposal.stateFieldOps : [])) {
          if (op.op === 'create') applyStateFieldCreate({ ...op, target: 'persona' }, worldId);
        }
        return newPersona;
      }
      // update
      const worldId = entityId;
      if (!worldId) throw new Error('persona-card 提案缺少 worldId（entityId）');
      const safeChanges = pickAllowed(changes, ['name', 'description', 'system_prompt']);
      const updated = await updatePersona(worldId, safeChanges);
      for (const op of (Array.isArray(proposal.stateFieldOps) ? proposal.stateFieldOps : [])) {
        if (op.op === 'create') applyStateFieldCreate({ ...op, target: 'persona' }, worldId);
        else if (op.op === 'update' && op.id) await applyStateFieldUpdate({ ...op, target: 'persona' });
        else if (op.op === 'delete' && op.id) await applyStateFieldDelete({ ...op, target: 'persona' });
      }
      return updated;
    }

    case 'global-config': {
      const safeChanges = deepOmit(changes, ['api_key', 'llm.api_key', 'embedding.api_key']);
      let updated = null;
      if (Object.keys(safeChanges).length > 0) updated = updateConfig(safeChanges);
      return updated;
    }

    case 'css-snippet': {
      if (operation === 'delete') {
        if (!entityId) throw new Error('css-snippet delete 需要 entityId');
        deleteCustomCssSnippet(entityId);
        return { deleted: entityId };
      }
      if (operation === 'update') {
        if (!entityId) throw new Error('css-snippet update 需要 entityId');
        return updateCustomCssSnippet(entityId, pickAllowed(changes, ['name', 'content', 'mode', 'enabled']));
      }
      return createCustomCssSnippet({
        name: changes.name || '写卡助手生成',
        content: changes.content || '',
        mode: changes.mode || 'chat',
        enabled: changes.enabled ?? 1,
      });
    }

    case 'regex-rule': {
      if (operation === 'delete') {
        if (!entityId) throw new Error('regex-rule delete 需要 entityId');
        deleteRegexRule(entityId);
        return { deleted: entityId };
      }
      if (operation === 'update') {
        if (!entityId) throw new Error('regex-rule update 需要 entityId');
        return updateRegexRule(entityId, pickAllowed(changes, ['name', 'pattern', 'replacement', 'flags', 'scope', 'world_id', 'mode', 'enabled']));
      }
      const scope = VALID_REGEX_SCOPES.has(changes.scope) ? changes.scope : 'display_only';
      return createRegexRule({
        name: changes.name || '写卡助手生成',
        enabled: changes.enabled ?? 1,
        pattern: changes.pattern || '',
        replacement: changes.replacement ?? '',
        flags: changes.flags || 'g',
        scope,
        world_id: changes.world_id ?? null,
        mode: changes.mode || 'chat',
      });
    }

    default:
      throw new Error(`未知的提案类型：${type}`);
  }
}

// ─── 工具函数 ─────────────────────────────────────────────────────

function applyStateFieldCreate(op, worldId) {
  const data = pickAllowed(op, STATE_FIELD_KEYS);
  try {
    switch (op.target) {
      case 'persona': createPersonaStateField(worldId, data); break;
      case 'character': createCharacterStateField(worldId, data); break;
      case 'world':
      default: createWorldStateField(worldId, data); break;
    }
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint failed')) {
      log.warn(`applyStateFieldCreate skip duplicate: target=${op.target}, field_key=${data.field_key}, worldId=${worldId}`);
      return; // 字段已存在视为幂等成功，多步骤创建场景下不阻断后续执行
    }
    throw err;
  }
}

async function applyStateFieldUpdate(op) {
  const data = pickAllowed(op, STATE_FIELD_KEYS);
  switch (op.target) {
    case 'persona': updatePersonaStateField(op.id, data); break;
    case 'character': updateCharacterStateField(op.id, data); break;
    case 'world':
    default: updateWorldStateField(op.id, data); break;
  }
}

async function applyStateFieldDelete(op) {
  switch (op.target) {
    case 'persona': await deletePersonaStateField(op.id); break;
    case 'character': await deleteCharacterStateField(op.id); break;
    case 'world':
    default: await deleteWorldStateField(op.id); break;
  }
}

const STATE_FIELD_KEYS = [
  'field_key', 'label', 'type', 'description', 'default_value',
  'update_mode', 'trigger_mode', 'trigger_keywords', 'update_instruction',
  'enum_options', 'min_value', 'max_value', 'allow_empty',
];

function normalizeProposal(raw, locked = {}) {
  const type = locked.type || normalizeString(raw?.type);
  if (!type || !PROPOSAL_ALLOWED_OPERATIONS[type]) {
    throw new Error(`提案格式错误：未知的 proposal type：${raw?.type || '(空)'}`);
  }

  const operationCandidate = locked.operation || normalizeString(raw?.operation) || 'update';
  const operation = PROPOSAL_ALLOWED_OPERATIONS[type].has(operationCandidate) ? operationCandidate : null;
  if (!operation) throw new Error(`提案格式错误：${type} 不支持 operation=${operationCandidate}`);

  const proposal = {
    type,
    operation,
    explanation: normalizeString(raw?.explanation) || getDefaultExplanation(type, operation),
  };

  if (type === 'world-card' || type === 'character-card' || type === 'persona-card' ||
      (type === 'css-snippet' && operation !== 'create') ||
      (type === 'regex-rule' && operation !== 'create')) {
    proposal.entityId = normalizeEntityId(locked.entityId ?? raw?.entityId);
  }

  const changes = raw?.changes && typeof raw.changes === 'object' && !Array.isArray(raw.changes) ? raw.changes : {};

  switch (type) {
    case 'world-card':
      proposal.changes = normalizeWorldChanges(changes);
      proposal.stateFieldOps = normalizeStateFieldOps(raw?.stateFieldOps, type);
      proposal.entryOps = normalizeEntryOps(raw?.entryOps, {
        allowTriggerType: true,
        conditionContext: buildWorldConditionContext(proposal.entityId, proposal.stateFieldOps),
      });
      {
        const disallowedKeys = Object.keys(changes).filter(
          (k) => !['name', 'description', 'temperature', 'max_tokens'].includes(k),
        );
        if (disallowedKeys.length > 0) {
          proposal.explanation += `（注意：世界卡不支持 ${disallowedKeys.join(', ')} 字段，相关内容请通过条目管理）`;
        }
      }
      break;
    case 'character-card':
      proposal.changes = normalizeCharacterChanges(changes);
      proposal.stateFieldOps = normalizeStateFieldOps(raw?.stateFieldOps, type);
      break;
    case 'persona-card':
      proposal.changes = normalizePersonaChanges(changes);
      proposal.stateFieldOps = normalizeStateFieldOps(raw?.stateFieldOps, type);
      break;
    case 'global-config':
      proposal.changes = deepOmit(normalizeObject(changes), ['api_key', 'llm.api_key', 'embedding.api_key']);
      break;
    case 'css-snippet':
      if (operation === 'delete') {
        proposal.changes = {};
      } else if (operation === 'update') {
        proposal.changes = pickAllowed(changes, ['name', 'content', 'mode', 'enabled']);
      } else {
        proposal.changes = normalizeCssSnippetChanges(changes);
      }
      break;
    case 'regex-rule':
      if (operation === 'delete') {
        proposal.changes = {};
      } else if (operation === 'update') {
        proposal.changes = pickAllowed(changes, ['name', 'pattern', 'replacement', 'flags', 'scope', 'world_id', 'mode', 'enabled']);
      } else {
        proposal.changes = normalizeRegexRuleChanges(changes);
      }
      break;
    default: break;
  }

  if (typeof raw?.worldRef === 'string' && raw.worldRef.trim()) proposal.worldRef = raw.worldRef.trim();
  if (typeof raw?.taskId === 'string' && raw.taskId.trim()) proposal.taskId = raw.taskId.trim();

  // 空内容检测：非 delete 操作必须至少有一项变更
  if (operation !== 'delete') {
    const hasChanges = Object.keys(proposal.changes || {}).length > 0;
    const hasEntryOps = Array.isArray(proposal.entryOps) && proposal.entryOps.length > 0;
    const hasStateFieldOps = Array.isArray(proposal.stateFieldOps) && proposal.stateFieldOps.length > 0;
    if (!hasChanges && !hasEntryOps && !hasStateFieldOps) {
      throw new Error('提案格式错误：提案内容为空，未包含任何变更');
    }
  }

  return proposal;
}

function normalizeWorldChanges(changes) {
  const picked = pickAllowed(changes, ['name', 'description', 'temperature', 'max_tokens']);
  const normalized = {};
  if ('name' in picked) normalized.name = String(picked.name ?? '');
  if ('description' in picked) normalized.description = String(picked.description ?? '');
  if ('temperature' in picked) normalized.temperature = normalizeNumberOrNull(picked.temperature);
  if ('max_tokens' in picked) normalized.max_tokens = normalizeIntegerOrNull(picked.max_tokens);
  return normalized;
}

function normalizeCharacterChanges(changes) {
  const picked = pickAllowed(changes, ['name', 'description', 'system_prompt', 'post_prompt', 'first_message']);
  const normalized = {};
  for (const key of Object.keys(picked)) normalized[key] = String(picked[key] ?? '');
  return normalized;
}

function normalizePersonaChanges(changes) {
  const picked = pickAllowed(changes, ['name', 'description', 'system_prompt']);
  const normalized = {};
  for (const key of Object.keys(picked)) normalized[key] = String(picked[key] ?? '');
  return normalized;
}

function normalizeCssSnippetChanges(changes) {
  const picked = pickAllowed(changes, ['name', 'content', 'mode', 'enabled']);
  const content = String(picked.content ?? '').trim();
  if (!content) throw new Error('提案格式错误：css-snippet.changes.content 不能为空');
  return {
    name: normalizeString(picked.name) || '写卡助手生成',
    content: String(picked.content),
    mode: normalizeMode(picked.mode),
    enabled: normalizeEnabled(picked.enabled),
  };
}

function normalizeRegexRuleChanges(changes) {
  const picked = pickAllowed(changes, ['name', 'pattern', 'replacement', 'flags', 'scope', 'world_id', 'mode', 'enabled']);
  const pattern = String(picked.pattern ?? '').trim();
  if (!pattern) throw new Error('提案格式错误：regex-rule.changes.pattern 不能为空');
  return {
    name: normalizeString(picked.name) || '写卡助手生成',
    pattern: String(picked.pattern),
    replacement: String(picked.replacement ?? ''),
    flags: normalizeString(picked.flags) || 'g',
    scope: VALID_REGEX_SCOPES.has(picked.scope) ? picked.scope : 'display_only',
    world_id: normalizeEntityId(picked.world_id),
    mode: normalizeMode(picked.mode),
    enabled: normalizeEnabled(picked.enabled),
  };
}

const VALID_ENTRY_CONDITION_OPERATORS = new Set(['eq', 'ne', 'gt', 'lt', 'gte', 'lte', 'contains', 'not_contains']);
const VALID_TRIGGER_TYPES = new Set(['always', 'keyword', 'llm', 'state']);
const VALID_RUNTIME_ENTRY_CONDITION_OPERATORS = new Set(['>', '<', '=', '>=', '<=', '!=', '包含', '等于', '不包含']);
const CONDITION_OPERATOR_ALIASES = {
  eq: 'eq',
  ne: 'ne',
  gt: 'gt',
  lt: 'lt',
  gte: 'gte',
  lte: 'lte',
  contains: 'contains',
  not_contains: 'not_contains',
  '>': '>',
  '<': '<',
  '=': '=',
  '>=': '>=',
  '<=': '<=',
  '!=': '!=',
  '包含': '包含',
  '等于': '等于',
  '不包含': '不包含',
};

function buildWorldConditionContext(worldId, stateFieldOps = []) {
  const scopedFields = [];
  const pushScopedField = (scopeLabel, field) => {
    if (!field?.label) return;
    scopedFields.push({
      scopeLabel,
      label: String(field.label),
      field_key: typeof field.field_key === 'string' ? field.field_key : '',
      type: typeof field.type === 'string' ? field.type : 'text',
    });
  };

  if (worldId) {
    listWorldStateFields(worldId).forEach((field) => pushScopedField('世界', field));
    getPersonaStateFieldsByWorldId(worldId).forEach((field) => pushScopedField('玩家', field));
    listCharacterStateFields(worldId).forEach((field) => pushScopedField('角色', field));
  }

  for (const op of stateFieldOps) {
    if (op?.op !== 'create') continue;
    if (op.target === 'world') pushScopedField('世界', op);
    else if (op.target === 'persona') pushScopedField('玩家', op);
    else if (op.target === 'character') pushScopedField('角色', op);
  }

  const deduped = [];
  const seen = new Set();
  for (const field of scopedFields) {
    const key = `${field.scopeLabel}.${field.field_key}::${field.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(field);
  }

  const byScopedLabel = new Map();
  const byScopedFieldKey = new Map();
  const byFieldKey = new Map();
  const byLabel = new Map();

  for (const field of deduped) {
    const scopedLabel = `${field.scopeLabel}.${field.label}`;
    byScopedLabel.set(scopedLabel, field);
    if (field.field_key) byScopedFieldKey.set(`${field.scopeLabel}.${field.field_key}`, field);
    if (field.field_key) {
      if (!byFieldKey.has(field.field_key)) byFieldKey.set(field.field_key, []);
      byFieldKey.get(field.field_key).push(field);
    }
    if (!byLabel.has(field.label)) byLabel.set(field.label, []);
    byLabel.get(field.label).push(field);
  }

  return { byScopedLabel, byScopedFieldKey, byFieldKey, byLabel };
}

function resolveConditionField(rawTargetField, context) {
  const input = String(rawTargetField ?? '').trim();
  if (!input) return { targetField: null, field: null };
  if (!context) return { targetField: input, field: null };

  if (context.byScopedLabel.has(input)) {
    const field = context.byScopedLabel.get(input);
    return { targetField: `${field.scopeLabel}.${field.label}`, field };
  }
  if (context.byScopedFieldKey.has(input)) {
    const field = context.byScopedFieldKey.get(input);
    return { targetField: `${field.scopeLabel}.${field.label}`, field };
  }

  if (input.includes('.')) {
    return { targetField: input, field: null };
  }

  const byKeyMatches = context.byFieldKey.get(input) || [];
  if (byKeyMatches.length === 1) {
    const field = byKeyMatches[0];
    return { targetField: `${field.scopeLabel}.${field.label}`, field };
  }
  if (byKeyMatches.length > 1) {
    throw new Error(`提案格式错误：state 条件 target_field "${input}" 存在多个同名 field_key，请改为 世界.xxx / 玩家.xxx / 角色.xxx`);
  }

  const byLabelMatches = context.byLabel.get(input) || [];
  if (byLabelMatches.length === 1) {
    const field = byLabelMatches[0];
    return { targetField: `${field.scopeLabel}.${field.label}`, field };
  }
  if (byLabelMatches.length > 1) {
    throw new Error(`提案格式错误：state 条件 target_field "${input}" 存在多个同名标签，请改为 世界.xxx / 玩家.xxx / 角色.xxx`);
  }

  return { targetField: input, field: null };
}

function normalizeConditionOperator(rawOperator, field, idx, condIdx) {
  const operator = CONDITION_OPERATOR_ALIASES[String(rawOperator ?? '').trim()];
  if (!operator) {
    throw new Error(`提案格式错误：entryOps[${idx}].conditions[${condIdx}].operator 非法`);
  }
  if (VALID_RUNTIME_ENTRY_CONDITION_OPERATORS.has(operator)) return operator;

  const fieldType = field?.type || null;
  const isNumeric = fieldType === 'number';
  switch (operator) {
    case 'gt':
      if (!isNumeric) throw new Error(`提案格式错误：entryOps[${idx}].conditions[${condIdx}] 非数值字段不能使用 gt`);
      return '>';
    case 'lt':
      if (!isNumeric) throw new Error(`提案格式错误：entryOps[${idx}].conditions[${condIdx}] 非数值字段不能使用 lt`);
      return '<';
    case 'gte':
      if (!isNumeric) throw new Error(`提案格式错误：entryOps[${idx}].conditions[${condIdx}] 非数值字段不能使用 gte`);
      return '>=';
    case 'lte':
      if (!isNumeric) throw new Error(`提案格式错误：entryOps[${idx}].conditions[${condIdx}] 非数值字段不能使用 lte`);
      return '<=';
    case 'eq':
      return isNumeric ? '=' : '等于';
    case 'ne':
      if (!isNumeric) throw new Error(`提案格式错误：entryOps[${idx}].conditions[${condIdx}] 文本字段不支持 ne，请改用 等于/包含/不包含`);
      return '!=';
    case 'contains':
      return '包含';
    case 'not_contains':
      return '不包含';
    default:
      throw new Error(`提案格式错误：entryOps[${idx}].conditions[${condIdx}].operator 非法`);
  }
}

function normalizeEntryOps(rawOps, { includeMode = false, allowTriggerType = false, conditionContext = null } = {}) {
  if (rawOps == null) return [];
  if (!Array.isArray(rawOps)) throw new Error('提案格式错误：entryOps 必须是数组');
  return rawOps.map((raw, idx) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`提案格式错误：entryOps[${idx}] 必须是对象`);
    const op = normalizeString(raw.op);
    if (!['create', 'update', 'delete'].includes(op)) throw new Error(`提案格式错误：entryOps[${idx}].op 非法`);
    if (op === 'delete') {
      const id = normalizeEntityId(raw.id);
      if (!id) throw new Error(`提案格式错误：entryOps[${idx}].id 缺失`);
      return { op, id };
    }
    const normalized = { op };
    const id = normalizeEntityId(raw.id);
    if (op === 'update') {
      if (!id) throw new Error(`提案格式错误：entryOps[${idx}].id 缺失`);
      normalized.id = id;
    }
    if ('title' in raw) normalized.title = String(raw.title ?? '');
    if ('description' in raw) normalized.description = String(raw.description ?? '');
    if ('content' in raw) normalized.content = String(raw.content ?? '');
    if ('keywords' in raw) normalized.keywords = normalizeStringArrayOrNull(raw.keywords);
    if ('keyword_scope' in raw) normalized.keyword_scope = raw.keyword_scope;
    if ('token' in raw) {
      const t = parseInt(raw.token, 10);
      normalized.token = Number.isFinite(t) && t >= 1 ? t : 1;
    }
    if (includeMode) normalized.mode = normalizeMode(raw.mode);
    if (allowTriggerType && 'trigger_type' in raw) {
      const tt = normalizeString(raw.trigger_type);
      if (tt && VALID_TRIGGER_TYPES.has(tt)) normalized.trigger_type = tt;
    }
    if (allowTriggerType && normalized.trigger_type === 'state' && Array.isArray(raw.conditions)) {
      normalized.conditions = raw.conditions
        .filter((c) => c && typeof c === 'object' && c.target_field && c.operator && 'value' in c)
        .map((c, condIdx) => {
          const { targetField, field } = resolveConditionField(c.target_field, conditionContext);
          return {
            target_field: targetField,
            operator: normalizeConditionOperator(c.operator, field, idx, condIdx),
            value: String(c.value ?? ''),
          };
        });
    }
    return normalized;
  });
}

function normalizeStateFieldOps(rawOps, type) {
  if (rawOps == null) return [];
  if (!Array.isArray(rawOps)) throw new Error('提案格式错误：stateFieldOps 必须是数组');
  const allowedTargets = STATE_TARGETS_BY_PROPOSAL_TYPE[type];
  return rawOps.map((raw, idx) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`提案格式错误：stateFieldOps[${idx}] 必须是对象`);
    const op = normalizeString(raw.op);
    if (!['create', 'update', 'delete'].includes(op)) throw new Error(`提案格式错误：stateFieldOps[${idx}].op 非法`);
    const target = normalizeString(raw.target);
    if (!target || !allowedTargets.has(target)) throw new Error(`提案格式错误：stateFieldOps[${idx}].target 非法`);
    if (op === 'delete') {
      const id = normalizeEntityId(raw.id);
      if (!id) throw new Error(`提案格式错误：stateFieldOps[${idx}].id 缺失`);
      return { op, target, id };
    }
    if (op === 'update') {
      const id = normalizeEntityId(raw.id);
      if (!id) throw new Error(`提案格式错误：stateFieldOps[${idx}].id 缺失`);
      const normalized = { op, target, id };
      const data = pickAllowed(raw, STATE_FIELD_KEYS);
      if ('type' in data && VALID_STATE_TYPES.has(data.type)) normalized.type = data.type;
      if ('label' in data) normalized.label = String(data.label ?? '');
      if ('description' in data) normalized.description = String(data.description ?? '');
      if ('default_value' in data) normalized.default_value = data.default_value == null ? null : String(data.default_value);
      if ('update_mode' in data) normalized.update_mode = VALID_UPDATE_MODES.has(data.update_mode) ? data.update_mode : undefined;
      if ('trigger_mode' in data) normalized.trigger_mode = VALID_TRIGGER_MODES.has(data.trigger_mode) ? data.trigger_mode : undefined;
      if ('update_instruction' in data) normalized.update_instruction = String(data.update_instruction ?? '');
      if ('trigger_keywords' in data) normalized.trigger_keywords = normalizeStringArrayOrNull(data.trigger_keywords);
      if ('enum_options' in data) normalized.enum_options = normalizeStringArrayOrNull(data.enum_options);
      if ('min_value' in data) normalized.min_value = normalizeNumberOrNull(data.min_value);
      if ('max_value' in data) normalized.max_value = normalizeNumberOrNull(data.max_value);
      if ('allow_empty' in data) normalized.allow_empty = normalizeEnabled(data.allow_empty);
      return normalized;
    }
    const fieldKey = normalizeString(raw.field_key);
    const label = normalizeString(raw.label);
    const fieldType = normalizeString(raw.type);
    if (!fieldKey) throw new Error(`提案格式错误：stateFieldOps[${idx}].field_key 缺失`);
    if (!label) throw new Error(`提案格式错误：stateFieldOps[${idx}].label 缺失`);
    if (!VALID_STATE_TYPES.has(fieldType)) throw new Error(`提案格式错误：stateFieldOps[${idx}].type 非法`);
    const normalized = {
      op, target,
      field_key: fieldKey, label, type: fieldType,
      description: String(raw.description ?? ''),
      default_value: raw.default_value == null ? null : String(raw.default_value),
      update_mode: VALID_UPDATE_MODES.has(raw.update_mode) ? raw.update_mode : 'manual',
      trigger_mode: VALID_TRIGGER_MODES.has(raw.trigger_mode) ? raw.trigger_mode : 'manual_only',
      update_instruction: String(raw.update_instruction ?? ''),
      allow_empty: normalizeEnabled(raw.allow_empty),
    };
    if ('trigger_keywords' in raw) normalized.trigger_keywords = normalizeStringArrayOrNull(raw.trigger_keywords);
    if ('enum_options' in raw) normalized.enum_options = normalizeStringArrayOrNull(raw.enum_options);
    if ('min_value' in raw) normalized.min_value = normalizeNumberOrNull(raw.min_value);
    if ('max_value' in raw) normalized.max_value = normalizeNumberOrNull(raw.max_value);
    return normalized;
  });
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function normalizeString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function normalizeEntityId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function normalizeMode(value) {
  return VALID_MODES.has(value) ? value : 'chat';
}
function normalizeEnabled(value) {
  return Number(value) === 0 ? 0 : 1;
}
function normalizeNumberOrNull(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}
function normalizeIntegerOrNull(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isInteger(num) ? num : null;
}
function normalizeStringArrayOrNull(value) {
  if (value == null || !Array.isArray(value)) return null;
  const arr = value.map((item) => String(item ?? '').trim()).filter(Boolean);
  return arr.length ? arr : null;
}
function getDefaultExplanation(type, operation) {
  return `已生成 ${type} ${operation} 提案`;
}
function pickAllowed(obj, allowed) {
  const result = {};
  for (const key of allowed) { if (key in obj) result[key] = obj[key]; }
  return result;
}
function deepOmit(obj, keys) {
  const result = { ...obj };
  for (const key of keys) {
    if (key.includes('.')) {
      const [top, ...rest] = key.split('.');
      if (result[top] && typeof result[top] === 'object') result[top] = deepOmit(result[top], [rest.join('.')]);
    } else {
      delete result[key];
    }
  }
  return result;
}

export const __testables = {
  normalizeProposal,
  normalizeEntryOps,
  normalizeStateFieldOps,
  normalizeRegexRuleChanges,
  pickAllowed,
  deepOmit,
  proposalStore,
};

export default router;
