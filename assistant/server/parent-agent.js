import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as llm from '../../backend/llm/index.js';
import {
  isToolLoopCancelledError,
  isToolLoopControlSignal,
  ToolLoopControlSignal,
  TOOL_LOOP_SIGNAL,
} from '../../backend/llm/tool-loop-control.js';
import { getConfig } from '../../backend/services/config.js';
import { createLogger, formatMeta, previewText, summarizeMessages } from '../../backend/utils/logger.js';

import * as planDoc from './plan-doc.js';
import * as taskStore from './task-store.js';
import { loadWithCache } from './knowledge-cache.js';
import { SSE_EVENTS } from './sse-events.js';
import { toLLMTool, wrapToolEvents } from './tools/adapter.js';
import * as listResources from './tools/list-resources.js';
import { createPreviewCardTool } from './tools/card-preview.js';
import { READ_FILE_TOOL } from './tools/project-reader.js';
import { buildMetaTools } from './tools/meta/runtime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const log = createLogger('as-parent', 'cyan');

const PROMPT_PATH = path.resolve(__dirname, '../prompts/parent-agent.md');
const CONTRACT_PATH = path.resolve(__dirname, '../knowledge/CONTRACT.md');

export const APPROVED_SENTINEL = '<<approved>>';
export const RESUME_SENTINEL = '<<resume>>';
const ASSISTANT_CONTEXT_RAW_LIMIT = 8;
const ASSISTANT_CONTEXT_CHAR_LIMIT = 24_000;
const ASSISTANT_DELTA_CHUNK_SIZE = 48;
const MODEL_MESSAGE_ROLES = new Set(['user', 'assistant']);
const ACTION_CLAIM_RE = /(派发子代理|dispatch_subagent|调用子代理|(?:现在|接下来|马上|将|会|正在|开始|已|已经).{0,24}(?:创建|更新|删除|填写|填入|执行))/;
const EXPLICIT_PLAN_RE = /(先.*(计划|方案|步骤|确认|审批)|列.*(计划|方案|步骤)|plan|规划一下)/i;
const BASIC_ONLY_RE = /(只|仅)[^。！？\n]{0,18}(基础|名字|名称|简介|人设|空白|空卡|一项|单个)|暂不填状态|不填状态|不用填状态|不需要状态/;
const HIGH_RISK_RE = /(删除|移除|清空|覆盖|重置|替换全部|全部替换|批量删|删掉所有|清除所有|不可逆)/;
const MULTI_RESOURCE_RE = /(同时|并且|以及|和|含|包含|带上|附带|一起|顺便|再加).{0,32}(世界|玩家|persona|角色|character|条目|entry|状态|字段|CSS|正则|regex)/i;
const CARD_CREATE_RE = /(创建|新建|生成|做|建|设计)(?:一个|一张|新的|完整的|全套)?[^。！？\n]{0,28}(世界卡?|world-card|玩家卡?|persona|角色卡?|character)/i;
const COMPREHENSIVE_RE = /(完整|全套|一整套|体系|系统|骨架|从零|复杂|批量|多个|所有|全部|全字段|补全|填满|大量|一批|整套|完善|优化整体|整体优化)/;
const STRUCTURE_HEAVY_RE = /(状态字段|状态值|初始状态|初始值|stateFieldOps|stateValueOps|Prompt 条目|prompt 条目|条目体系|entryOps|关键词条目|AI召回|AI 召回|state 条目|lore|世界观条目)/i;
const SIMPLE_STATE_VALUE_RE = /(把|将|设置|改成|调整)[^。！？\n]{0,20}(金币|HP|血量|好感|等级|状态|字段)[^。！？\n]{0,16}(改成|设为|设置为|=|到)\s*[^，。！？\n]+$/;

function clearModelContext(task) {
  if (!task?.modelContext) return null;
  taskStore.setModelContext(task.id, null);
  return null;
}

function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function loadSystemPrompt() {
  const [prompt, contract] = await Promise.all([
    loadWithCache(PROMPT_PATH),
    loadWithCache(CONTRACT_PATH),
  ]);
  return `${prompt}\n\n---\n\n# 助手契约（每轮注入）\n\n${contract}`;
}

function summarizeRecentRuntimeMessages(task, limit = 6) {
  const messages = Array.isArray(task?.messages) ? task.messages : [];
  const rows = messages
    .filter((m) => m?.role === 'tool_call' || m?.role === 'step' || m?.role === 'plan_doc')
    .slice(-limit)
    .map((m) => {
      if (m.role === 'tool_call') {
        return `- tool:${m.toolName} status=${m.status}${m.error ? ` error=${m.error}` : ''}`;
      }
      if (m.role === 'step') {
        return `- step:${m.stepId ?? m.id} status=${m.status}${m.error ? ` error=${m.error}` : ''}`;
      }
      return '- plan_doc updated';
    });
  return rows.length > 0 ? rows.join('\n') : '（暂无）';
}

function renderAppliedResources(task) {
  const list = Array.isArray(task?.appliedResources) ? task.appliedResources : [];
  if (list.length === 0) return '（本轮尚未落地任何资源）';
  return list
    .map((e) => `- ${e.kind} / ${e.op}${e.stepId ? ` / step=${e.stepId}` : ''}${e.name ? ` / name="${e.name}"` : ''}${e.refId ? ` / id=${e.refId}` : ''}`)
    .join('\n');
}

function buildContextBlock(task, planDocContent, policyHints = []) {
  const lastToolFailure = task?.lastToolFailure
    ? `- 最近一次工具失败：${task.lastToolFailure.toolName ?? 'unknown'} / ${task.lastToolFailure.error ?? 'unknown'}`
    : '- 最近一次工具失败：无';
  const lastSubagentResult = task?.lastSubagentResult
    ? `- 最近一次子代理结果：${task.lastSubagentResult.stepId ?? 'adhoc'} / ${task.lastSubagentResult.ok ? 'ok' : 'error'}${task.lastSubagentResult.error ? ` / ${task.lastSubagentResult.error}` : ''}`
    : '- 最近一次子代理结果：无';

  return [
    '# 任务上下文',
    '',
    `- status: ${task.status}`,
    `- worldId: ${task.context?.worldId ?? 'null'}`,
    `- characterId: ${task.context?.characterId ?? 'null'}`,
    `- loopIteration: ${task.loopIteration ?? 0}`,
    lastToolFailure,
    lastSubagentResult,
    '',
    '# 本轮已落地变更',
    '',
    renderAppliedResources(task),
    '',
    '# 最近运行痕迹',
    '',
    summarizeRecentRuntimeMessages(task),
    ...(policyHints.length > 0
      ? [
          '',
          '# 本轮强制编排提示',
          '',
          ...policyHints.map((hint) => `- ${hint}`),
        ]
      : []),
    '',
    '# 当前计划文档',
    '',
    planDocContent || '（尚未生成）',
  ].join('\n');
}

function detectPlanFirstPolicy(userInput) {
  const text = String(userInput ?? '');
  if (!text.trim()) return { requiresPlanFirst: false, hints: [] };
  const explicitPlan = EXPLICIT_PLAN_RE.test(text);
  const highRisk = HIGH_RISK_RE.test(text);
  const multiResource = MULTI_RESOURCE_RE.test(text);
  const cardCreate = CARD_CREATE_RE.test(text);
  const comprehensive = COMPREHENSIVE_RE.test(text);
  const structureHeavy = STRUCTURE_HEAVY_RE.test(text);
  const basicOnly = BASIC_ONLY_RE.test(text);
  const simpleStateValue = SIMPLE_STATE_VALUE_RE.test(text) && !comprehensive && !multiResource;

  const requiresPlanFirst = explicitPlan
    || highRisk
    || multiResource
    || (cardCreate && !basicOnly)
    || (structureHeavy && (comprehensive || cardCreate || multiResource))
    || (comprehensive && !simpleStateValue && !basicOnly);

  if (!requiresPlanFirst) return { requiresPlanFirst: false, hints: [] };

  const reasons = [];
  if (explicitPlan) reasons.push('用户要求先计划或先确认');
  if (highRisk) reasons.push('包含删除 / 清空 / 覆盖 / 重置等高风险动作');
  if (multiResource) reasons.push('跨资源或多目标协作');
  if (cardCreate && !basicOnly) reasons.push('从零创建核心卡片，默认需要考虑配套条目与状态');
  if (structureHeavy) reasons.push('涉及状态字段 / 状态值 / Prompt 条目等结构化体系');
  if (comprehensive) reasons.push('包含完整、批量、全套、补全或整体优化语义');

  return {
    requiresPlanFirst: true,
    hints: [
      `这是需要计划的写卡任务：${reasons.join('；') || '需要多步拆解'}。`,
      '本轮必须先调用 write_plan_doc，不允许直接 dispatch_subagent；用户批准后再按计划逐步执行。',
      '计划要把读取/确认、字段或条目定义、资源创建/定位、值填写、核对验收拆开；跨资源任务用 dependsOn 串起真实依赖。',
      '若涉及 persona-card / character-card 状态值填写，每个 update 步骤只覆盖 3-5 个字段，并在 task 中列出本组所有 field_key、label、type 与目标 value_json，要求“不得遗漏本组字段”。',
    ],
  };
}

async function refreshModelContextIfNeeded(task, { configScope, systemPrompt, runId }) {
  const all = getModelHistoryMessages(task);
  const totalChars = summarizeMessages(all).chars;
  let prefixCount = Math.max(0, all.length - ASSISTANT_CONTEXT_RAW_LIMIT);
  if (prefixCount === 0 && all.length > 1 && totalChars > ASSISTANT_CONTEXT_CHAR_LIMIT) {
    prefixCount = all.length - 1;
  }
  if (prefixCount <= 0) return clearModelContext(task);

  const prefix = all.slice(0, prefixCount);
  const prefixChars = summarizeMessages(prefix).chars;
  if (prefix.length <= ASSISTANT_CONTEXT_RAW_LIMIT && prefixChars <= ASSISTANT_CONTEXT_CHAR_LIMIT) {
    return clearModelContext(task);
  }

  const lastSummaryId = task.modelContext?.summarizedUntilMessageId ?? null;
  const latestPrefixId = prefix.at(-1)?.id ?? null;
  if (lastSummaryId === latestPrefixId && task.modelContext?.summary) {
    return task.modelContext;
  }

  const summaryMessages = [
    {
      role: 'system',
      content: [
        '你在为写卡助手压缩对话上下文。',
        '输出 6 行以内中文摘要。',
        '只保留：用户目标、已确认约束、已完成/失败步骤、未决问题、下一步待办。',
        '不要复述无关细节，不要使用 Markdown 标题。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: prefix.map((m) => `${m.role}: ${m.content}`).join('\n\n'),
    },
  ];
  const summary = String(await llm.complete(summaryMessages, {
    temperature: 0.2,
    thinking_level: null,
    configScope,
    cacheableSystem: systemPrompt,
  }) ?? '').trim();
  const modelContext = {
    summary,
    summarizedUntilMessageId: latestPrefixId,
    sourceMessageCount: prefix.length,
    sourceChars: prefixChars,
  };
  taskStore.setModelContext(task.id, modelContext);
  log.info(`CONTEXT_SUMMARY  ${formatMeta({ runId, taskId: task.id, sourceMsgs: prefix.length, sourceChars: prefixChars, summaryChars: summary.length })}`);
  return modelContext;
}

function buildModelMessages(task, systemPrompt, contextBlock) {
  const all = getModelHistoryMessages(task);
  const modelContext = task.modelContext;
  let rawStart = 0;
  if (modelContext?.summarizedUntilMessageId) {
    const idx = all.findIndex((m) => m.id === modelContext.summarizedUntilMessageId);
    rawStart = idx >= 0 ? idx + 1 : 0;
  }
  const rawTail = all.slice(rawStart);
  const messages = [{ role: 'system', content: systemPrompt }];
  if (modelContext?.summary) {
    messages.push({
      role: 'system',
      content: [
        '# 历史摘要',
        modelContext.summary,
        `（已压缩 ${modelContext.sourceMessageCount ?? 0} 条消息，约 ${modelContext.sourceChars ?? 0} 字）`,
      ].join('\n'),
    });
  }
  messages.push(...rawTail.map((m) => ({ role: m.role, content: m.content })));
  messages.push({ role: 'user', content: contextBlock });
  return {
    messages,
    contextCharsBefore: summarizeMessages(all).chars,
    contextCharsAfter: summarizeMessages(rawTail).chars + String(modelContext?.summary ?? '').length + contextBlock.length,
    summaryUsed: Boolean(modelContext?.summary),
    tailMessageCount: rawTail.length,
  };
}

function getModelHistoryMessages(task) {
  return (Array.isArray(task?.messages) ? task.messages : [])
    .filter((m) => MODEL_MESSAGE_ROLES.has(m?.role))
    .map((m) => ({ role: m.role, content: m.content ?? '', id: m.id }));
}

function chunkAssistantText(text, chunkSize = ASSISTANT_DELTA_CHUNK_SIZE) {
  const raw = String(text ?? '');
  if (!raw) return [];
  const chunks = [];
  for (let i = 0; i < raw.length; i += chunkSize) {
    chunks.push(raw.slice(i, i + chunkSize));
  }
  return chunks;
}

function claimedExecutionWithoutRealAction(task, startMessageCount, startAppliedCount, text) {
  const reply = String(text ?? '').trim();
  if (!reply || !ACTION_CLAIM_RE.test(reply)) return false;
  const turnMessages = (Array.isArray(task?.messages) ? task.messages : []).slice(startMessageCount);
  const dispatchedSubagent = turnMessages.some((m) =>
    (m?.role === 'tool_call' && m.toolName === 'dispatch_subagent')
    || m?.role === 'step');
  const appliedCount = Array.isArray(task?.appliedResources) ? task.appliedResources.length : 0;
  return !dispatchedSubagent && appliedCount <= startAppliedCount;
}

function buildReplyToUserTool() {
  return {
    definition: {
      name: 'reply_to_user',
      description: '向用户输出最终答复，结束当前 agent loop。terminal=true（默认）= 任务完成；terminal=false = 任务暂停等待用户继续。需要标记失败时把 status 设为 "failed"。',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: '展示给用户的纯文本回复' },
          terminal: { type: 'boolean', description: '是否结束当前 user-turn，默认 true' },
          status: { type: 'string', enum: ['completed', 'failed'], description: 'terminal=true 时的终态，默认 completed' },
        },
        required: ['message'],
      },
    },
    execute: async (args) => {
      const message = String(args?.message ?? '').trim();
      if (!message) return { ok: false, error: 'reply_to_user 需要 non-empty message' };
      const terminal = args?.terminal !== false;
      const status = args?.status === 'failed' ? 'failed' : 'completed';
      throw new ToolLoopControlSignal(terminal ? TOOL_LOOP_SIGNAL.TERMINAL : TOOL_LOOP_SIGNAL.PAUSED, {
        message,
        terminalStatus: status,
      });
    },
  };
}

function buildToolRegistry(task, emitFn, runId, options = {}) {
  const previewTool = createPreviewCardTool({
    worldId: task.context?.worldId ?? null,
    characterId: task.context?.characterId ?? null,
    world: task.context?.world ?? null,
    character: task.context?.character ?? null,
  });
  const cancelCheck = () => task.status === 'cancelled';
  const onCancelLog = (toolName) => log.warn(`TOOL_CANCELLED_MID_FLIGHT  ${formatMeta({ runId, taskId: task.id, tool: toolName })}`);
  const wrapOpts = { cancelCheck, onCancelLog };

  const baseTools = [
    wrapToolEvents(toLLMTool(previewTool), emitFn, wrapOpts),
    wrapToolEvents(toLLMTool(listResources), emitFn, wrapOpts),
    wrapToolEvents(toLLMTool(READ_FILE_TOOL), emitFn, wrapOpts),
    wrapToolEvents(toLLMTool(buildReplyToUserTool()), emitFn, wrapOpts),
    ...buildMetaTools(task, emitFn, runId, options)
      .filter((tool) => tool.definition?.name !== 'finalize_task')
      .map((tool) => wrapToolEvents(toLLMTool(tool), emitFn, wrapOpts)),
  ];

  return baseTools;
}

async function streamAssistantText(task, text, emitFn) {
  const stamped = taskStore.appendMessage(task.id, { role: 'assistant', content: '' });
  const assistantMsgId = stamped?.id ?? null;
  if (!assistantMsgId) return '';

  let emittedText = '';
  for (const chunk of chunkAssistantText(text)) {
    await yieldToEventLoop();
    if (task.status === 'cancelled') break;
    emittedText += chunk;
    emitFn({ type: SSE_EVENTS.DELTA, delta: chunk, messageId: assistantMsgId });
  }

  if (task.status === 'cancelled' && emittedText.length === 0) {
    taskStore.deleteMessage(task.id, assistantMsgId);
    return '';
  }
  taskStore.updateMessageContent(task.id, assistantMsgId, task.status === 'cancelled' ? emittedText : text);
  return task.status === 'cancelled' ? emittedText : text;
}

function emitTaskSnapshot(task, emitFn, extras = {}) {
  emitFn({ type: SSE_EVENTS.TASK_SNAPSHOT, taskId: task.id, task: taskStore.buildTaskSnapshot(task), ...extras });
}

async function finalizeCompleted(task, emitFn, message) {
  const finalText = message ? await streamAssistantText(task, message, emitFn) : '';
  if (task.status === 'cancelled') {
    emitFn({ type: SSE_EVENTS.DONE, done: true });
    taskStore.endAllSse(task.id);
    return;
  }
  taskStore.setStatus(task.id, 'completed', { error: null });
  emitFn({ type: SSE_EVENTS.TASK_COMPLETED, taskId: task.id, summary: finalText });
  emitTaskSnapshot(task, emitFn, { summary: finalText });
  emitFn({ type: SSE_EVENTS.DONE, done: true });
  taskStore.endAllSse(task.id);
}

async function finalizeFailed(task, emitFn, message, errorTag) {
  const finalText = message ? await streamAssistantText(task, message, emitFn) : '';
  if (task.status === 'cancelled') {
    emitFn({ type: SSE_EVENTS.DONE, done: true });
    taskStore.endAllSse(task.id);
    return;
  }
  taskStore.setStatus(task.id, 'failed', { error: errorTag });
  emitFn({ type: SSE_EVENTS.TASK_FAILED, taskId: task.id, error: errorTag, summary: finalText || undefined });
  emitTaskSnapshot(task, emitFn, { summary: finalText || undefined });
  emitFn({ type: SSE_EVENTS.DONE, done: true });
  taskStore.endAllSse(task.id);
}

async function finalizePaused(task, emitFn, message) {
  if (message) await streamAssistantText(task, message, emitFn);
  if (task.status === 'cancelled') {
    emitFn({ type: SSE_EVENTS.DONE, done: true });
    taskStore.endAllSse(task.id);
    return;
  }
  taskStore.setStatus(task.id, 'paused', { error: null });
  emitFn({ type: SSE_EVENTS.PAUSED, taskId: task.id });
}

async function pauseForRecoverableHarnessIssue(task, emitFn, runId, reason, message) {
  log.warn(`RECOVERABLE_PAUSE  ${formatMeta({ runId, taskId: task.id, reason })}`);
  const finalText = message ? await streamAssistantText(task, message, emitFn) : '';
  if (task.status === 'cancelled') {
    emitFn({ type: SSE_EVENTS.DONE, done: true });
    taskStore.endAllSse(task.id);
    return;
  }
  taskStore.setStatus(task.id, 'paused', { error: null });
  emitFn({ type: SSE_EVENTS.PAUSED, taskId: task.id, reason });
  emitTaskSnapshot(task, emitFn, { summary: finalText || undefined, recoverable: true });
  emitFn({ type: SSE_EVENTS.DONE, done: true });
  taskStore.endAllSse(task.id);
}

function buildEmptyReplyRecoveryMessage() {
  return [
    '我这轮没有拿到有效的模型回复，所以先停在这里，避免把空结果当成完成。',
    '你可以直接继续追问或换个说法，我会沿用当前上下文继续处理。',
  ].join('\n');
}

function buildClaimedExecutionRecoveryMessage() {
  return [
    '我刚才没有拿到真实的子代理执行记录，所以不会把“已执行/已创建”当成完成结果。',
    '我已先停住。你可以直接继续说明要做的改动，我会重新按工具结果推进。',
  ].join('\n');
}

function buildProviderErrorRecoveryMessage(err) {
  const msg = err?.message ? `：${err.message}` : '';
  return [
    `这轮模型调用没有成功${msg}`,
    '我已保留当前任务上下文。你可以继续追问，或调整模型配置后再继续。',
  ].join('\n');
}

export async function runParentAgent(task, userInput, opts = {}) {
  if (!task) throw new Error('runParentAgent: task is required');

  const runId = opts.runId ?? randomUUID().slice(0, 8);
  const emitFn = (evt) => taskStore.emit(task.id, { ...evt, runId });
  const turnStartMessageCount = Array.isArray(task.messages) ? task.messages.length : 0;
  const turnStartAppliedCount = Array.isArray(task.appliedResources) ? task.appliedResources.length : 0;

  if (task.status === 'cancelled') {
    emitFn({ type: SSE_EVENTS.DONE, done: true });
    taskStore.endAllSse(task.id);
    return;
  }

  const isApprovedSentinel = userInput === APPROVED_SENTINEL;
  const isResumeSentinel = userInput === RESUME_SENTINEL;
  const modelUserInput = isApprovedSentinel
    ? '（系统）用户已批准当前计划，请继续 agent loop。'
    : isResumeSentinel
      ? '（系统）刚才的写卡助手任务在后台恢复连接，请基于当前任务状态继续 agent loop，不要把这条系统恢复说明当成用户新需求。'
      : String(userInput ?? '');

  taskStore.setExecutionActive(task.id, true);
  try {
    if (!isApprovedSentinel && !isResumeSentinel) {
      // 新一轮 user turn:清空 appliedResources / 最近失败痕迹，避免污染下一轮决策
      taskStore.clearAppliedResources(task.id);
      taskStore.setLastToolFailure(task.id, null);
      taskStore.setLastSubagentResult(task.id, null);

      const stampedUser = taskStore.appendMessage(task.id, {
        id: opts.userMessageId,
        role: 'user',
        content: modelUserInput,
      });
      if (stampedUser) {
        emitFn({ type: SSE_EVENTS.USER_MESSAGE, taskId: task.id, messageId: stampedUser.id });
      }
    }

    // drain 任何在 idle 间隙堆积的 pending 用户消息
    const pending = taskStore.takeUserMessages(task.id);
    for (const m of pending) {
      const stamped = taskStore.appendMessage(task.id, { role: 'user', content: m });
      if (stamped) emitFn({ type: SSE_EVENTS.USER_MESSAGE, taskId: task.id, messageId: stamped.id });
    }

    taskStore.setStatus(task.id, 'running', { error: null });
    emitTaskSnapshot(task, emitFn);
    taskStore.incrementLoopIteration(task.id);

    const systemPrompt = await loadSystemPrompt();
    const config = getConfig();
    const configScope = config.assistant?.model_source === 'aux' ? 'aux' : 'main';
    const planDocContent = await planDoc.readPlanDoc(task.id).catch(() => '');
    const planPolicy = detectPlanFirstPolicy(modelUserInput);
    const toolRegistry = buildToolRegistry(task, emitFn, runId, {
      requiresPlanFirst: planPolicy.requiresPlanFirst,
      planDocExists: Boolean(planDocContent),
    });
    await refreshModelContextIfNeeded(task, { configScope, systemPrompt, runId });
    const modelPayload = buildModelMessages(task, systemPrompt, buildContextBlock(task, planDocContent, planPolicy.hints));

    log.info(`START  ${formatMeta({
      runId,
      taskId: task.id,
      status: task.status,
      sentinel: isApprovedSentinel ? 'approved' : isResumeSentinel ? 'resume' : null,
      msgs: task.messages.length,
      contextCharsAfter: modelPayload.contextCharsAfter,
      summaryUsed: modelPayload.summaryUsed,
      tailMessageCount: modelPayload.tailMessageCount,
      input: previewText(modelUserInput, { limit: 120 }),
    })}`);

    const finalText = await llm.completeWithTools(modelPayload.messages, toolRegistry, {
      temperature: 0.3,
      thinking_level: null,
      configScope,
      cacheableSystem: systemPrompt,
    });
    if (task.status === 'cancelled') {
      emitFn({ type: SSE_EVENTS.DONE, done: true });
      taskStore.endAllSse(task.id);
      return;
    }
    const text = String(finalText ?? '').trim();
    if (!text) {
      await pauseForRecoverableHarnessIssue(
        task,
        emitFn,
        runId,
        'model returned empty final reply without calling reply_to_user',
        buildEmptyReplyRecoveryMessage(),
      );
      return;
    }
    if (claimedExecutionWithoutRealAction(task, turnStartMessageCount, turnStartAppliedCount, text)) {
      await pauseForRecoverableHarnessIssue(
        task,
        emitFn,
        runId,
        'model claimed it dispatched or executed work without a real dispatch_subagent step',
        buildClaimedExecutionRecoveryMessage(),
      );
      return;
    }
    await finalizeCompleted(task, emitFn, text);
  } catch (err) {
    if (isToolLoopCancelledError(err) && task.status === 'cancelled') {
      log.info(`CANCELLED  ${formatMeta({ runId, taskId: task.id })}`);
      emitFn({ type: SSE_EVENTS.DONE, done: true });
      taskStore.endAllSse(task.id);
      return;
    }
    if (isToolLoopControlSignal(err)) {
      const { kind, payload = {} } = err;
      log.info(`CONTROL  ${formatMeta({ runId, taskId: task.id, kind, terminalStatus: payload.terminalStatus })}`);
      if (kind === TOOL_LOOP_SIGNAL.TERMINAL) {
        if (payload.terminalStatus === 'failed') {
          await finalizeFailed(task, emitFn, payload.message ?? '', payload.message ?? 'task failed');
        } else {
          await finalizeCompleted(task, emitFn, payload.message ?? '');
        }
        return;
      }
      if (kind === TOOL_LOOP_SIGNAL.AWAITING_APPROVAL) {
        // write_plan_doc 工具内部已把 status 设为 awaiting_approval、emit 过事件
        return;
      }
      if (kind === TOOL_LOOP_SIGNAL.PAUSED) {
        if (payload?.message) {
          await finalizePaused(task, emitFn, payload.message);
        }
        return;
      }
    }
    await pauseForRecoverableHarnessIssue(
      task,
      emitFn,
      runId,
      err.message || 'unknown error',
      buildProviderErrorRecoveryMessage(err),
    );
  } finally {
    taskStore.setExecutionActive(task.id, false);
  }
}

export const __testables = {
  toLLMTool,
  buildContextBlock,
  buildMetaTools,
  chunkAssistantText,
  clearModelContext,
  getModelHistoryMessages,
  buildModelMessages,
  loadSystemPrompt,
  buildReplyToUserTool,
  claimedExecutionWithoutRealAction,
  detectPlanFirstPolicy,
  renderAppliedResources,
  APPROVED_SENTINEL,
  RESUME_SENTINEL,
  yieldToEventLoop,
  buildToolRegistry,
  pauseForRecoverableHarnessIssue,
};
