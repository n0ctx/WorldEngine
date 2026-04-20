function parseJsonEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function getResponseQueue(kind) {
  return parseJsonEnv(kind === 'stream' ? 'MOCK_LLM_STREAM_QUEUE' : 'MOCK_LLM_COMPLETE_QUEUE', null);
}

function takeQueued(kind) {
  const envName = kind === 'stream' ? 'MOCK_LLM_STREAM_QUEUE' : 'MOCK_LLM_COMPLETE_QUEUE';
  const queue = getResponseQueue(kind);
  if (!Array.isArray(queue) || queue.length === 0) return null;
  const [next, ...rest] = queue;
  process.env[envName] = JSON.stringify(rest);
  return next;
}

function getMockText(kind) {
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

export async function* streamChat() {
  maybeThrow('stream');
  const text = getMockText('stream');
  const chunks = parseJsonEnv('MOCK_LLM_STREAM_CHUNKS', null);
  if (Array.isArray(chunks) && chunks.length > 0) {
    for (const chunk of chunks) yield String(chunk);
    return;
  }
  if (!text) return;
  yield text;
}

export async function complete() {
  maybeThrow('complete');
  return getMockText('complete');
}

export async function completeWithTools(messages, _defs, handlers) {
  maybeThrow('complete');
  const toolCalls = parseJsonEnv('MOCK_LLM_TOOL_CALLS', []);
  for (const call of toolCalls) {
    const handler = handlers?.[call?.name];
    if (typeof handler !== 'function') continue;
    await handler(call.arguments ?? {});
  }
  return getMockText('complete');
}

export async function resolveToolContext(messages, _defs, handlers) {
  const toolCalls = parseJsonEnv('MOCK_LLM_TOOL_CALLS', []);
  const enriched = [...messages];
  for (const call of toolCalls) {
    const handler = handlers?.[call?.name];
    if (typeof handler !== 'function') continue;
    const result = await handler(call.arguments ?? {});
    enriched.push({
      role: 'tool',
      content: typeof result === 'string' ? result : JSON.stringify(result),
    });
  }
  return enriched;
}
