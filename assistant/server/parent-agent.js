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
import { getCharactersByWorldId } from '../../backend/db/queries/characters.js';
import { getPersonasByWorldId } from '../../backend/db/queries/personas.js';
import { createLogger, formatMeta, previewText, summarizeMessages } from '../../backend/utils/logger.js';

import * as planDoc from './plan-doc.js';
import * as taskStore from './task-store.js';
import { loadWithCache } from './knowledge-cache.js';
import { stripThinkBlocks } from './strip-think.js';
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
// 收尾前的两道守卫分工不同、互补而非重复：
// - ACTION_CLAIM_RE / claimedExecutionWithoutRealAction：管 ad-hoc（无结构化计划）场景，
//   只能靠措辞判断模型是否"声称"自己执行了写入——因为这类场景没有可核对的结构化状态。
//   这条正则不能删：去掉它会让"用 preview_card 读一张卡然后回答用户"这类合法只读轮次
//   （已经调过工具、但没有计划、也没有 appliedResources 变化）被误判成"嘴上说做了却没做"。
// - findApprovedPlanPendingSteps（见下）：管已批准计划场景，直接读 planDoc 的结构化 status/steps，
//   与模型说了什么无关，能抓住"计划没做完就用 reply_to_user 宣告收尾"这类正则本身抓不住的说法。
const ACTION_CLAIM_RE = /(派发子代理|dispatch_subagent|调用子代理|(?:现在|接下来|马上|将|会|正在|开始|已|已经).{0,24}(?:创建|更新|删除|填写|填入|执行))/;

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

// 当前世界下的 personas / characters 概览：仅 id + name(+ is_active)，
// 让模型一眼看到"有多张卡"，详情仍走 preview_card / list_resources。
// 单张超过 ROSTER_LIMIT 截断，避免大世界把 prompt 撑爆。
const ROSTER_LIMIT = 40;

function renderRosterRow(row) {
  const id = row?.id ?? '';
  const name = typeof row?.name === 'string' && row.name.trim() ? row.name.trim() : '(未命名)';
  const active = row?.is_active ? ' [active]' : '';
  return `  - ${id} / ${name}${active}`;
}

function buildWorldRosterBlock(worldId) {
  if (!worldId) return null;
  let personas = [];
  let characters = [];
  try { personas = getPersonasByWorldId(worldId) ?? []; } catch { personas = []; }
  try { characters = getCharactersByWorldId(worldId) ?? []; } catch { characters = []; }
  if (personas.length === 0 && characters.length === 0) return null;

  const personaRows = personas.slice(0, ROSTER_LIMIT).map(renderRosterRow);
  const characterRows = characters.slice(0, ROSTER_LIMIT).map(renderRosterRow);
  const personaTail = personas.length > ROSTER_LIMIT ? [`  - …还有 ${personas.length - ROSTER_LIMIT} 条，需要时用 list_resources(target='personas', worldId='${worldId}') 查全部`] : [];
  const characterTail = characters.length > ROSTER_LIMIT ? [`  - …还有 ${characters.length - ROSTER_LIMIT} 条，需要时用 list_resources(target='characters', worldId='${worldId}') 查全部`] : [];

  return [
    '# 本世界资源清单（id + name，详情走 preview_card）',
    '',
    `- personas（共 ${personas.length}）:`,
    ...(personaRows.length > 0 ? personaRows : ['  - （无）']),
    ...personaTail,
    `- characters（共 ${characters.length}）:`,
    ...(characterRows.length > 0 ? characterRows : ['  - （无）']),
    ...characterTail,
  ].join('\n');
}

function buildContextBlock(task, planDocContent, turnTrigger = null) {
  const lastToolFailure = task?.lastToolFailure
    ? `- 最近一次工具失败：${task.lastToolFailure.toolName ?? 'unknown'} / ${task.lastToolFailure.error ?? 'unknown'}`
    : '- 最近一次工具失败：无';
  const lastSubagentResult = task?.lastSubagentResult
    ? `- 最近一次子代理结果：${task.lastSubagentResult.stepId ?? 'adhoc'} / ${task.lastSubagentResult.success ? 'ok' : 'error'}${task.lastSubagentResult.error ? ` / ${task.lastSubagentResult.error}` : ''}`
    : '- 最近一次子代理结果：无';
  const rosterBlock = buildWorldRosterBlock(task?.context?.worldId ?? null);

  return [
    // turnTrigger 用于显式告知模型本轮是被审批/恢复事件唤醒的（不写进 task.messages 历史，
    // 只在本轮 prompt 里出现），避免模型只看到 status=running 无从判断该执行什么。
    ...(turnTrigger
      ? ['# 本轮触发器', '', turnTrigger, '']
      : []),
    '# 任务上下文',
    '',
    `- status: ${task.status}`,
    `- worldId: ${task.context?.worldId ?? 'null'}`,
    `- characterId: ${task.context?.characterId ?? 'null'}`,
    `- loopIteration: ${task.loopIteration ?? 0}`,
    lastToolFailure,
    lastSubagentResult,
    ...(rosterBlock ? ['', rosterBlock] : []),
    '',
    '# 本轮已落地变更',
    '',
    renderAppliedResources(task),
    '',
    '# 最近运行痕迹',
    '',
    summarizeRecentRuntimeMessages(task),
    '',
    '# 当前计划文档',
    '',
    planDocContent || '（尚未生成）',
  ].join('\n');
}

// 从 user 消息序列中抽取"硬约束"片段：摘要 6 行可能丢字段名、ID、命名约定等关键决策，
// 先做规则提取，再把这些不可省略的片段单独附在摘要后。
const HARD_CONSTRAINT_PATTERNS = [
  /[^。！？\n]*(?:字段名|field_key|key)[^。！？\n]*(?:必须|应当|要求|是|为|=|叫)[^。！？\n]+/gi,
  /[^。！？\n]*(?:ID|id)\s*[:：=]\s*[^\s，。！？\n]+/g,
  /[^。！？\n]*(?:命名|命名规则|约定)[^。！？\n]+/g,
  /[^。！？\n]*(?:不要|禁止|必须|一定要|绝不|千万不要)[^。！？\n]+/g,
  /[^。！？\n]*(?:目标世界|目标角色|目标卡)[^。！？\n]+/g,
];

function extractHardConstraints(messages) {
  const found = new Set();
  for (const msg of messages) {
    if (msg.role !== 'user' || typeof msg.content !== 'string') continue;
    for (const re of HARD_CONSTRAINT_PATTERNS) {
      const matches = msg.content.match(re);
      if (!matches) continue;
      for (const m of matches) {
        const trimmed = m.trim();
        if (trimmed.length >= 4 && trimmed.length <= 120) found.add(trimmed);
      }
    }
  }
  return [...found].slice(0, 8);
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
  const rawSummary = String(await llm.complete(summaryMessages, {
    temperature: 0.2,
    thinking_level: null,
    configScope,
    cacheableSystem: systemPrompt,
  }) ?? '').trim();
  // LLM 长调用本身不可中断，但调用返回时若用户已 cancel，不写 modelContext，避免对已取消任务产生副作用。
  if (task.status === 'cancelled') return task.modelContext ?? null;
  const hardConstraints = extractHardConstraints(prefix);
  const summary = hardConstraints.length > 0
    ? `${rawSummary}\n\n# 不可省略的硬约束（自动提取自用户消息）\n${hardConstraints.map((s) => `- ${s}`).join('\n')}`
    : rawSummary;
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
  // 仅当本轮模型确实进入"执行模式"（至少调用过任意工具）时，才把"声称已执行"视为可疑。
  // 纯解释性回复（如"调用子代理是什么"、"解释 dispatch 流程"）没有任何 tool_call，
  // 旧逻辑会误把它当成"模型说做了但没做"，强行 pause 让用户感到困惑。
  const hasAnyToolCall = turnMessages.some((m) => m?.role === 'tool_call' || m?.role === 'step');
  if (!hasAnyToolCall) return false;
  const dispatchedSubagent = turnMessages.some((m) =>
    (m?.role === 'tool_call' && m.toolName === 'dispatch_subagent')
    || m?.role === 'step');
  const appliedCount = Array.isArray(task?.appliedResources) ? task.appliedResources.length : 0;
  return !dispatchedSubagent && appliedCount <= startAppliedCount;
}

// 已批准计划是否还有未完成步骤——纯状态判定，与模型措辞无关。
// 只在 plan.status === 'approved' 时生效：awaiting_approval（未批准）不该拦，
// 计划被拒绝或被 delete_plan_doc 清掉后 readPlanData 返回 null，同样不拦。
async function findApprovedPlanPendingSteps(taskId) {
  const plan = await planDoc.readPlanData(taskId).catch(() => null);
  if (!plan || plan.status !== 'approved') return null;
  const steps = Array.isArray(plan.steps) ? plan.steps : [];
  const pending = steps.filter((s) => s?.done !== true);
  return pending.length > 0 ? pending : null;
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
      if (!message) return { success: false, error: 'reply_to_user 需要 non-empty message' };
      const terminal = args?.terminal !== false;
      const status = args?.status === 'failed' ? 'failed' : 'completed';
      throw new ToolLoopControlSignal(terminal ? TOOL_LOOP_SIGNAL.TERMINAL : TOOL_LOOP_SIGNAL.PAUSED, {
        message,
        terminalStatus: status,
      });
    },
  };
}

// runtime 失败：真实业务/异常失败，重试一般无效 → 阈值低
const CONSECUTIVE_RUNTIME_FAILURE_PAUSE_THRESHOLD = 3;
// precheck 失败：参数级格式错（task 截断、operation 缺失、entityRef 类型错等），模型读到清晰 error 就能自纠
// → 阈值显著放宽。截图里的"dispatch_subagent 连续失败 3 次"恰好是这一类，旧阈值 3 把模型卡死。
const CONSECUTIVE_PRECHECK_FAILURE_PAUSE_THRESHOLD = 8;
export const CONSECUTIVE_TOOL_FAILURES_PAUSE_REASON = 'consecutive tool failures';

function buildToolRegistry(task, emitFn, runId, options = {}) {
  const previewTool = createPreviewCardTool({
    worldId: task.context?.worldId ?? null,
    characterId: task.context?.characterId ?? null,
    world: task.context?.world ?? null,
    character: task.context?.character ?? null,
  });
  const cancelCheck = () => task.status === 'cancelled';
  const onCancelLog = (toolName) => log.warn(`TOOL_CANCELLED_MID_FLIGHT  ${formatMeta({ runId, taskId: task.id, tool: toolName })}`);
  // 连续失败熔断：本轮内连续 N 次失败 → 立即暂停等用户介入。
  // 模型在错误状态（参数错、entity 不存在、字段缺失等）下会反复重试同一个调用，
  // 即使加了 lastToolFailure 提示也修不动 —— 此时继续 burn token 收益为零。
  //
  // 失败分级：
  // - precheck（工具自报，参数级格式错）→ 阈值 8，给模型多次纠错机会
  // - runtime（其它失败，含 throw）→ 阈值 3，重试无意义就早停
  // 任何一种命中阈值都暂停；两边的计数在成功调用时一并清零。
  const afterCompleted = ({ success, error, name: toolName, failureKind }) => {
    if (success) {
      taskStore.resetConsecutiveFailure(task.id);
      return;
    }
    const isPrecheck = failureKind === 'precheck';
    const count = isPrecheck
      ? taskStore.bumpConsecutivePrecheckFailure(task.id)
      : taskStore.bumpConsecutiveFailure(task.id);
    const threshold = isPrecheck
      ? CONSECUTIVE_PRECHECK_FAILURE_PAUSE_THRESHOLD
      : CONSECUTIVE_RUNTIME_FAILURE_PAUSE_THRESHOLD;
    if (count >= threshold) {
      taskStore.resetConsecutiveFailure(task.id);
      log.warn(`CONSECUTIVE_FAILURE_PAUSE  ${formatMeta({ runId, taskId: task.id, tool: toolName, error, count, kind: failureKind ?? 'runtime' })}`);
      const hint = [
        `刚才 ${toolName} 连续失败 ${count} 次（最近一次：${error ?? '未知错误'}）。`,
        '为避免继续在错误状态下反复尝试，我先停下来。',
        '请告诉我下一步怎么处理（修改参数 / 跳过这一步 / 调整计划），我会按你的指示继续。',
      ].join('\n');
      throw new ToolLoopControlSignal(TOOL_LOOP_SIGNAL.PAUSED, {
        taskId: task.id,
        pauseReason: CONSECUTIVE_TOOL_FAILURES_PAUSE_REASON,
        message: hint,
      });
    }
  };
  const wrapOpts = { cancelCheck, onCancelLog, afterCompleted };

  const baseTools = [
    wrapToolEvents(toLLMTool(previewTool), emitFn, wrapOpts),
    wrapToolEvents(toLLMTool(listResources), emitFn, wrapOpts),
    wrapToolEvents(toLLMTool(READ_FILE_TOOL), emitFn, wrapOpts),
    wrapToolEvents(toLLMTool(buildReplyToUserTool()), emitFn, wrapOpts),
    ...buildMetaTools(task, emitFn, runId, options)
      .map((tool) => wrapToolEvents(toLLMTool(tool), emitFn, wrapOpts)),
  ];

  return baseTools;
}

async function streamAssistantText(task, text, emitFn) {
  const normalized = normalizeVisibleAssistantText(text);
  const stamped = taskStore.appendMessage(task.id, { role: 'assistant', content: '' });
  const assistantMsgId = stamped?.id ?? null;
  if (!assistantMsgId) return '';

  let emittedText = '';
  for (const chunk of chunkAssistantText(normalized)) {
    await yieldToEventLoop();
    if (task.status === 'cancelled') break;
    emittedText += chunk;
    emitFn({ type: SSE_EVENTS.DELTA, delta: chunk, messageId: assistantMsgId });
  }

  if (task.status === 'cancelled' && emittedText.length === 0) {
    taskStore.deleteMessage(task.id, assistantMsgId);
    return '';
  }
  taskStore.updateMessageContent(task.id, assistantMsgId, task.status === 'cancelled' ? emittedText : normalized);
  return task.status === 'cancelled' ? emittedText : normalized;
}

function normalizeVisibleAssistantText(text) {
  const raw = typeof text === 'string' ? text : String(text ?? '');
  if (!raw.includes('\\n')) return raw;
  // 只在"普通可见文案误把换行写成字面量 \n"时做归一化。
  // 若同一段文本还包含其它反斜杠转义、代码围栏或 JSON/正则常见符号，保留原样，避免破坏可复制内容。
  const strippedEscapedNewlines = raw.replace(/\\n/g, '');
  if (/\\/.test(strippedEscapedNewlines)) return raw;
  if (/```|`|[{}[\]]/.test(raw)) return raw;
  if (/\/[^/\n]*\\n[^/\n]*\//.test(raw)) return raw;
  return raw.replace(/\\n/g, '\n');
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
  taskStore.setApprovalCheckpoint(task.id, null);
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
  taskStore.setApprovalCheckpoint(task.id, null);
  taskStore.setStatus(task.id, 'failed', { error: errorTag });
  emitFn({ type: SSE_EVENTS.TASK_FAILED, taskId: task.id, error: errorTag, summary: finalText || undefined });
  emitTaskSnapshot(task, emitFn, { summary: finalText || undefined });
  emitFn({ type: SSE_EVENTS.DONE, done: true });
  taskStore.endAllSse(task.id);
}

async function finalizePaused(task, emitFn, message, pauseReason = null) {
  if (message) await streamAssistantText(task, message, emitFn);
  if (task.status === 'cancelled') {
    emitFn({ type: SSE_EVENTS.DONE, done: true });
    taskStore.endAllSse(task.id);
    return;
  }
  taskStore.setStatus(task.id, 'paused', { error: pauseReason ?? null });
  emitFn({ type: SSE_EVENTS.PAUSED, taskId: task.id, reason: pauseReason ?? undefined });
}

async function pauseForRecoverableHarnessIssue(task, emitFn, runId, reason, message) {
  log.warn(`RECOVERABLE_PAUSE  ${formatMeta({ runId, taskId: task.id, reason })}`);
  // 用一条短 step 条目代替完整 assistant 气泡：循环触发同一类软失败时屏幕不会被同段长文反复刷屏。
  // 标题取 buildXxxRecoveryMessage 的一句话即可；详细原因仍走 reason 字段进日志。
  if (task.status !== 'cancelled' && message) {
    const stepId = `harness-${randomUUID().slice(0, 8)}`;
    emitFn({ type: SSE_EVENTS.STEP_STARTED, stepId, title: message });
    emitFn({ type: SSE_EVENTS.STEP_FAILED, stepId, error: reason });
  }
  if (task.status === 'cancelled') {
    emitFn({ type: SSE_EVENTS.DONE, done: true });
    taskStore.endAllSse(task.id);
    return;
  }
  // error 字段打 HARNESS_RECOVERABLE_PAUSE_REASON 标记，客户端用其识别本类暂停、禁止自动 resume，
  // 避免"暂停→自动续传→再次软失败→再暂停"的死循环把屏幕铺满相同恢复气泡。
  taskStore.setStatus(task.id, 'paused', { error: HARNESS_RECOVERABLE_PAUSE_REASON });
  emitFn({ type: SSE_EVENTS.PAUSED, taskId: task.id, reason });
  emitTaskSnapshot(task, emitFn, { recoverable: true });
  emitFn({ type: SSE_EVENTS.DONE, done: true });
  taskStore.endAllSse(task.id);
}

// 子代理失败暂停：用 assistant 消息气泡展示，支持 <think> 折叠，而非压缩进 step title。
// 仍打 HARNESS_RECOVERABLE_PAUSE_REASON 防止自动 resume。
async function pauseSubagentFailed(task, emitFn, runId, reason, displayMessage) {
  log.warn(`SUBAGENT_FAIL_PAUSE  ${formatMeta({ runId, taskId: task.id, reason })}`);
  if (task.status !== 'cancelled' && displayMessage) {
    await streamAssistantText(task, displayMessage, emitFn);
  }
  if (task.status === 'cancelled') {
    emitFn({ type: SSE_EVENTS.DONE, done: true });
    taskStore.endAllSse(task.id);
    return;
  }
  taskStore.setStatus(task.id, 'paused', { error: HARNESS_RECOVERABLE_PAUSE_REASON });
  emitFn({ type: SSE_EVENTS.PAUSED, taskId: task.id, reason });
  emitTaskSnapshot(task, emitFn, { recoverable: true });
  emitFn({ type: SSE_EVENTS.DONE, done: true });
  taskStore.endAllSse(task.id);
}

// 三类 harness 软失败的"恢复文案"——挂在一条紧凑 step 条目的 title 上，
// 不再以完整 assistant 文本气泡播报，避免反复循环时屏幕被同一段话刷屏。
function buildEmptyReplyRecoveryMessage() {
  return '刚才没拿到完整回复，已暂停等你的下一句';
}

function buildClaimedExecutionRecoveryMessage() {
  return '刚才像是"已经做完了"但没真正落库，已暂停';
}

// pauseForRecoverableHarnessIssue 的 message 参数只落在一条紧凑 step 条目的 title 上，
// 且 summarizeRecentRuntimeMessages 渲染 step 消息时只取 status/error、不取 title——
// 也就是说 title 只在当次前端展示给用户看，不会原样回喂进模型下一轮的"最近运行痕迹"。
// 真正回到模型下一轮上下文的是 reason 参数（被存进该 step 消息的 error 字段）。
// 所以这条恢复消息在调用处会同时作为 reason 和 message 传入：
// 保证模型下一轮真的能看到"哪些步骤没做完 + 两条出路"，而不只是展示给用户看。
function buildIncompletePlanRecoveryMessage(pendingSteps) {
  const shown = pendingSteps.slice(0, 5);
  const lines = shown.map((s) => `- ${s?.id ?? '(无 id)'} ${s?.title ?? '(无标题)'}`.trim());
  const remaining = pendingSteps.length - shown.length;
  if (remaining > 0) lines.push(`- …等 ${remaining} 步`);
  return [
    '计划已批准，但以下步骤还没标记完成：',
    ...lines,
    '',
    '请继续调用 dispatch_subagent 执行剩余步骤；',
    '如果用户已经中途叫停、这份计划不用再做了，请先调用 delete_plan_doc 放弃这份计划，再回复用户收尾。',
  ].join('\n');
}

function buildProviderErrorRecoveryMessage(err) {
  const msg = err?.message ? `（${err.message}）` : '';
  return `刚才处理时出了点问题${msg}，已暂停`;
}

// task.error 上的标记：让客户端识别"harness 软失败暂停"，避免对其自动 resume。
export const HARNESS_RECOVERABLE_PAUSE_REASON = 'harness recoverable pause';

export async function runParentAgent(task, userInput, opts = {}) {
  if (!task) throw new Error('runParentAgent: task is required');

  const runId = opts.runId ?? randomUUID().slice(0, 8);
  const emitFn = (evt) => taskStore.emit(task.id, { ...evt, runId });
  const turnStartMessageCount = Array.isArray(task.messages) ? task.messages.length : 0;
  const turnStartAppliedCount = Array.isArray(task.appliedResources) ? task.appliedResources.length : 0;
  const resumeFromRejectedPlan = task.status === 'paused' && task.error === 'plan rejected by user';
  const approvalState = task.approvalCheckpoint?.status ?? null;
  const planApprovalPending = approvalState === 'pending';
  const planExecutionApproved = approvalState === 'approved';

  if (task.status === 'cancelled') {
    emitFn({ type: SSE_EVENTS.DONE, done: true });
    taskStore.endAllSse(task.id);
    return;
  }

  const isApprovedSentinel = userInput === APPROVED_SENTINEL;
  const isResumeSentinel = userInput === RESUME_SENTINEL;
  const modelUserInput = isApprovedSentinel
    ? '（系统）用户已批准当前计划。请勿发送任何口头确认——直接调用 dispatch_subagent 执行计划第一个未完成步骤。'
    : isResumeSentinel
      ? '（系统）刚才的写卡助手任务在后台恢复连接，请基于当前任务状态继续 agent loop，不要把这条系统恢复说明当成用户新需求。'
      : String(userInput ?? '');

  taskStore.setExecutionActive(task.id, true);
  try {
    if (!isApprovedSentinel && !isResumeSentinel) {
      // 新一轮 user turn:清空 appliedResources / 最近失败痕迹 / 连续失败计数，避免污染下一轮决策
      taskStore.clearAppliedResources(task.id);
      taskStore.setLastToolFailure(task.id, null);
      taskStore.setLastSubagentResult(task.id, null);
      taskStore.resetConsecutiveFailure(task.id);

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
    const toolRegistry = buildToolRegistry(task, emitFn, runId, {
      planDocExists: Boolean(planDocContent),
      planAlreadyApproved: isApprovedSentinel,
      planApprovalPending: planApprovalPending && !isApprovedSentinel,
      planExecutionApproved: planExecutionApproved || isApprovedSentinel,
      planRejectedNeedsRewrite: resumeFromRejectedPlan && Boolean(planDocContent),
    });
    await refreshModelContextIfNeeded(task, { configScope, systemPrompt, runId });
    const turnTrigger = (isApprovedSentinel || isResumeSentinel) ? modelUserInput : null;
    const modelPayload = buildModelMessages(task, systemPrompt, buildContextBlock(task, planDocContent, turnTrigger));

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

    const usageRef = {};
    const finalText = await llm.completeWithTools(modelPayload.messages, toolRegistry, {
      temperature: 0.3,
      thinking_level: null,
      configScope,
      cacheableSystem: systemPrompt,
      // usageRef 让父代理这条（含整段工具循环）的 token / cache 命中可见，进 COMPLETE_TOOLS DONE 日志。
      usageRef,
      callType: 'assistant-parent',
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
    const pendingApprovedSteps = await findApprovedPlanPendingSteps(task.id);
    if (pendingApprovedSteps) {
      const recoveryMessage = buildIncompletePlanRecoveryMessage(pendingApprovedSteps);
      await pauseForRecoverableHarnessIssue(task, emitFn, runId, recoveryMessage, recoveryMessage);
      return;
    }
    if (task.lastSubagentResult?.success === false) {
      const title = task.lastSubagentResult.title ?? task.lastSubagentResult.stepId ?? '子任务';
      const errDetail = stripThinkBlocks(task.lastSubagentResult.error ?? '未知错误');
      await pauseSubagentFailed(
        task, emitFn, runId,
        'model claimed completed but last subagent step failed',
        text
          ? `子任务"${title}"执行失败（${errDetail}），但助手误报了成功，已暂停。请告诉我如何处理这个失败步骤。`
          : `子任务"${title}"执行失败（${errDetail}），已暂停。请告诉我如何处理这个失败步骤。`,
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
        } else if (task.lastSubagentResult?.success === false) {
          const title = task.lastSubagentResult.title ?? task.lastSubagentResult.stepId ?? '子任务';
          const errDetail = stripThinkBlocks(task.lastSubagentResult.error ?? '未知错误');
          await pauseSubagentFailed(
            task, emitFn, runId,
            'model claimed completed but last subagent step failed',
            `子任务"${title}"执行失败（${errDetail}），但助手误报了成功，已暂停。请告诉我如何处理这个失败步骤。`,
          );
        } else {
          // reply_to_user(terminal=true) 是模型宣告收尾的主路径（比上面 try 主体里
          // "没调用任何工具、模型直接吐出终稿文本" 的兜底路径更常见），已批准计划
          // 未完成就收尾的守卫必须同样覆盖这里，否则在真实场景里基本不会触发。
          // terminal:false 走的是下面 TOOL_LOOP_SIGNAL.PAUSED 分支，不经过这里，不受影响。
          const pendingApprovedSteps = await findApprovedPlanPendingSteps(task.id);
          if (pendingApprovedSteps) {
            const recoveryMessage = buildIncompletePlanRecoveryMessage(pendingApprovedSteps);
            await pauseForRecoverableHarnessIssue(task, emitFn, runId, recoveryMessage, recoveryMessage);
          } else {
            await finalizeCompleted(task, emitFn, payload.message ?? '');
          }
        }
        return;
      }
      if (kind === TOOL_LOOP_SIGNAL.AWAITING_APPROVAL) {
        // write_plan_doc 工具内部已把 status 设为 awaiting_approval、emit 过事件
        return;
      }
      if (kind === TOOL_LOOP_SIGNAL.PAUSED) {
        // subagent 失败信号已经在 meta/runtime.js 内被改回 outcome.success:false，由父代理 LLM 自行决策；
        // 这里只剩"用户在执行中暂停 / 连续失败熔断 / 显式 pauseReason"等显式信号。
        if (payload?.message) {
          await finalizePaused(task, emitFn, payload.message, payload.pauseReason ?? payload.reason ?? null);
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
  renderAppliedResources,
  APPROVED_SENTINEL,
  RESUME_SENTINEL,
  yieldToEventLoop,
  buildToolRegistry,
  pauseForRecoverableHarnessIssue,
  extractHardConstraints,
  buildEmptyReplyRecoveryMessage,
  buildClaimedExecutionRecoveryMessage,
  buildProviderErrorRecoveryMessage,
  findApprovedPlanPendingSteps,
  buildIncompletePlanRecoveryMessage,
  normalizeVisibleAssistantText,
  CONSECUTIVE_TOOL_FAILURES_PAUSE_REASON,
};
