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

export async function completeWithTools(messages, _defs, handlers, config = {}) {
  maybeThrow('complete');
  const toolCalls = takeQueuedToolCalls() ?? parseJsonEnv('MOCK_LLM_TOOL_CALLS', []);
  for (const call of toolCalls) {
    const handler = handlers?.[call?.name];
    if (typeof handler !== 'function') continue;
    await handler(call.arguments ?? {});
  }
  const text = getMockText('complete', { useActionQueue: false });
  if (config.toolResultMode === 'detail') {
    return { text, messages };
  }
  return text;
}
