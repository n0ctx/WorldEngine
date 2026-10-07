// 写卡助手单代理循环：一个模型、一组工作区工具，直到模型不再调用工具、给出文字回复为止。

import { randomUUID } from 'node:crypto';

import * as llm from '../../backend/llm/index.js';
import { isToolLoopCancelledError } from '../../backend/llm/tool-loop-control.js';
import { getConfig } from '../../backend/services/config.js';
import { createLogger, formatMeta, previewText, summarizeMessages } from '../../backend/utils/logger.js';

import * as taskStore from './task-store.js';
import { SSE_EVENTS } from './sse-events.js';
import { createWorkspace } from './workspace/index.js';
import { buildWrappedTools } from './tools/index.js';
import { createContextGuard } from './context-guard.js';
import { withSummary } from './context-summary.js';
import { buildSystemPrompt, resolveWorkingWorldId } from './system-prompt.js';
import { appendUserMessages, createAfterReply, createBeforeTurn } from './turn-hooks.js';

const log = createLogger('as-agent', 'cyan');

const MAX_TOOL_ITERATIONS = 60;
const DELTA_CHUNK_SIZE = 48;
const RESUME_NOTE = '（系统）上一次执行被中断。请先 read 核对已完成的改动，再继续完成用户的请求。';
const OPS_NOTE_HEADER = '（系统附注，不是用户发言）上一轮你实际执行的工具操作：';
const AFTER_SUMMARY_NOTE = '（系统）更早的对话已压缩为系统提示词末尾的摘要，以下是紧接其后的内容。';

function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

function formatToolLine(m) {
  const mark = m.status === 'done' ? `✓ ${m.result ?? ''}` : m.status === 'error' ? `✗ ${m.error ?? ''}` : '（中断）';
  return `- ${m.toolName} ${m.summary ?? ''} ${mark}`.replace(/\s+/g, ' ').trim();
}

// 跨轮只回放 user / assistant 文本，避免依赖各家 provider 互不兼容的 tool 消息格式。
// 每轮的工具调用折成一段系统附注，放进下一条 user 消息开头：若放在助手回复里，
// 模型会照着历史回复的样子直接写出假的操作记录，而不真去调用工具。
export function buildHistory(messages) {
  const out = [];
  let ops = [];
  let replied = false;
  let lastOpId = null;
  const flushOps = () => {
    if (ops.length === 0) return null;
    const note = `${OPS_NOTE_HEADER}\n${ops.join('\n')}${replied ? '' : '\n（该轮未给出回复）'}`;
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
      replied = false;
      lastOpId = m.id;
    } else if (m?.role === 'assistant') {
      push('assistant', m.content ?? '', m.id);
      replied = true;
    } else if (m?.role === 'user') {
      const note = flushOps();
      if (note) push('user', note, lastOpId);
      push('user', m.content ?? '', m.id);
    }
  }
  const tail = flushOps();
  if (tail) push('user', tail, lastOpId);
  return out;
}

// 摘要标记之前的消息已进摘要，只回放标记之后的；标记被截断或删除时摘要作废，回放全部消息。
export function buildModelMessages(systemPrompt, task, resumed) {
  const all = Array.isArray(task.messages) ? task.messages : [];
  const boundary = task.modelContext ? all.findIndex((m) => m.id === task.modelContext.untilId) : -1;
  if (task.modelContext && boundary < 0) taskStore.setModelContext(task.id, null);
  const summary = boundary < 0 ? null : task.modelContext.summary;
  const tail = buildHistory(all.slice(boundary + 1));
  const messages = [{ role: 'system', content: withSummary(systemPrompt, summary) }];
  // 标记落在一轮中间时，其后的内容以助手消息开头；部分模型要求对话以 user 开头
  if (summary && tail[0]?.role === 'assistant') messages.push({ role: 'user', content: AFTER_SUMMARY_NOTE });
  messages.push(...tail.map(({ role, content }) => ({ role, content })));
  if (resumed && messages.at(-1).role === 'user') messages.at(-1).content += `\n\n${RESUME_NOTE}`;
  else if (resumed) messages.push({ role: 'user', content: RESUME_NOTE });
  return messages;
}

// text 进来时已是完整回复，所以建消息时就带上它落库，切片只负责推打字动画。
// 旧写法先落一条空消息、收尾才写库，推送途中进程退出库里就只剩空壳。
// appendMessage 不发 SSE，前端仍只按 DELTA 逐段显示，动画不受影响。
// ponytail: 模型单轮输出本身仍救不回来——助手走非流式 completeWithTools，模型返回前
// 退出就没有任何文本存在，重启后该轮重跑。要保住「生成中的半句话」得把 5 个服务商的
// 工具调用循环都改成流式，并按节流把增量写进库。
async function streamReply(task, text, emitFn) {
  const stamped = taskStore.appendMessage(task.id, { role: 'assistant', content: text });
  let emitted = '';
  for (let i = 0; i < text.length; i += DELTA_CHUNK_SIZE) {
    await yieldToEventLoop();
    if (task.status === 'cancelled') break;
    const chunk = text.slice(i, i + DELTA_CHUNK_SIZE);
    emitted += chunk;
    emitFn({ type: SSE_EVENTS.DELTA, delta: chunk, messageId: stamped.id });
  }
  if (task.status !== 'cancelled') return;
  // 被取消：只留已推给前端的部分，与旧写法的截断语义一致
  if (!emitted) {
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
    appendUserMessages(task, [
      ...(resumed ? [] : [{ id: opts.userMessageId, content: String(userInput) }]),
      ...taskStore.takeUserMessages(task.id).map((content) => ({ content })),
    ], emitFn);
    const runStart = task.messages.length;
    taskStore.setStatus(task.id, 'running', { error: null });
    emitFn({ type: SSE_EVENTS.TASK_SNAPSHOT, taskId: task.id, task: taskStore.buildTaskSnapshot(task) });

    const workspace = createWorkspace({ ...task.context, worldId: resolveWorkingWorldId(task) });
    const tools = buildWrappedTools(workspace, emitFn, {
      cancelCheck: () => task.status === 'cancelled',
      onCancelLog: (tool) => log.warn(`TOOL_CANCELLED_MID_FLIGHT  ${formatMeta({ runId, taskId: task.id, tool })}`),
    });
    const configScope = getConfig().assistant?.model_source === 'aux' ? 'aux' : 'main';
    const systemPrompt = await buildSystemPrompt(workspace.session);
    const messages = buildModelMessages(systemPrompt, task, resumed);
    const contextGuard = await createContextGuard({
      task, configScope, tools, systemPrompt, anchor: messages.at(-1).content, emitFn, runId,
    });

    log.info(`START  ${formatMeta({
      runId, taskId: task.id, resumed, msgs: messages.length, chars: summarizeMessages(messages).chars,
      input: previewText(userInput ?? '', { limit: 120 }),
    })}`);
    const usageRef = {};
    const reply = String(await llm.completeWithTools(messages, tools, {
      temperature: 0.3,
      configScope,
      cacheableSystem: systemPrompt,
      usageRef,
      callType: 'assistant',
      maxIterations: MAX_TOOL_ITERATIONS,
      beforeTurn: createBeforeTurn(task, contextGuard, emitFn),
      afterReply: createAfterReply(task, runStart),
      signal: taskStore.getAbortSignal(task.id),
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
