// Provider-agnostic 工具循环骨架。
//
// 设计:把"调一轮 → 跑工具 → 喂回 → 再调"这套循环骨架从各 provider 抽出来,
// 每个 provider 只需暴露 4 个原语:
//   - initState(messages)              : 把入参消息折叠成 provider 自己的状态对象
//   - oneTurn(state, defs, iter, config) : 发一次模型请求,返回
//       { kind: 'text', text }                     → 终态
//       { kind: 'tools', toolCalls, assistantBlock, truncated?, _rawParts? } → 需跑工具
//           toolCalls 每项 { id, name, arguments, argumentsError? };truncated 表示输出撞到 max_tokens
//       { kind: 'fallback' }                        → 模型接口拒绝工具调用,退到 completeNoTools
//   - appendToolTurn(state, turn, results) : 把本轮 assistant + tool 结果回写状态
//   - completeNoTools(state, config)       : 兜底无工具回答
//   - stateToMessages?(state)              : completeResultMode='detail' 终态用,折回 messages 数组
//
// 配套:工具 handler 中抛 ToolLoopCancelledError 必须直接透传(cancel 信号),
// 不可被 catch 字符串化喂回模型。
//
// 循环层自己负责的事(provider 不用管):
//   - 重试与超时只包单次模型请求(oneTurn / completeNoTools),已执行的工具不会因重试重跑;
//   - 参数不合法、输出被截断的调用不执行,把原因回填给模型;
//   - 连续相同的失败调用第 2 次加提示、第 3 次结束循环;
//   - 触顶、重复失败、接口降级时,把已执行的操作清单作为一条说明交给无工具补全。

import { LLM_TOOL_RESOLUTION_MAX_ITERATIONS } from '../utils/constants.js';
import { createLogger, formatMeta } from '../utils/logger.js';
import { requestWithRetry } from './retry.js';

const log = createLogger('llm');

export class ToolLoopCancelledError extends Error {
  constructor(message = 'tool loop cancelled') {
    super(message);
    this.name = 'ToolLoopCancelledError';
  }
}

export function isToolLoopCancelledError(err) {
  return err instanceof ToolLoopCancelledError || err?.name === 'ToolLoopCancelledError';
}

export const TOOL_LOOP_SIGNAL = Object.freeze({
  TERMINAL: 'terminal',
  AWAITING_APPROVAL: 'awaiting_approval',
  PAUSED: 'paused',
});

export class ToolLoopControlSignal extends Error {
  constructor(kind, payload = {}) {
    super(`tool loop control: ${kind}`);
    this.name = 'ToolLoopControlSignal';
    this.kind = kind;
    this.payload = payload;
  }
}

export function isToolLoopControlSignal(err) {
  return err instanceof ToolLoopControlSignal || err?.name === 'ToolLoopControlSignal';
}

export const TOOL_LOOP_STOP = Object.freeze({
  COMPLETED: 'completed',
  MAX_ITERATIONS: 'max_iterations',
  REPEATED_FAILURE: 'repeated_failure',
  // 首轮模型接口就拒绝工具调用：没有执行任何操作
  FALLBACK: 'fallback',
  // 已执行过工具后接口拒绝工具调用
  FALLBACK_MIDWAY: 'fallback_midway',
});

const REPEATED_FAILURE_HINT_AT = 2;
const REPEATED_FAILURE_STOP_AT = 3;
const OP_ARGS_SUMMARY_CHARS = 120;
const OP_RESULT_SUMMARY_CHARS = 160;
const OP_LOG_NOTE_MAX_LINES = 50;
const REPEATED_FAILURE_HINT = '与上一次完全相同的调用再次失败，请修改参数或放弃这一步';
const TRUNCATED_RESULT = '输出被截断（达到 max_tokens），该调用未执行；请减少单次调用的内容量后重发';
const NOT_RUN_AFTER_STOP_RESULT = '未执行：同一调用连续失败，工具循环已结束';
const NOTE_PREFIX = '[系统说明]';
const ASK_FOR_SUMMARY = '请直接用文字向用户说明哪些部分已经完成、哪些部分没有完成。';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clip(text, limit) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat;
}

function safeStringify(value) {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return String(value);
  }
}

/** 调用方 signal 已中止时抛取消错误 */
export function throwIfLoopCancelled(signal) {
  if (signal?.aborted) throw new ToolLoopCancelledError('tool loop cancelled by caller');
}

function isLoopPassthroughError(err) {
  return isToolLoopCancelledError(err) || isToolLoopControlSignal(err);
}

/**
 * 发一次模型请求（带超时窗口与重试）。run 收到的 config 里 signal 已换成本次请求的超时信号。
 * 调用方 signal 中止 → ToolLoopCancelledError；超时 → LLM_TIMEOUT，不重试。
 */
export async function callModel(run, config, phase) {
  const signal = config?.signal;
  throwIfLoopCancelled(signal);
  try {
    return await requestWithRetry((timedSignal) => run({ ...config, signal: timedSignal }), {
      signal,
      timeoutMs: config?.timeoutMs,
      retry: config?.retry,
      label: config?.callType,
      isFatal: isLoopPassthroughError,
      onRetry: ({ attempt, error }) => log.warn(`COMPLETE_TOOLS RETRY  ${formatMeta({
        phase,
        attempt,
        provider: config?.provider,
        model: config?.model || '',
        error: error.message,
      })}`),
    });
  } catch (err) {
    if (!isLoopPassthroughError(err)) throwIfLoopCancelled(signal);
    throw err;
  }
}

/** 包住 provider.oneTurn 的单次请求 */
export function callTurn(provider, state, toolDefs, iter, config) {
  return callModel((turnConfig) => provider.oneTurn(state, toolDefs, iter, turnConfig), config, `turn-${iter}`);
}

/** 判断工具返回值是否表示失败：{ success: false } 或其 JSON 字符串 */
export function isFailureResult(raw) {
  if (isPlainObject(raw)) return raw.success === false;
  if (typeof raw !== 'string' || !raw.startsWith('{')) return false;
  try {
    return JSON.parse(raw)?.success === false;
  } catch {
    return false;
  }
}

/** 调用不该执行时返回要回填的原因，否则返回 null */
export function describeUnrunnableCall(call, { handlers, truncatedLast }) {
  if (truncatedLast) return TRUNCATED_RESULT;
  if (call.argumentsError || !isPlainObject(call.arguments)) {
    const reason = call.argumentsError || '参数必须是一个 JSON 对象';
    return `工具参数不是合法 JSON，未执行：${reason}。请重新输出完整参数`;
  }
  if (typeof handlers[call.name] !== 'function') {
    const names = Object.keys(handlers);
    return `工具未定义：${call.name}。可用工具：${names.length ? names.join('、') : '（无）'}`;
  }
  return null;
}

/**
 * 执行一个工具调用，返回 { result, failed, executed }。
 * 取消与控制信号原样抛出；其它错误字符串化后回填给模型。
 */
export async function executeCall(call, { handlers, truncatedLast = false }) {
  const blocked = describeUnrunnableCall(call, { handlers, truncatedLast });
  if (blocked) return { result: blocked, failed: true, executed: false };
  try {
    const raw = await handlers[call.name](call.arguments);
    const result = typeof raw === 'string' ? raw : safeStringify(raw);
    return { result, failed: isFailureResult(raw), executed: true };
  } catch (e) {
    if (isLoopPassthroughError(e)) throw e;
    return { result: `工具执行失败:${e.message}`, failed: true, executed: true };
  }
}

/**
 * tracker 是 { key, count }，初值 { key: null, count: 0 }。记录一次调用结果，返回「同名、同参数、同样失败结果」已连续出现的次数（成功或不同调用返回 0 / 1）。
 */
export function trackRepeatedFailure(tracker, call, outcome) {
  if (!outcome.failed) {
    tracker.key = null;
    tracker.count = 0;
    return 0;
  }
  const key = safeStringify([call.name, call.arguments, call.argumentsError ?? null, outcome.result]);
  tracker.count = key === tracker.key ? tracker.count + 1 : 1;
  tracker.key = key;
  return tracker.count;
}

function toLogEntry(call, outcome) {
  return {
    name: call.name,
    args: clip(safeStringify(call.arguments), OP_ARGS_SUMMARY_CHARS),
    ok: !outcome.failed,
    executed: outcome.executed,
    result: clip(outcome.result, OP_RESULT_SUMMARY_CHARS),
  };
}

/**
 * 执行一轮里的全部调用，返回与 turn.toolCalls 等长的结果文本数组。
 * 副作用：写 run.opLog / run.toolCallCount / run.tracker；连续相同失败到第 3 次时置 run.stopReason，本轮剩余调用不再执行。
 */
export async function executeTurnCalls(turn, run, { handlers, signal }) {
  const calls = turn.toolCalls || [];
  const results = [];
  for (let idx = 0; idx < calls.length; idx++) {
    const call = calls[idx];
    if (run.stopReason) {
      results.push(NOT_RUN_AFTER_STOP_RESULT);
      continue;
    }
    throwIfLoopCancelled(signal);
    const truncatedLast = Boolean(turn.truncated) && idx === calls.length - 1;
    const outcome = await executeCall(call, { handlers, truncatedLast });
    if (outcome.executed) run.toolCallCount += 1;
    run.opLog.push(toLogEntry(call, outcome));
    const repeats = trackRepeatedFailure(run.tracker, call, outcome);
    if (repeats >= REPEATED_FAILURE_STOP_AT) run.stopReason = TOOL_LOOP_STOP.REPEATED_FAILURE;
    results.push(repeats >= REPEATED_FAILURE_HINT_AT ? `${outcome.result}\n${REPEATED_FAILURE_HINT}` : outcome.result);
  }
  return results;
}

/** 操作清单文本：每行「序号. [成功|失败|未执行] 工具名 参数摘要 → 结果摘要」 */
export function formatOpLog(opLog) {
  if (!opLog.length) return '本次没有执行任何操作。';
  const skipped = Math.max(0, opLog.length - OP_LOG_NOTE_MAX_LINES);
  const lines = opLog.slice(skipped).map((op, i) => {
    const status = op.ok ? '成功' : (op.executed ? '失败' : '未执行');
    return `${skipped + i + 1}. [${status}] ${op.name} ${op.args} → ${op.result}`;
  });
  const head = `本次已发出的工具调用（共 ${opLog.length} 次${skipped ? `，前 ${skipped} 次从略` : ''}）：`;
  return [head, ...lines].join('\n');
}

const STOP_NOTE_LEADS = {
  [TOOL_LOOP_STOP.MAX_ITERATIONS]: ({ maxIterations }) => `工具调用轮数已达上限（${maxIterations} 轮），现在不能再调用工具。`,
  [TOOL_LOOP_STOP.REPEATED_FAILURE]: () => `同一个工具调用连续 ${REPEATED_FAILURE_STOP_AT} 次以相同方式失败，工具循环已停止，现在不能再调用工具。`,
  [TOOL_LOOP_STOP.FALLBACK_MIDWAY]: () => '模型接口中途拒绝了工具调用请求，现在不能再调用工具。',
};

/** 循环非正常结束时交给无工具补全的说明 */
export function buildStopNote(stopReason, opLog, { maxIterations } = {}) {
  if (stopReason === TOOL_LOOP_STOP.FALLBACK) {
    return `${NOTE_PREFIX} 当前模型接口拒绝了工具调用请求，没有执行任何操作，请告知用户换用支持工具调用的模型。`;
  }
  const lead = STOP_NOTE_LEADS[stopReason]({ maxIterations });
  return `${NOTE_PREFIX} ${lead}\n${formatOpLog(opLog)}\n${ASK_FOR_SUMMARY}`;
}

/**
 * 原始消息 + 一条说明。末条是纯文本 user 消息时并进去，避免本地模型模板不接受连续两条 user 消息。
 */
export function appendNoteMessage(messages, note) {
  const last = messages[messages.length - 1];
  if (last?.role === 'user' && typeof last.content === 'string') {
    return [...messages.slice(0, -1), { ...last, content: `${last.content}\n\n${note}` }];
  }
  return [...messages, { role: 'user', content: note }];
}

/**
 * 跑 provider-agnostic 工具循环。
 *
 * @param {object}   opts
 * @param {object}   opts.provider     4 原语 provider 适配器
 * @param {Array}    opts.messages     OpenAI-style 入参消息
 * @param {Array}    opts.toolDefs     工具定义(OpenAI function 格式)
 * @param {object}   opts.toolHandlers name → async handler 映射
 * @param {object}   opts.config       provider 透传配置(含 signal/cacheableSystem 等)。循环层读取:
 *   - signal    : 调用方取消信号,中止后抛 ToolLoopCancelledError
 *   - timeoutMs : 每次模型请求一个超时窗口;缺省不限时
 *   - retry     : { max, delayMs },只重试单次模型请求;缺省不重试
 *   - loopRef   : 回传 { stopReason, toolCallCount }(toolCallCount 只计真正执行了 handler 的调用)
 *   - beforeTurn: async (messages, iter) => Array|null,每次模型请求前调用;返回新消息数组则以它重建循环状态
 * @param {'text'|'detail'} [opts.completeResultMode='text']
 *   - 'text'  : 返回最终文本字符串
 *   - 'detail': 返回 { text, messages }
 * 最大轮数取 config.maxIterations（调用方按场景指定），未给时走全局常量。
 */
export async function runToolLoop({
  provider,
  messages,
  toolDefs,
  toolHandlers,
  config,
  completeResultMode = 'text',
}) {
  const maxIterations = Number.isInteger(config?.maxIterations) ? config.maxIterations : LLM_TOOL_RESOLUTION_MAX_ITERATIONS;
  const handlers = toolHandlers || {};
  const run = { opLog: [], toolCallCount: 0, tracker: { key: null, count: 0 }, stopReason: null };
  let baseMessages = messages;
  let state = provider.initState(messages);
  let text = null;

  for (let iter = 0; iter < maxIterations && !run.stopReason; iter++) {
    const replaced = config?.beforeTurn ? await config.beforeTurn(provider.stateToMessages(state), iter) : null;
    if (replaced) {
      baseMessages = replaced;
      state = provider.initState(replaced);
    }
    const turn = await callTurn(provider, state, toolDefs, iter, config);
    if (turn.kind === 'text') {
      text = turn.text;
      run.stopReason = TOOL_LOOP_STOP.COMPLETED;
    } else if (turn.kind === 'fallback') {
      run.stopReason = iter === 0 ? TOOL_LOOP_STOP.FALLBACK : TOOL_LOOP_STOP.FALLBACK_MIDWAY;
    } else {
      const results = await executeTurnCalls(turn, run, { handlers, signal: config?.signal });
      state = provider.appendToolTurn(state, turn, results);
    }
  }

  const stopReason = run.stopReason || TOOL_LOOP_STOP.MAX_ITERATIONS;
  if (stopReason !== TOOL_LOOP_STOP.COMPLETED) {
    // 用「基线消息 + 一条说明」重建状态：工具历史以操作清单的形式进说明，不依赖各 provider 的无工具补全是否认工具消息
    const note = buildStopNote(stopReason, run.opLog, { maxIterations });
    const noteState = provider.initState(appendNoteMessage(baseMessages, note));
    log.warn(`COMPLETE_TOOLS STOP  ${formatMeta({ reason: stopReason, provider: config?.provider, model: config?.model || '', toolCalls: run.toolCallCount })}`);
    text = await callModel((noToolsConfig) => provider.completeNoTools(noteState, noToolsConfig), config, 'no-tools');
  }
  if (config?.loopRef) Object.assign(config.loopRef, { stopReason, toolCallCount: run.toolCallCount });

  if (completeResultMode !== 'detail') return text;
  return { text, messages: provider.stateToMessages ? provider.stateToMessages(state) : state.messages };
}
