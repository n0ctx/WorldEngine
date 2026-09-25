// 写卡助手单代理循环：一个模型、一组工作区工具，直到模型不再调用工具、给出文字回复为止。

import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as llm from '../../backend/llm/index.js';
import { isToolLoopCancelledError } from '../../backend/llm/tool-loop-control.js';
import { getConfig } from '../../backend/services/config.js';
import { getWorldById } from '../../backend/services/worlds.js';
import { getCharacterById } from '../../backend/db/queries/characters.js';
import { createLogger, formatMeta, previewText, summarizeMessages } from '../../backend/utils/logger.js';

import * as taskStore from './task-store.js';
import { SSE_EVENTS } from './sse-events.js';
import { createWorkspace } from './workspace/index.js';
import { listDocs } from './workspace/docs.js';
import { buildWrappedTools } from './tools/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const log = createLogger('as-agent', 'cyan');

const PROMPT_PATH = path.resolve(__dirname, '../prompts/system.md');
const MAX_TOOL_ITERATIONS = 60;
const CONTEXT_RAW_LIMIT = 8;
const CONTEXT_CHAR_LIMIT = 24_000;
const DELTA_CHUNK_SIZE = 48;
const RESUME_NOTE = '（系统）上一次执行被中断。请先 read 核对已完成的改动，再继续完成用户的请求。';

function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

function describeLocation(session) {
  const world = session.worldId ? getWorldById(session.worldId) : null;
  const character = session.characterId ? getCharacterById(session.characterId) : null;
  return [
    '# 当前位置',
    world ? `- 当前世界：world:${world.id}（${world.name}）` : '- 当前未选中世界',
    ...(character ? [`- 当前角色：character:${character.id}（${character.name}）`] : []),
  ].join('\n');
}

export async function buildSystemPrompt(session) {
  const prompt = await readFile(PROMPT_PATH, 'utf-8');
  return [prompt.trim(), '# 参考文档（按需 read）', listDocs().join('\n'), describeLocation(session)].join('\n\n');
}

function formatToolLine(m) {
  const mark = m.status === 'done' ? `✓ ${m.result ?? ''}` : m.status === 'error' ? `✗ ${m.error ?? ''}` : '（中断）';
  return `- ${m.toolName} ${m.summary ?? ''} ${mark}`.replace(/\s+/g, ' ').trim();
}

// 之前轮次里新建的世界仍然存在时，继续作为当前世界；否则用面板所在的世界。
function resolveWorkingWorldId(task) {
  const messages = Array.isArray(task.messages) ? task.messages : [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m?.role !== 'tool_call' || m.toolName !== 'create' || m.target !== 'world' || m.status !== 'done') continue;
    const worldId = /world:([\w-]+)/.exec(m.result ?? '')?.[1];
    if (worldId && getWorldById(worldId)) return worldId;
  }
  return task.context?.worldId ?? null;
}

// 跨轮只回放 user / assistant 文本；每轮的工具调用折成一段操作记录附在该轮回复前，
// 避免依赖各家 provider 互不兼容的 tool 消息格式。
export function buildHistory(messages) {
  const out = [];
  let ops = [];
  let lastOpId = null;
  const flushOps = (suffix) => {
    if (ops.length === 0) return null;
    const note = `［本轮操作记录］\n${ops.join('\n')}${suffix ? `\n${suffix}` : ''}`;
    ops = [];
    return note;
  };
  const push = (role, content, id) => {
    const last = out.at(-1);
    if (last?.role === role) {
      last.content = `${last.content}\n\n${content}`;
      last.id = id ?? last.id;
    } else {
      out.push({ role, content, id });
    }
  };
  for (const m of Array.isArray(messages) ? messages : []) {
    if (m?.role === 'tool_call') {
      ops.push(formatToolLine(m));
      lastOpId = m.id;
    } else if (m?.role === 'assistant') {
      const note = flushOps();
      push('assistant', note ? `${note}\n\n${m.content ?? ''}` : (m.content ?? ''), m.id);
    } else if (m?.role === 'user') {
      const note = flushOps('（该轮未给出回复）');
      if (note) push('assistant', note, lastOpId);
      push('user', m.content ?? '', m.id);
    }
  }
  const tail = flushOps('（该轮未给出回复）');
  if (tail) push('assistant', tail, lastOpId);
  return out;
}

// 历史过长时把较早部分压成摘要，只保留最近若干条原文（原文从 user 消息开始）。
async function refreshSummary(task, history, { configScope, runId }) {
  const totalChars = summarizeMessages(history).chars;
  let prefixCount = Math.max(0, history.length - CONTEXT_RAW_LIMIT);
  if (prefixCount === 0 && history.length > 1 && totalChars > CONTEXT_CHAR_LIMIT) prefixCount = history.length - 1;
  while (prefixCount > 0 && history[prefixCount]?.role !== 'user') prefixCount -= 1;
  const prefix = history.slice(0, prefixCount);
  const prefixChars = summarizeMessages(prefix).chars;
  if (prefix.length === 0 || (prefix.length <= CONTEXT_RAW_LIMIT && prefixChars <= CONTEXT_CHAR_LIMIT)) {
    if (task.modelContext) taskStore.setModelContext(task.id, null);
    return null;
  }
  const untilId = prefix.at(-1).id;
  if (task.modelContext?.untilId === untilId && task.modelContext?.summary) return task.modelContext;

  const summary = String(await llm.complete([
    {
      role: 'system',
      content: '你在为写卡助手压缩对话上下文。输出 8 行以内中文摘要，只保留：用户目标、用户明确提出的约束与命名、已完成的改动（保留 ref）、未决问题。不要使用 Markdown 标题。',
    },
    { role: 'user', content: prefix.map((m) => `${m.role}: ${m.content}`).join('\n\n') },
  ], { temperature: 0.2, thinking_level: null, configScope, callType: 'assistant-summary' }) ?? '').trim();
  if (task.status === 'cancelled') return task.modelContext ?? null;
  const modelContext = { summary, untilId };
  taskStore.setModelContext(task.id, modelContext);
  log.info(`CONTEXT_SUMMARY  ${formatMeta({ runId, taskId: task.id, sourceMsgs: prefix.length, sourceChars: prefixChars, summaryChars: summary.length })}`);
  return modelContext;
}

function buildModelMessages(systemPrompt, history, modelContext, resumed) {
  const tail = modelContext ? history.slice(history.findIndex((m) => m.id === modelContext.untilId) + 1) : history;
  const messages = [{ role: 'system', content: systemPrompt }];
  if (modelContext?.summary) messages.push({ role: 'system', content: `# 更早对话的摘要\n${modelContext.summary}` });
  messages.push(...tail.map(({ role, content }) => ({ role, content })));
  if (resumed) messages.push({ role: 'user', content: RESUME_NOTE });
  return messages;
}

async function streamReply(task, text, emitFn) {
  const stamped = taskStore.appendMessage(task.id, { role: 'assistant', content: '' });
  let emitted = '';
  for (let i = 0; i < text.length; i += DELTA_CHUNK_SIZE) {
    await yieldToEventLoop();
    if (task.status === 'cancelled') break;
    const chunk = text.slice(i, i + DELTA_CHUNK_SIZE);
    emitted += chunk;
    emitFn({ type: SSE_EVENTS.DELTA, delta: chunk, messageId: stamped.id });
  }
  if (task.status === 'cancelled' && !emitted) {
    taskStore.deleteMessage(task.id, stamped.id);
    return;
  }
  taskStore.updateMessageContent(task.id, stamped.id, emitted);
}

function endStream(task, emitFn) {
  emitFn({ type: SSE_EVENTS.DONE, done: true });
  taskStore.endAllSse(task.id);
}

function finish(task, emitFn, status, error = null) {
  if (task.status !== 'cancelled') {
    taskStore.setStatus(task.id, status, { error });
    const type = status === 'completed' ? SSE_EVENTS.TASK_COMPLETED : SSE_EVENTS.TASK_FAILED;
    emitFn({ type, taskId: task.id, ...(error ? { error } : {}) });
    emitFn({ type: SSE_EVENTS.TASK_SNAPSHOT, taskId: task.id, task: taskStore.buildTaskSnapshot(task) });
  }
  endStream(task, emitFn);
}

/**
 * 跑一轮用户请求。userInput 为 null 表示恢复被重启打断的任务。
 */
export async function runAgent(task, userInput, opts = {}) {
  if (!task) throw new Error('runAgent: task is required');
  const runId = opts.runId ?? randomUUID().slice(0, 8);
  const emitFn = (evt) => taskStore.emit(task.id, { ...evt, runId });
  if (task.status === 'cancelled') {
    endStream(task, emitFn);
    return;
  }
  const resumed = userInput == null;

  taskStore.setExecutionActive(task.id, true);
  try {
    const incoming = [
      ...(resumed ? [] : [{ id: opts.userMessageId, content: String(userInput) }]),
      ...taskStore.takeUserMessages(task.id).map((content) => ({ content })),
    ];
    for (const m of incoming) {
      const stamped = taskStore.appendMessage(task.id, { id: m.id, role: 'user', content: m.content });
      if (stamped) emitFn({ type: SSE_EVENTS.USER_MESSAGE, taskId: task.id, messageId: stamped.id });
    }
    taskStore.setStatus(task.id, 'running', { error: null });
    emitFn({ type: SSE_EVENTS.TASK_SNAPSHOT, taskId: task.id, task: taskStore.buildTaskSnapshot(task) });

    const workspace = createWorkspace({ ...task.context, worldId: resolveWorkingWorldId(task) });
    const tools = buildWrappedTools(workspace, emitFn, {
      cancelCheck: () => task.status === 'cancelled',
      onCancelLog: (tool) => log.warn(`TOOL_CANCELLED_MID_FLIGHT  ${formatMeta({ runId, taskId: task.id, tool })}`),
    });
    const configScope = getConfig().assistant?.model_source === 'aux' ? 'aux' : 'main';
    const systemPrompt = await buildSystemPrompt(workspace.session);
    const history = buildHistory(task.messages);
    const modelContext = await refreshSummary(task, history, { configScope, runId });
    const messages = buildModelMessages(systemPrompt, history, modelContext, resumed);

    log.info(`START  ${formatMeta({
      runId, taskId: task.id, resumed, msgs: messages.length, chars: summarizeMessages(messages).chars,
      input: previewText(userInput ?? '', { limit: 120 }),
    })}`);
    const usageRef = {};
    const reply = String(await llm.completeWithTools(messages, tools, {
      temperature: 0.3,
      thinking_level: null,
      configScope,
      cacheableSystem: systemPrompt,
      usageRef,
      callType: 'assistant',
      maxIterations: MAX_TOOL_ITERATIONS,
    }) ?? '').trim();
    if (task.status === 'cancelled') {
      endStream(task, emitFn);
      return;
    }
    if (!reply) {
      finish(task, emitFn, 'failed', '模型没有返回回复，可以重新发送或换个说法');
      return;
    }
    await streamReply(task, reply, emitFn);
    log.info(`DONE  ${formatMeta({ runId, taskId: task.id, chars: reply.length, promptTokens: usageRef.prompt_tokens, completionTokens: usageRef.completion_tokens })}`);
    finish(task, emitFn, 'completed');
  } catch (err) {
    if (isToolLoopCancelledError(err) && task.status === 'cancelled') {
      log.info(`CANCELLED  ${formatMeta({ runId, taskId: task.id })}`);
      endStream(task, emitFn);
      return;
    }
    log.error(`FAIL  ${formatMeta({ runId, taskId: task.id, error: err.message })}`);
    finish(task, emitFn, 'failed', err.message || '未知错误');
  } finally {
    taskStore.setExecutionActive(task.id, false);
  }
}
