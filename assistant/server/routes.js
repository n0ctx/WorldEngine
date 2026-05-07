/**
 * 写卡助手后端路由
 *
 * POST /api/assistant/chat                   — 兼容旧版 SSE 对话（主代理 + 执行子代理）
 * POST /api/assistant/execute               — 应用提案（写入数据库）
 * POST /api/assistant/extract-characters    — 从写作轮次提取角色并自动创建角色卡（SSE）
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
import { createAgentTool, buildAgentMessages } from './agent-factory.js';
import { getWorldById, createWorld, updateWorld, deleteWorld } from '../../backend/services/worlds.js';
import { getCharacterById, getCharactersByWorldId, createCharacter, updateCharacter, deleteCharacter } from '../../backend/services/characters.js';
import { getOrCreatePersona, updatePersona } from '../../backend/services/personas.js';
import { getConfig, updateConfig, getAuxLlmConfig } from '../../backend/services/config.js';
import {
  createWorldPromptEntry,
  getWorldPromptEntryById,
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
import { getMessagesBySessionId, getMessageById } from '../../backend/db/queries/messages.js';
import { addWritingSessionCharacter, getWritingSessionById } from '../../backend/db/queries/writing-sessions.js';
import { deleteCharacter as dbDeleteCharacter } from '../../backend/db/queries/characters.js';
import { upsertCharacterStateValue } from '../../backend/db/queries/character-state-values.js';
import {
  updateCharacterDefaultStateValueValidated,
  updatePersonaDefaultStateValueValidated,
} from '../../backend/services/state-values.js';
import * as llm from '../../backend/llm/index.js';
import { createLogger, formatMeta, previewJson, previewText, shouldLogRaw } from '../../backend/utils/logger.js';
import { createTask, getTask, updateTask, appendTaskEvent } from './task-store.js';
import { createBaseTask, planTask } from './task-planner.js';
import { researchTask } from './task-researcher.js';
import { executeTaskSteps } from './task-executor.js';
import {
  normalizeProposal,
  applyProposal,
  normalizeEntryOps,
  normalizeStateFieldOps,
  normalizeStateValueOps,
  normalizeRegexRuleChanges,
  pickAllowed,
  deepOmit,
} from './normalize-proposal.js';

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

function isWriteApprovalOperation(step) {
  return step.operation === 'update' || step.operation === 'delete';
}

// 简单低风险 create 可快进；复杂写入、已有实体改删、研究阶段标记的任务都先过计划闸门
function isDirectExecute(graph, riskFlags, research) {
  return graph.length > 0
    && graph.length < 3
    && riskFlags.length === 0
    && !research?.needsPlanApproval
    && !graph.some(isWriteApprovalOperation);
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

// ─── POST /api/assistant/extract-characters ──────────────────────────
// 从写作轮次（user + assistant 消息对）中提取非玩家角色
// dryRun=true：只提取，发送 characters_extracted 事件，不创建卡
// dryRun=false（默认）：提取 + 创建 + 激活，发送 card_activated 事件
// SSE 事件：characters_extracted / character_found / card_activated / error / done

router.post('/extract-characters', async (req, res) => {
  const { worldId, sessionId, assistantMessageId, dryRun = false } = req.body ?? {};
  if (!worldId || !sessionId || !assistantMessageId) {
    return res.status(400).json({ error: 'worldId、sessionId、assistantMessageId 均为必填项' });
  }

  // 校验 sessionId 归属于 worldId
  const session = getWritingSessionById(sessionId);
  if (!session || session.world_id !== worldId) {
    return res.status(400).json({ error: '会话不存在或不属于指定世界' });
  }

  // 校验消息归属于该会话且为 assistant 消息
  const assistantMsg = getMessageById(assistantMessageId);
  if (!assistantMsg || assistantMsg.session_id !== sessionId || assistantMsg.role !== 'assistant') {
    return res.status(400).json({ error: '消息不存在、不属于指定会话或不是助手消息' });
  }

  openSSE(res);

  try {
    // 找到此 assistant 消息前最近的 user 消息
    const allMsgs = getMessagesBySessionId(sessionId, 500);
    const aIdx = allMsgs.findIndex((m) => m.id === assistantMessageId);
    const userMsg = aIdx > 0
      ? [...allMsgs].slice(0, aIdx).reverse().find((m) => m.role === 'user')
      : null;

    const existingChars = getCharactersByWorldId(worldId);
    const stateFields = listCharacterStateFields(worldId);

    // 构建 LLM 任务描述
    const existingNames = existingChars.map((c) => c.name).join('、') || '（无）';
    const sfDesc = stateFields.length > 0
      ? stateFields.map((f) => {
          let extra = '';
          if (f.type === 'enum' && Array.isArray(f.enum_options) && f.enum_options.length > 0) {
            extra = `，可选值：[${f.enum_options.map((o) => `"${o}"`).join(', ')}]`;
          } else if (f.type === 'datetime') {
            extra = '，格式：ISO 局部时间 "YYYY-MM-DDTHH:mm"（如 "1000-03-15T14:30"）';
          }
          return `- ${f.field_key}（${f.label}，类型：${f.type}${extra}${f.description ? '，说明：' + f.description : ''}）`;
        }).join('\n')
      : '（无状态字段定义）';

    // 收集本轮 LLM 实际看到的世界书条目：always 常驻条目 + 该 assistant message 保存的命中条目
    const allWorldEntries = listWorldPromptEntries(worldId);
    const alwaysEntries = allWorldEntries.filter((e) => e.trigger_type === 'always');
    const savedActivated = Array.isArray(assistantMsg.activated_entries) ? assistantMsg.activated_entries : [];
    const seenIds = new Set(alwaysEntries.map((e) => e.id));
    const triggeredEntries = [];
    for (const item of savedActivated) {
      if (!item?.id || seenIds.has(item.id)) continue;
      const full = getWorldPromptEntryById(item.id);
      if (!full) continue;
      triggeredEntries.push(full);
      seenIds.add(item.id);
    }
    const contextEntries = [...alwaysEntries, ...triggeredEntries];
    const entriesDesc = contextEntries.length > 0
      ? contextEntries.map((e) => `### ${e.title || '（无标题）'}\n${e.content || ''}`.trim()).join('\n\n')
      : '（无世界书条目）';

    const task = [
      '## 用户输入',
      userMsg?.content ? userMsg.content : '（无用户输入）',
      '',
      '## AI 回复',
      assistantMsg.content || '（内容为空）',
      '',
      `## 世界书条目（仅供参考世界设定，不要直接照抄）\n${entriesDesc}`,
      '',
      `## 世界中已有角色（请排除）\n${existingNames}`,
      '',
      `## 角色状态字段定义\n${sfDesc}`,
    ].join('\n');

    log.info(`extract-chars START  ${formatMeta({ worldId, sessionId, existingCount: existingChars.length, sfCount: stateFields.length, entryCount: contextEntries.length })}`);

    const messages = buildAgentMessages('extract_characters', task);
    const config = getConfig();
    const configScope = config.assistant?.model_source === 'aux' ? 'aux' : 'main';
    let raw = await llm.complete(messages, { temperature: 0.3, thinking_level: null, configScope });

    function parseCharacterArray(text) {
      const s = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      const codeMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const src = codeMatch ? codeMatch[1].trim() : s;
      const parsed = JSON.parse(src);
      return Array.isArray(parsed) ? parsed : [];
    }

    let characters;
    try {
      characters = parseCharacterArray(raw);
    } catch {
      messages.push({ role: 'assistant', content: raw });
      messages.push({ role: 'user', content: '你的输出无法解析为合法 JSON 数组。请只输出一个 JSON 数组，不要代码块或解释。' });
      raw = await llm.complete(messages, { temperature: 0.3, thinking_level: null, configScope });
      try { characters = parseCharacterArray(raw); }
      catch { characters = []; }
    }

    // 已有角色名集合，用于去重
    const existingNameSet = new Set(existingChars.map((c) => c.name.trim().toLowerCase()));

    // 过滤掉已存在的角色
    const newCharacters = characters.filter((charData) => {
      const name = (charData.name || '').trim();
      if (!name) return false;
      if (existingNameSet.has(name.toLowerCase())) {
        log.info(`extract-chars SKIP_DUP  ${formatMeta({ name })}`);
        return false;
      }
      return true;
    });

    log.info(`extract-chars FOUND  ${formatMeta({ count: newCharacters.length })}`);

    if (dryRun) {
      // 只返回提取结果，不创建
      sendSSE(res, { type: 'characters_extracted', characters: newCharacters, count: newCharacters.length });
    } else {
      sendSSE(res, { type: 'extract_done', count: newCharacters.length });
      for (const charData of newCharacters) {
        const name = charData.name.trim();
        sendSSE(res, { type: 'character_found', name });
        let char;
        try {
          char = createCharacter({
            world_id: worldId,
            name,
            description: charData.description || '',
            system_prompt: charData.system_prompt || '',
            post_prompt: charData.post_prompt || '',
            first_message: charData.first_message || '',
          });
          if (stateFields.length > 0 && charData.state_values && typeof charData.state_values === 'object') {
            for (const [key, val] of Object.entries(charData.state_values)) {
              if (stateFields.some((f) => f.field_key === key)) {
                upsertCharacterStateValue(char.id, key, { defaultValueJson: JSON.stringify(val) });
              }
            }
          }
          addWritingSessionCharacter(sessionId, char.id);
          existingNameSet.add(name.toLowerCase());
          log.info(`extract-chars CREATED  ${formatMeta({ characterId: char.id, name: char.name })}`);
          sendSSE(res, { type: 'card_activated', characterId: char.id, character: char });
        } catch (charErr) {
          if (char?.id) { try { dbDeleteCharacter(char.id); } catch { /* ignore */ } }
          log.error(`extract-chars CHAR_FAIL  ${formatMeta({ name, error: charErr.message })}`);
          sendSSE(res, { type: 'error', error: `角色「${name}」创建失败：${charErr.message}` });
        }
      }
    }
  } catch (err) {
    log.error(`extract-chars FAIL  ${formatMeta({ error: err.message })}`);
    sendSSE(res, { type: 'error', error: err.message });
  }

  endSSE(res);
});

// ─── POST /api/assistant/confirm-characters ──────────────────────────
// 接收前端预览确认后的角色数组，创建角色卡并激活到会话
// SSE 事件：card_activated / error / done

router.post('/confirm-characters', async (req, res) => {
  const { worldId, sessionId, characters } = req.body ?? {};
  if (!worldId || !sessionId || !Array.isArray(characters) || characters.length === 0) {
    return res.status(400).json({ error: 'worldId、sessionId、characters（非空数组）均为必填项' });
  }

  const session = getWritingSessionById(sessionId);
  if (!session || session.world_id !== worldId) {
    return res.status(400).json({ error: '会话不存在或不属于指定世界' });
  }

  openSSE(res);

  try {
    const existingChars = getCharactersByWorldId(worldId);
    const stateFields = listCharacterStateFields(worldId);
    const existingNameSet = new Set(existingChars.map((c) => c.name.trim().toLowerCase()));

    for (const charData of characters) {
      const name = (charData.name || '').trim();
      if (!name) continue;

      if (existingNameSet.has(name.toLowerCase())) {
        log.info(`confirm-chars SKIP_DUP  ${formatMeta({ name })}`);
        continue;
      }

      let char;
      try {
        char = createCharacter({
          world_id: worldId,
          name,
          description: charData.description || '',
          system_prompt: charData.system_prompt || '',
          post_prompt: charData.post_prompt || '',
          first_message: charData.first_message || '',
        });

        if (stateFields.length > 0 && charData.state_values && typeof charData.state_values === 'object') {
          for (const [key, val] of Object.entries(charData.state_values)) {
            if (stateFields.some((f) => f.field_key === key)) {
              upsertCharacterStateValue(char.id, key, { defaultValueJson: JSON.stringify(val) });
            }
          }
        }

        addWritingSessionCharacter(sessionId, char.id);
        existingNameSet.add(name.toLowerCase());
        log.info(`confirm-chars CREATED  ${formatMeta({ characterId: char.id, name: char.name })}`);
        sendSSE(res, { type: 'card_activated', characterId: char.id, character: char });
      } catch (charErr) {
        if (char?.id) { try { dbDeleteCharacter(char.id); } catch { /* ignore */ } }
        log.error(`confirm-chars CHAR_FAIL  ${formatMeta({ name, error: charErr.message })}`);
        sendSSE(res, { type: 'error', error: `角色「${name}」创建失败：${charErr.message}` });
      }
    }
  } catch (err) {
    log.error(`confirm-chars FAIL  ${formatMeta({ error: err.message })}`);
    sendSSE(res, { type: 'error', error: err.message });
  }

  endSSE(res);
});

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
    emit({ type: 'research_started', taskId: task.id, task: updateTask(task.id, { status: 'researching' }) });
    const research = await researchTask({ message, context: enrichedContext });
    const researchedTask = updateTask(task.id, { research });
    emit({ type: 'research_ready', taskId: task.id, research, task: researchedTask });

    const planned = await planTask({ message, history, context: enrichedContext, research });
    if (planned.kind === 'clarify') {
      const next = updateTask(task.id, {
        status: 'clarifying',
        summary: planned.summary,
        pendingQuestions: planned.clarificationQuestions,
        research,
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
      updateTask(task.id, { status: 'executing', summary: planned.summary, research });
      await streamTaskAnswer({ res, task, message, history, context: enrichedContext });
      return;
    }

    const graph = compileTaskGraph(planned.steps);
    const riskFlags = classifyRiskFlags(graph);
    const planPayload = {
      summary: planned.summary,
      assumptions: planned.assumptions,
      researchSummary: research.summary,
      steps: graph,
    };

    if (isDirectExecute(graph, riskFlags, research)) {
      // 简单任务：跳过 plan_approval，直接执行；用 status='executing' 告知前端无需弹卡
      const next = updateTask(task.id, {
        status: 'executing',
        summary: planned.summary,
        plan: planPayload,
        graph,
        riskFlags,
        research,
      });
      emit({ type: 'plan_ready', taskId: task.id, plan: next.plan, riskFlags, task: next });
      await executeTaskSteps({ task: next, normalizeProposal, applyProposal, emit });
    } else {
      // 复杂任务（≥3步或有高风险）：等待用户确认
      const next = updateTask(task.id, {
        status: 'awaiting_plan_approval',
        summary: planned.summary,
        plan: planPayload,
        graph,
        riskFlags,
        research,
      });
      emit({ type: 'plan_ready', taskId: task.id, plan: next.plan, riskFlags, task: next });
    }
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
    emit({ type: 'research_started', taskId: task.id, task: nextBase });
    const research = await researchTask({ message: mergedMessage, context: task.context });
    const researchedTask = updateTask(task.id, { research });
    emit({ type: 'research_ready', taskId: task.id, research, task: researchedTask });

    const planned = await planTask({
      message: mergedMessage,
      history: task.sourceHistory || [],
      context: task.context,
      research,
    });
    if (planned.kind === 'clarify') {
      const next = updateTask(task.id, {
        status: 'clarifying',
        summary: planned.summary,
        pendingQuestions: planned.clarificationQuestions,
        research,
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
      updateTask(task.id, { status: 'executing', summary: planned.summary, research });
      await streamTaskAnswer({ res, task, message: mergedMessage, history: task.sourceHistory || [], context: task.context });
      return;
    }

    const graph = compileTaskGraph(planned.steps);
    const riskFlags = classifyRiskFlags(graph);
    const planPayload = {
      summary: planned.summary,
      assumptions: planned.assumptions,
      researchSummary: research.summary,
      steps: graph,
    };

    if (isDirectExecute(graph, riskFlags, research)) {
      const next = updateTask(task.id, {
        status: 'executing',
        summary: planned.summary,
        plan: planPayload,
        graph,
        riskFlags,
        research,
      });
      emit({ type: 'plan_ready', taskId: task.id, plan: next.plan, riskFlags, task: next });
      await executeTaskSteps({ task: next, normalizeProposal, applyProposal, emit });
    } else {
      const next = updateTask(task.id, {
        status: 'awaiting_plan_approval',
        summary: planned.summary,
        plan: planPayload,
        graph,
        riskFlags,
        research,
      });
      emit({ type: 'plan_ready', taskId: task.id, plan: next.plan, riskFlags, task: next });
    }
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
        stateValueOps: Array.isArray(editedProposal.stateValueOps) ? editedProposal.stateValueOps : base.stateValueOps,
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
        stateValueOps: Array.isArray(editedProposal.stateValueOps) ? editedProposal.stateValueOps : base.stateValueOps,
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
      stateValueOps: Array.isArray(effective.stateValueOps) ? effective.stateValueOps.length : undefined,
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

// ─── 提案执行器与归一化已移至 ./normalize-proposal.js ────────────

export const __testables = {
  normalizeProposal,
  normalizeEntryOps,
  normalizeStateFieldOps,
  normalizeStateValueOps,
  normalizeRegexRuleChanges,
  pickAllowed,
  deepOmit,
  proposalStore,
};

// === 新单代理端点 ===
import * as taskStore from './task-store.js';
import * as planDoc from './plan-doc.js';
import { runParentAgent } from './parent-agent.js';

router.post('/agent', async (req, res) => {
  const { taskId, message, context } = req.body ?? {};
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders?.();

  let task = taskId ? taskStore.getTask(taskId) : null;
  if (!task) {
    task = taskStore.createTask({ context });
    res.write(`data: ${JSON.stringify({ type: 'task_created', taskId: task.id, task })}\n\n`);
  }
  taskStore.attachSse(task.id, res);
  req.on('close', () => taskStore.detachSse(task.id, res));

  try {
    if (task.status === 'executing') {
      taskStore.queueUserMessage(task.id, message);
      // 不立即触发：当前 step 跑完 executor 自己会切 paused 并喂 pendingMessages
      return; // 保持连接
    }
    await runParentAgent(task, message);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'task_failed', taskId: task.id, error: err.message })}\n\n`);
  }
});

router.post('/agent/:taskId/approve', async (req, res) => {
  const task = taskStore.getTask(req.params.taskId);
  if (!task || task.status !== 'awaiting_approval') return res.status(400).json({ error: 'not awaiting approval' });
  taskStore.setStatus(task.id, 'executing');
  taskStore.emit(task.id, { type: 'plan_approved', taskId: task.id });
  // 触发 parent-agent 继续派发；用一个空消息触发执行循环
  runParentAgent(task, '<<approved>>').catch((err) => taskStore.emit(task.id, { type: 'task_failed', taskId: task.id, error: err.message }));
  res.json({ ok: true });
});

router.post('/agent/:taskId/cancel', async (req, res) => {
  const task = taskStore.getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'not found' });
  await planDoc.deletePlanDoc(task.id);
  taskStore.setStatus(task.id, 'cancelled');
  taskStore.emit(task.id, { type: 'task_cancelled', taskId: task.id });
  res.json({ ok: true });
});

router.get('/agent/:taskId/plan-doc', async (req, res) => {
  const content = await planDoc.readPlanDoc(req.params.taskId).catch(() => '');
  res.json({ content });
});

router.get('/agent/:taskId', (req, res) => {
  const task = taskStore.getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'not found' });
  res.json({ task });
});

export default router;
