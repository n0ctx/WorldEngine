import { runToolLoop } from '../../tool-loop-control.js';
import { appendOpenAIToolTurn } from '../_shared/converters.js';

function parseJsonEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function takeQueueItem(envName) {
  const queue = parseJsonEnv(envName, null);
  if (!Array.isArray(queue) || queue.length === 0) return undefined;
  const [next, ...rest] = queue;
  process.env[envName] = JSON.stringify(rest);
  return next;
}

function takeQueued(kind) {
  const envName = kind === 'stream' ? 'MOCK_LLM_STREAM_QUEUE' : 'MOCK_LLM_COMPLETE_QUEUE';
  return takeQueueItem(envName) ?? null;
}

function takeQueuedToolCalls() {
  const next = takeQueueItem('MOCK_LLM_TOOL_CALLS_QUEUE');
  return next === undefined ? null : Array.isArray(next) ? next : [];
}

function takeQueuedAction() {
  const next = takeQueueItem('MOCK_LLM_ACTION_QUEUE');
  return next === undefined ? null : typeof next === 'string' ? next : JSON.stringify(next);
}

function getMockText(kind, opts = {}) {
  if (kind === 'complete' && opts.useActionQueue !== false) {
    const queuedAction = takeQueuedAction();
    if (queuedAction != null) return queuedAction;
    if (process.env.MOCK_LLM_ACTION) return process.env.MOCK_LLM_ACTION;
  }
  const queued = takeQueued(kind);
  if (queued != null) return String(queued);
  if (kind === 'stream') return process.env.MOCK_LLM_STREAM ?? process.env.MOCK_LLM_RESPONSE ?? '';
  return process.env.MOCK_LLM_COMPLETE ?? process.env.MOCK_LLM_RESPONSE ?? '';
}

function maybeThrow(kind) {
  const message = kind === 'stream'
    ? process.env.MOCK_LLM_STREAM_ERROR
    : process.env.MOCK_LLM_COMPLETE_ERROR;
  if (!message) return;
  const err = new Error(message);
  err.status = Number(process.env.MOCK_LLM_ERROR_STATUS) || undefined;
  throw err;
}

function sleep(ms, signal) {
  if (!signal || ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      reject(err);
    }
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort);
  });
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  const err = new Error('The operation was aborted');
  err.name = 'AbortError';
  throw err;
}

export async function* streamChat(_messages, llmConfig = {}) {
  maybeThrow('stream');
  const signal = llmConfig.signal;
  const text = getMockText('stream');
  const chunks = parseJsonEnv('MOCK_LLM_STREAM_CHUNKS', null);
  const delays = parseJsonEnv('MOCK_LLM_STREAM_DELAYS', []);
  if (Array.isArray(chunks) && chunks.length > 0) {
    for (let i = 0; i < chunks.length; i++) {
      const delayMs = Number(delays?.[i] ?? 0);
      if (delayMs > 0) await sleep(delayMs, signal);
      throwIfAborted(signal);
      yield String(chunks[i]);
    }
    return;
  }
  if (!text) return;
  const delayMs = Number(delays?.[0] ?? 0);
  if (delayMs > 0) await sleep(delayMs, signal);
  throwIfAborted(signal);
  yield text;
}

export async function complete(_messages, llmConfig = {}) {
  maybeThrow('complete');
  const delayMs = Number(process.env.MOCK_LLM_COMPLETE_DELAY_MS ?? 0);
  if (delayMs > 0) await sleep(delayMs, llmConfig.signal);
  return getMockText('complete');
}

// ============================================================
// 工具循环：脚本化的 4 原语 provider，走真实的 runToolLoop
// ============================================================
//
// MOCK_LLM_TOOL_TURNS_QUEUE 是 JSON 数组，每次模型请求（含被重试的请求）消费一项：
//   [ {name, arguments}, ... ]            → 这一轮发出这些工具调用
//   "文本"                                 → 这一轮直接给出最终回复
//   { error: "msg", status?: 500 }        → 这次请求抛错（status 决定是否重试）
//   { fallback: true }                    → 接口拒绝工具调用
//   { calls: [...], truncated?: true }    → 同数组写法，可标记输出被截断
//   { text: "文本" }                       → 同字符串写法
//   对象写法都可带 delayMs：这次请求先等待这么久（会响应中止信号）
// 队列用完后的请求返回 MOCK_LLM_COMPLETE 文本。
//
// 没设该变量时沿用旧变量：MOCK_LLM_TOOL_CALLS_QUEUE（每次 completeWithTools 取一项）
// 或 MOCK_LLM_TOOL_CALLS 给出第一轮的调用，第二轮返回 MOCK_LLM_COMPLETE 文本。

function mockError(message, status) {
  const err = new Error(message);
  err.status = Number(status) || undefined;
  return err;
}

function toMockToolTurn(calls, iter, truncated) {
  const toolCalls = calls.map((call, idx) => ({
    id: call?.id || `mock_${iter}_${idx}`,
    name: call?.name,
    arguments: call?.arguments ?? {},
  }));
  const assistantBlock = {
    role: 'assistant',
    content: null,
    tool_calls: toolCalls.map((c) => ({
      id: c.id,
      type: 'function',
      function: { name: c.name, arguments: JSON.stringify(c.arguments) },
    })),
  };
  return { kind: 'tools', toolCalls, assistantBlock, truncated: Boolean(truncated) };
}

function mockTextTurn(text) {
  return { kind: 'text', text: text ?? getMockText('complete', { useActionQueue: false }) };
}

/** 把回合队列里的一项变成 oneTurn 的返回值（或抛错） */
export function scriptedTurnToResult(item, iter) {
  if (Array.isArray(item)) return toMockToolTurn(item, iter, false);
  if (item === null || typeof item !== 'object') return mockTextTurn(item === null ? undefined : String(item));
  if (item.error) throw mockError(item.error, item.status);
  if (item.fallback) return { kind: 'fallback' };
  if (Array.isArray(item.calls)) return toMockToolTurn(item.calls, iter, item.truncated);
  return mockTextTurn(item.text);
}

function legacyTurn(state, iter) {
  if (state.legacyCallsTaken) return mockTextTurn();
  state.legacyCallsTaken = true;
  const calls = takeQueuedToolCalls() ?? parseJsonEnv('MOCK_LLM_TOOL_CALLS', []);
  return Array.isArray(calls) && calls.length > 0 ? toMockToolTurn(calls, iter, false) : mockTextTurn();
}

const mockToolLoopProvider = {
  initState(messages) {
    return { messages: [...messages], legacyCallsTaken: false };
  },

  async oneTurn(state, _toolDefs, iter, config = {}) {
    throwIfAborted(config.signal);
    maybeThrow('complete');
    if (process.env.MOCK_LLM_TOOL_TURNS_QUEUE === undefined) return legacyTurn(state, iter);
    const item = takeQueueItem('MOCK_LLM_TOOL_TURNS_QUEUE');
    if (item === undefined) return mockTextTurn();
    if (Number(item?.delayMs) > 0) await sleep(Number(item.delayMs), config.signal);
    return scriptedTurnToResult(item, iter);
  },

  appendToolTurn(state, turn, results) {
    // 保留 legacyCallsTaken：旧变量只在第一轮给出调用
    return { ...state, ...appendOpenAIToolTurn(state, turn, results) };
  },

  async completeNoTools(_state, config = {}) {
    throwIfAborted(config.signal);
    maybeThrow('complete');
    return getMockText('complete', { useActionQueue: false });
  },

  stateToMessages(state) {
    return state.messages;
  },
};

export async function completeWithTools(messages, defs, handlers, config = {}) {
  return runToolLoop({
    provider: mockToolLoopProvider,
    messages,
    toolDefs: defs,
    toolHandlers: handlers,
    config,
    completeResultMode: config.toolResultMode ?? 'text',
  });
}
