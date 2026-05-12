/**
 * 父代理（编排者）
 *
 * runParentAgent(task, userInput) → Promise<void>
 *
 * 一次完整的单通道工具循环：
 *   1. 拼装 system prompt（parent-agent.md + CONTRACT.md，每轮注入）
 *   2. 取出 task.messages 作为对话历史，并附加一条上下文 user 消息（status / worldId / characterId / plan-doc 全文）
 *   3. 把 userInput 入栈到 task.messages（包含 `<<approved>>` sentinel 的特殊化处理）
 *   4. 调 backend/llm/completeWithToolsDetailed 走非流式 tool-use 循环，拿到最终文本 + 富化后的 messages
 *   5. 若本轮有普通 assistant 文本，则服务端按固定窗口切片，逐条发 `delta` SSE 事件（带 messageId）
 *   6. 文本切片发送完毕后回填 assistant 消息，并发 `done` 事件
 *
 * 注意：
 *   - 父代理不再在工具循环后额外发起第二次 `llm.chat()`；普通文本回复必须在同一轮 tool-loop 终态给出。
 *   - LLM 提供商若非流式 + tool-use，则降级为 complete()；这里不区分。
 *   - apply_* 工具的异常被捕获并以 { ok:false, error } 形式返回给 LLM，让它在循环内自行重试。
 *   - 5 个编排专用工具（write_plan_doc / edit_plan_doc / dispatch_subagent / delete_plan_doc / finalize_task）
 *     的 schema 定义在 ./tools/meta/，runtime execute 闭包在 ./tools/meta/runtime.js 构造。
 *     `toLLMTool` / `wrapToolEvents` 已下沉到 ./tools/adapter.js。
 */

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as llm from '../../backend/llm/index.js';
import {
  isToolLoopCancelledError,
  isToolLoopControlSignal,
  TOOL_LOOP_SIGNAL,
} from '../../backend/llm/tool-loop-control.js';
import { getConfig } from '../../backend/services/config.js';
import { createLogger, formatMeta, previewText, summarizeMessages } from '../../backend/utils/logger.js';

import * as planDoc from './plan-doc.js';
import * as taskStore from './task-store.js';

import { SSE_EVENTS } from './sse-events.js';
import { toLLMTool, wrapToolEvents } from './tools/adapter.js';
import * as applyWorldCard from './tools/apply-world-card.js';
import * as applyCharacterCard from './tools/apply-character-card.js';
import * as applyPersonaCard from './tools/apply-persona-card.js';
import * as applyGlobalConfig from './tools/apply-global-config.js';
import * as applyCssSnippet from './tools/apply-css-snippet.js';
import * as applyRegexRule from './tools/apply-regex-rule.js';
import * as listResources from './tools/list-resources.js';
import { createPreviewCardTool } from './tools/card-preview.js';
import { READ_FILE_TOOL } from './tools/project-reader.js';
import { buildMetaTools } from './tools/meta/runtime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const log = createLogger('as-parent', 'cyan');

const PROMPT_PATH = path.resolve(__dirname, '../prompts/parent-agent.md');
const CONTRACT_PATH = path.resolve(__dirname, '../knowledge/CONTRACT.md');

const APPLY_TOOLS = {
  apply_world_card: applyWorldCard,
  apply_character_card: applyCharacterCard,
  apply_persona_card: applyPersonaCard,
  apply_global_config: applyGlobalConfig,
  apply_css_snippet: applyCssSnippet,
  apply_regex_rule: applyRegexRule,
};

const APPROVED_SENTINEL = '<<approved>>';
const ASSISTANT_CONTEXT_RAW_LIMIT = 8;
const ASSISTANT_CONTEXT_CHAR_LIMIT = 24_000;
const ASSISTANT_DELTA_CHUNK_SIZE = 48;
const MODEL_MESSAGE_ROLES = new Set(['user', 'assistant']);

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
    readFile(PROMPT_PATH, 'utf-8'),
    readFile(CONTRACT_PATH, 'utf-8'),
  ]);
  return `${prompt}\n\n---\n\n# 助手契约（每轮注入）\n\n${contract}`;
}

/**
 * 包装 apply_* execute：捕获异常并转为 { ok:false, error } 让 LLM 在 tool 循环内重试。
 */
function wrapApply(applyMod, ctx) {
  return async (args) => {
    try {
      const res = await applyMod.execute(args, ctx);
      return { ok: true, ...res };
    } catch (err) {
      log.warn(`APPLY FAIL  ${formatMeta({ tool: applyMod.definition?.name, error: err.message })}`);
      return { ok: false, error: err.message };
    }
  };
}

function buildContextBlock(task, planDocContent) {
  return [
    `# 任务上下文`,
    ``,
    `- status: ${task.status}`,
    `- worldId: ${task.context?.worldId ?? 'null'}`,
    `- characterId: ${task.context?.characterId ?? 'null'}`,
    ``,
    `# 当前计划文档`,
    ``,
    planDocContent ? planDocContent : '（尚未生成）',
  ].join('\n');
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

export async function runParentAgent(task, userInput, opts = {}) {
  if (!task) throw new Error('runParentAgent: task is required');

  const runId = opts.runId ?? randomUUID().slice(0, 8);

  // sentinel：/approve 触发执行循环
  const isApprovedSentinel = userInput === APPROVED_SENTINEL;
  const visibleUserInput = isApprovedSentinel
    ? '（系统）用户已确认计划，请按 plan doc 顺序派发未完成步骤。'
    : String(userInput ?? '');

  const stampedUser = taskStore.appendMessage(task.id, {
    id: opts.userMessageId,
    role: 'user',
    content: visibleUserInput,
  });
  if (stampedUser) {
    taskStore.emit(task.id, { type: SSE_EVENTS.USER_MESSAGE, taskId: task.id, messageId: stampedUser.id, runId });
  }

  const systemPrompt = await loadSystemPrompt();
  const planDocContent = await planDoc.readPlanDoc(task.id).catch(() => '');
  const contextBlock = buildContextBlock(task, planDocContent);
  const config = getConfig();
  const configScope = config.assistant?.model_source === 'aux' ? 'aux' : 'main';
  await refreshModelContextIfNeeded(task, { configScope, systemPrompt, runId });
  const modelPayload = buildModelMessages(task, systemPrompt, contextBlock);

  // 工具组装
  const previewTool = createPreviewCardTool({
    worldId: task.context?.worldId ?? null,
    characterId: task.context?.characterId ?? null,
    world: task.context?.world ?? null,
    character: task.context?.character ?? null,
  });

  const applyCtx = { worldRefId: task.context?.worldId ?? null };
  const emitFn = (evt) => taskStore.emit(task.id, { ...evt, runId });

  const cancelCheck = () => task.status === 'cancelled';
  const onCancelLog = (toolName) => log.warn(`TOOL_CANCELLED_MID_FLIGHT  ${formatMeta({ runId, taskId: task.id, tool: toolName })}`);
  const wrapOpts = { cancelCheck, onCancelLog };

  const tools = [
    wrapToolEvents(toLLMTool(previewTool), emitFn, wrapOpts),
    wrapToolEvents(toLLMTool(listResources), emitFn, wrapOpts),
    wrapToolEvents(toLLMTool(READ_FILE_TOOL), emitFn, wrapOpts),
    ...Object.entries(APPLY_TOOLS).map(([, mod]) =>
      wrapToolEvents(toLLMTool(mod, wrapApply(mod, applyCtx)), emitFn, wrapOpts)),
    ...buildMetaTools(task, emitFn, runId).map((t) => wrapToolEvents(toLLMTool(t), emitFn, wrapOpts)),
  ];

  log.info(`START  ${formatMeta({
    runId,
    taskId: task.id,
    status: task.status,
    sentinel: isApprovedSentinel,
    msgs: task.messages.length,
    contextCharsBefore: modelPayload.contextCharsBefore,
    contextCharsAfter: modelPayload.contextCharsAfter,
    summaryUsed: modelPayload.summaryUsed,
    tailMessageCount: modelPayload.tailMessageCount,
    input: previewText(visibleUserInput, { limit: 120 }),
  })}`);

  let assistantMsgId = null;
  let accumulated = '';
  try {
    const result = await llm.completeWithToolsDetailed(modelPayload.messages, tools, {
      temperature: 0.3,
      thinking_level: null,
      configScope,
      cacheableSystem: systemPrompt,
    });
    accumulated = String(result?.text ?? '');
    log.info(`TOOLS_DONE  ${formatMeta({
      runId,
      taskId: task.id,
      totalMsgs: Array.isArray(result?.messages) ? result.messages.length : modelPayload.messages.length,
      chars: accumulated.length,
    })}`);

    if (accumulated) {
      const stamped = taskStore.appendMessage(task.id, { role: 'assistant', content: '' });
      assistantMsgId = stamped?.id ?? null;
      let emittedText = '';
      for (const chunk of chunkAssistantText(accumulated)) {
        await yieldToEventLoop();
        if (task.status === 'cancelled') break;
        emittedText += chunk;
        emitFn({ type: SSE_EVENTS.DELTA, delta: chunk, messageId: assistantMsgId });
      }
      if (assistantMsgId) {
        if (task.status === 'cancelled' && emittedText.length === 0) {
          taskStore.deleteMessage(task.id, assistantMsgId);
          assistantMsgId = null;
        } else {
          taskStore.updateMessageContent(task.id, assistantMsgId, task.status === 'cancelled' ? emittedText : accumulated);
        }
      }
    }

    log.info(`DONE  ${formatMeta({ runId, taskId: task.id, chars: accumulated.length, status: task.status })}`);
  } catch (err) {
    if (isToolLoopCancelledError(err) && task.status === 'cancelled') {
      log.info(`CANCELLED  ${formatMeta({ runId, taskId: task.id })}`);
      emitFn({ type: SSE_EVENTS.DONE, done: true });
      taskStore.endAllSse(task.id);
      return;
    }
    if (isToolLoopControlSignal(err)) {
      log.info(`CONTROL  ${formatMeta({ runId, taskId: task.id, kind: err.kind, terminalStatus: err.payload?.terminalStatus })}`);
      if (err.kind === TOOL_LOOP_SIGNAL.TERMINAL) {
        emitFn({ type: SSE_EVENTS.DONE, done: true });
        taskStore.endAllSse(task.id);
        return;
      }
      if (err.kind === TOOL_LOOP_SIGNAL.AWAITING_APPROVAL || err.kind === TOOL_LOOP_SIGNAL.PAUSED) {
        return;
      }
    }
    log.error(`FAIL  ${formatMeta({ runId, taskId: task.id, error: err.message })}`);
    // 错误路径：移除预占的 assistant 消息（可能为空或半成品），保持 task.messages 干净
    if (assistantMsgId) {
      taskStore.deleteMessage(task.id, assistantMsgId);
    }
    emitFn({ type: SSE_EVENTS.TASK_FAILED, taskId: task.id, error: err.message });
    taskStore.setStatus(task.id, 'failed', { error: err.message });
    emitFn({ type: SSE_EVENTS.DONE, done: true });
    taskStore.endAllSse(task.id);
    throw err;
  }

  emitFn({ type: SSE_EVENTS.DONE, done: true });
}

export const __testables = {
  toLLMTool,
  wrapApply,
  buildContextBlock,
  buildMetaTools,
  chunkAssistantText,
  clearModelContext,
  getModelHistoryMessages,
  buildModelMessages,
  loadSystemPrompt,
  APPROVED_SENTINEL,
  yieldToEventLoop,
};
