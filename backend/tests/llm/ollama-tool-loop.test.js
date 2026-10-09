import test from 'node:test';
import assert from 'node:assert/strict';

import { completeWithTools, complete } from '../../llm/providers/ollama/index.js';
import { ToolLoopCancelledError } from '../../llm/tool-loop-control.js';

// 通用 fetch mock 工厂：按顺序返回预设响应；记录每次入参以便断言
function mockFetchSequence(responses) {
  const calls = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push({ url, body });
    const next = responses.shift();
    if (!next) throw new Error('mock fetch exhausted');
    if (next.error) throw next.error;
    if (next.hang) return waitForAbort(opts.signal);
    if (next.status && next.status >= 400) {
      return { ok: false, status: next.status, text: async () => next.text || '' };
    }
    return { ok: true, status: 200, json: async () => next.json };
  };
  return { calls, restore: () => { globalThis.fetch = origFetch; } };
}

function waitForAbort(signal) {
  return new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => {
      const err = new Error('This operation was aborted');
      err.name = 'AbortError';
      reject(err);
    }, { once: true });
  });
}

function chatResp({ content, toolCalls, finishReason } = {}) {
  const message = { role: 'assistant', content: content ?? null };
  if (toolCalls) {
    message.tool_calls = toolCalls.map((tc, i) => ({
      id: tc.id || `c${i}`,
      type: 'function',
      function: { name: tc.name, arguments: JSON.stringify(tc.args || {}) },
    }));
  }
  return { choices: [{ message, finish_reason: finishReason ?? (toolCalls ? 'tool_calls' : 'stop') }] };
}

const baseConfig = () => ({
  provider: 'llamacpp',
  base_url: 'http://localhost:8080',
  model: 'llama3',
  max_tokens: 4096,
  temperature: 0.7,
});

const sampleToolDefs = [{
  type: 'function',
  function: {
    name: 'lookup',
    description: 't',
    parameters: { type: 'object', properties: { q: { type: 'string' } } },
  },
}];

// =========================
// completeWithTools
// =========================

test('completeWithTools: 单轮文本 → 返回该文本', async () => {
  const { calls, restore } = mockFetchSequence([
    { json: chatResp({ content: 'hello' }) },
  ]);
  try {
    const out = await completeWithTools(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      {},
      baseConfig(),
    );
    assert.equal(out, 'hello');
    assert.equal(calls.length, 1);
  } finally { restore(); }
});

test('completeWithTools: 工具调用 → 二轮文本（messages 含 role:tool 回填）', async () => {
  const { calls, restore } = mockFetchSequence([
    { json: chatResp({ toolCalls: [{ name: 'lookup', args: { q: 'x' } }] }) },
    { json: chatResp({ content: 'done' }) },
  ]);
  try {
    const out = await completeWithTools(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      { lookup: async () => 'tool-result' },
      baseConfig(),
    );
    assert.equal(out, 'done');
    assert.equal(calls.length, 2);
    const secondMessages = calls[1].body.messages;
    const hasToolRole = secondMessages.some((m) => m.role === 'tool' && m.content === 'tool-result');
    assert.equal(hasToolRole, true, 'second turn body.messages must contain role:tool entry');
  } finally { restore(); }
});

test('completeWithTools: 400 → 降级到 complete(无 tools),保留原始 user 消息并附「未执行任何操作」说明', async () => {
  const { calls, restore } = mockFetchSequence([
    { status: 400, text: 'model does not support tools' },
    { json: chatResp({ content: 'plain-fallback' }) },
  ]);
  try {
    const out = await completeWithTools(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      {},
      baseConfig(),
    );
    assert.equal(out, 'plain-fallback');
    assert.equal(calls.length, 2);
    assert.equal(calls[1].body.tools, undefined, 'fallback body must NOT include tools');
    assert.equal(calls[1].body.messages.length, 1, 'note is merged into the trailing user message');
    const user = calls[1].body.messages[0];
    assert.equal(user.role, 'user');
    assert.match(user.content, /^hi\n\n/, 'fallback must reuse original user message');
    assert.match(user.content, /拒绝了工具调用请求，没有执行任何操作/);
  } finally { restore(); }
});

for (const status of [404, 422, 501]) {
  test(`completeWithTools: ${status} 同样降级`, async () => {
    const { calls, restore } = mockFetchSequence([
      { status, text: 'nope' },
      { json: chatResp({ content: 'plain-fallback' }) },
    ]);
    try {
      const out = await completeWithTools([{ role: 'user', content: 'hi' }], sampleToolDefs, {}, baseConfig());
      assert.equal(out, 'plain-fallback');
      assert.equal(calls.length, 2);
    } finally { restore(); }
  });
}

test('completeWithTools: 普通 500 抛出，不降级', async () => {
  const { calls, restore } = mockFetchSequence([
    { status: 500, text: 'out of memory' },
    { json: chatResp({ content: 'must-not-be-used' }) },
  ]);
  try {
    await assert.rejects(
      () => completeWithTools([{ role: 'user', content: 'hi' }], sampleToolDefs, {}, baseConfig()),
      (err) => err.status === 500 && /out of memory/.test(err.message),
    );
    assert.equal(calls.length, 1);
  } finally { restore(); }
});

test('completeWithTools: 普通 500 交给单次请求重试，重试成功后工具不重跑', async () => {
  const { calls, restore } = mockFetchSequence([
    { json: chatResp({ toolCalls: [{ name: 'lookup', args: { q: 'x' } }] }) },
    { status: 503, text: 'loading model' },
    { json: chatResp({ content: 'done' }) },
  ]);
  let handlerCalls = 0;
  try {
    const out = await completeWithTools(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      { lookup: async () => { handlerCalls += 1; return 'tool-result'; } },
      { ...baseConfig(), retry: { max: 1, delayMs: 0 } },
    );
    assert.equal(out, 'done');
    assert.equal(handlerCalls, 1);
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[2].body.messages, calls[1].body.messages);
  } finally { restore(); }
});

test('completeWithTools: 含 jinja 字样的 500 降级', async () => {
  const { calls, restore } = mockFetchSequence([
    { status: 500, text: '{"error":{"message":"Jinja Exception: tools param requires --jinja flag"}}' },
    { json: chatResp({ content: 'plain-fallback' }) },
  ]);
  try {
    const out = await completeWithTools([{ role: 'user', content: 'hi' }], sampleToolDefs, {}, baseConfig());
    assert.equal(out, 'plain-fallback');
    assert.equal(calls[1].body.tools, undefined);
  } finally { restore(); }
});

test('completeWithTools: 中途降级时说明里附已执行的操作清单', async () => {
  const { calls, restore } = mockFetchSequence([
    { json: chatResp({ toolCalls: [{ name: 'lookup', args: { q: 'x' } }] }) },
    { status: 400, text: 'bad request' },
    { json: chatResp({ content: 'summary' }) },
  ]);
  try {
    const out = await completeWithTools(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      { lookup: async () => 'tool-result' },
      baseConfig(),
    );
    assert.equal(out, 'summary');
    const sent = calls[2].body.messages;
    assert.equal(sent.some((m) => m.role === 'tool' || m.tool_calls), false);
    assert.match(sent.at(-1).content, /中途拒绝了工具调用请求/);
    assert.match(sent.at(-1).content, /\[成功\] lookup \{"q":"x"\} → tool-result/);
  } finally { restore(); }
});

test('completeWithTools: 网络错误抛出，不降级', async () => {
  const netErr = new TypeError('fetch failed');
  const { calls, restore } = mockFetchSequence([
    { error: netErr },
    { json: chatResp({ content: 'must-not-be-used' }) },
  ]);
  try {
    await assert.rejects(
      () => completeWithTools([{ role: 'user', content: 'hi' }], sampleToolDefs, {}, baseConfig()),
      (err) => err === netErr,
    );
    assert.equal(calls.length, 1);
  } finally { restore(); }
});

test('completeWithTools: 调用方中止透传为取消错误，不降级', async () => {
  const controller = new AbortController();
  const { calls, restore } = mockFetchSequence([
    { hang: true },
    { json: chatResp({ content: 'must-not-be-used' }) },
  ]);
  try {
    const pending = completeWithTools(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      {},
      { ...baseConfig(), signal: controller.signal, retry: { max: 2, delayMs: 0 } },
    );
    controller.abort();
    await assert.rejects(pending, (err) => err.name === 'ToolLoopCancelledError');
    assert.equal(calls.length, 1);
  } finally { restore(); }
});

test('completeWithTools: 单次请求超时得到 LLM_TIMEOUT，不降级', async () => {
  const { calls, restore } = mockFetchSequence([
    { hang: true },
    { json: chatResp({ content: 'must-not-be-used' }) },
  ]);
  try {
    await assert.rejects(
      () => completeWithTools([{ role: 'user', content: 'hi' }], sampleToolDefs, {}, { ...baseConfig(), timeoutMs: 20, retry: { max: 2, delayMs: 0 } }),
      (err) => err.code === 'LLM_TIMEOUT' && err.status === 504,
    );
    assert.equal(calls.length, 1);
  } finally { restore(); }
});

test('completeWithTools: finish_reason=length 时最后一个调用不执行', async () => {
  const { calls, restore } = mockFetchSequence([
    { json: chatResp({ toolCalls: [{ name: 'lookup', args: { q: 'a' } }, { name: 'lookup', args: { q: 'b' } }], finishReason: 'length' }) },
    { json: chatResp({ content: 'done' }) },
  ]);
  const ran = [];
  try {
    await completeWithTools(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      { lookup: async ({ q }) => { ran.push(q); return `r-${q}`; } },
      baseConfig(),
    );
    assert.deepEqual(ran, ['a']);
    const toolMsgs = calls[1].body.messages.filter((m) => m.role === 'tool');
    assert.equal(toolMsgs[0].content, 'r-a');
    assert.match(toolMsgs[1].content, /输出被截断（达到 max_tokens），该调用未执行/);
  } finally { restore(); }
});

test('completeWithTools: 对象参数直接用，缺 id 补齐并回写到 assistant 消息', async () => {
  const rawCalls = [
    { function: { name: 'lookup', arguments: { q: 'obj' } } },
    { id: '', type: 'function', function: { name: 'lookup', arguments: '' } },
  ];
  const { calls, restore } = mockFetchSequence([
    { json: { choices: [{ message: { role: 'assistant', content: null, tool_calls: rawCalls }, finish_reason: 'tool_calls' }] } },
    { json: chatResp({ content: 'done' }) },
  ]);
  const received = [];
  try {
    await completeWithTools(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      { lookup: async (args) => { received.push(args); return 'r'; } },
      baseConfig(),
    );
    assert.deepEqual(received, [{ q: 'obj' }, {}]);
    const sent = calls[1].body.messages;
    const assistant = sent.find((m) => m.role === 'assistant');
    assert.deepEqual(assistant.tool_calls.map((tc) => tc.id), ['call_0_0', 'call_0_1']);
    assert.deepEqual(assistant.tool_calls.map((tc) => tc.function.arguments), ['{"q":"obj"}', '{}']);
    assert.deepEqual(sent.filter((m) => m.role === 'tool').map((m) => m.tool_call_id), ['call_0_0', 'call_0_1']);
  } finally { restore(); }
});

test('completeWithTools: tool args 解析为对象传给 handler', async () => {
  const { restore } = mockFetchSequence([
    { json: chatResp({ toolCalls: [{ name: 'lookup', args: { a: 1, b: 2 } }] }) },
    { json: chatResp({ content: 'ok' }) },
  ]);
  let received = null;
  try {
    await completeWithTools(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      { lookup: async (args) => { received = args; return 'r'; } },
      baseConfig(),
    );
    assert.deepEqual(received, { a: 1, b: 2 }, 'handler must receive parsed object, not JSON string');
  } finally { restore(); }
});

test('completeWithTools: handler 抛 ToolLoopCancelledError → 透传不吞', async () => {
  const { restore } = mockFetchSequence([
    { json: chatResp({ toolCalls: [{ name: 'lookup', args: {} }] }) },
  ]);
  try {
    await assert.rejects(
      () => completeWithTools(
        [{ role: 'user', content: 'hi' }],
        sampleToolDefs,
        { lookup: async () => { throw new ToolLoopCancelledError('mock cancel'); } },
        baseConfig(),
      ),
      (err) => err.name === 'ToolLoopCancelledError' && /mock cancel/.test(err.message),
    );
  } finally { restore(); }
});


test('llamacpp: 未填 base_url 时回落到 llama.cpp 默认端口', async () => {
  const { calls, restore } = mockFetchSequence([{ json: chatResp({ content: 'ok' }) }]);
  try {
    await complete([{ role: 'user', content: 'hi' }], { provider: 'llamacpp', model: 'local' });
    assert.equal(calls[0].url, 'http://localhost:8080/v1/chat/completions');
  } finally { restore(); }
});
