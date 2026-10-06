import test from 'node:test';
import assert from 'node:assert/strict';

import {
  completeOpenAICompatibleWithTools,
  buildOpenAICompatibleHeaders,
} from '../../llm/providers/openai-compatible/index.js';
import { ToolLoopCancelledError } from '../../llm/tool-loop-control.js';

// 通用 fetch mock 工厂：按顺序返回预设响应；记录每次入参以便断言
function mockFetchSequence(responses) {
  const calls = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ url, body, headers: opts.headers });
    const next = responses.shift();
    if (!next) throw new Error('mock fetch exhausted');
    if (next.status && next.status >= 400) {
      return { ok: false, status: next.status, text: async () => next.text || '' };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => next.json,
      text: async () => '',
    };
  };
  return { calls, restore: () => { globalThis.fetch = origFetch; } };
}

function chatResp({ content, reasoning_content, toolCalls, finishReason } = {}) {
  const message = { role: 'assistant', content: content ?? null };
  if (reasoning_content) message.reasoning_content = reasoning_content;
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
  provider: 'openai',
  api_key: 'sk-test',
  base_url: 'https://api.openai.com/v1',
  model: 'gpt-4',
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
// completeOpenAICompatibleWithTools
// =========================

test('completeWithTools: 单轮文本 → 返回该文本', async () => {
  const { calls, restore } = mockFetchSequence([
    { json: chatResp({ content: 'hello' }) },
  ]);
  try {
    const out = await completeOpenAICompatibleWithTools(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      {},
      baseConfig(),
    );
    assert.equal(out, 'hello');
    assert.equal(calls.length, 1);
  } finally { restore(); }
});

test('completeWithTools: 单轮含 reasoning_content → 返回 <think>...</think>\\n${content} 格式', async () => {
  const { restore } = mockFetchSequence([
    { json: chatResp({ content: 'final-answer', reasoning_content: 'my-reasoning' }) },
  ]);
  try {
    const out = await completeOpenAICompatibleWithTools(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      {},
      baseConfig(),
    );
    assert.equal(out, '<think>my-reasoning</think>\nfinal-answer');
  } finally { restore(); }
});

test('completeWithTools: 工具调用 → 二轮文本（messages 含 role:tool 回填）', async () => {
  const { calls, restore } = mockFetchSequence([
    { json: chatResp({ toolCalls: [{ name: 'lookup', args: { q: 'x' } }] }) },
    { json: chatResp({ content: 'done' }) },
  ]);
  try {
    const out = await completeOpenAICompatibleWithTools(
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

test('completeWithTools: 4xx → 降级到 complete(无 tools)', async () => {
  const { calls, restore } = mockFetchSequence([
    { status: 400, text: 'bad' },
    { json: chatResp({ content: 'plain-fallback' }) },
  ]);
  try {
    const out = await completeOpenAICompatibleWithTools(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      {},
      baseConfig(),
    );
    assert.equal(out, 'plain-fallback');
    assert.equal(calls.length, 2);
    assert.equal(calls[1].body.tools, undefined, 'fallback body must NOT include tools');
    assert.match(calls[1].body.messages.at(-1).content, /^hi\n\n.*拒绝了工具调用请求，没有执行任何操作/s);
  } finally { restore(); }
});

test('completeWithTools: 对象参数直接传给 handler，回写的 arguments 序列化成字符串', async () => {
  const rawCalls = [{ id: 'c0', type: 'function', function: { name: 'lookup', arguments: { a: 1 } } }];
  const { calls, restore } = mockFetchSequence([
    { json: { choices: [{ message: { role: 'assistant', content: null, tool_calls: rawCalls }, finish_reason: 'tool_calls' }] } },
    { json: chatResp({ content: 'done' }) },
  ]);
  let received = null;
  try {
    await completeOpenAICompatibleWithTools(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      { lookup: async (args) => { received = args; return 'r'; } },
      baseConfig(),
    );
    assert.deepEqual(received, { a: 1 });
    const assistant = calls[1].body.messages.find((m) => m.role === 'assistant');
    assert.equal(assistant.tool_calls[0].function.arguments, '{"a":1}');
  } finally { restore(); }
});

test('completeWithTools: 缺 id 的调用补成 call_<iter>_<idx>，assistant 与 tool 消息里的 id 一致', async () => {
  const noIdCall = (name) => ({ type: 'function', function: { name, arguments: '{}' } });
  const { calls, restore } = mockFetchSequence([
    { json: { choices: [{ message: { role: 'assistant', content: null, tool_calls: [noIdCall('lookup')] }, finish_reason: 'tool_calls' }] } },
    { json: { choices: [{ message: { role: 'assistant', content: null, tool_calls: [noIdCall('lookup'), noIdCall('lookup')] }, finish_reason: 'tool_calls' }] } },
    { json: chatResp({ content: 'done' }) },
  ]);
  try {
    await completeOpenAICompatibleWithTools(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      { lookup: async () => 'r' },
      baseConfig(),
    );
    const sent = calls[2].body.messages;
    const assistantIds = sent.filter((m) => m.role === 'assistant').flatMap((m) => m.tool_calls.map((tc) => tc.id));
    const toolIds = sent.filter((m) => m.role === 'tool').map((m) => m.tool_call_id);
    assert.deepEqual(assistantIds, ['call_0_0', 'call_1_0', 'call_1_1']);
    assert.deepEqual(toolIds, assistantIds);
  } finally { restore(); }
});

test('completeWithTools: 参数不是合法 JSON 的调用不执行，回填原因', async () => {
  const rawCalls = [{ id: 'c0', type: 'function', function: { name: 'lookup', arguments: '{"q": "unterminated' } }];
  const { calls, restore } = mockFetchSequence([
    { json: { choices: [{ message: { role: 'assistant', content: null, tool_calls: rawCalls }, finish_reason: 'tool_calls' }] } },
    { json: chatResp({ content: 'done' }) },
  ]);
  let handlerCalls = 0;
  try {
    await completeOpenAICompatibleWithTools(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      { lookup: async () => { handlerCalls += 1; return 'r'; } },
      baseConfig(),
    );
    assert.equal(handlerCalls, 0);
    const sent = calls[1].body.messages;
    assert.match(sent.find((m) => m.role === 'tool').content, /^工具参数不是合法 JSON，未执行：.*\{"q": "unterminated。请重新输出完整参数$/);
    assert.equal(sent.find((m) => m.role === 'assistant').tool_calls[0].function.arguments, '{}');
  } finally { restore(); }
});

test('completeWithTools: finish_reason=length 时最后一个调用不执行', async () => {
  const { calls, restore } = mockFetchSequence([
    { json: chatResp({ toolCalls: [{ name: 'lookup', args: { q: 'a' } }, { name: 'lookup', args: { q: 'b' } }], finishReason: 'length' }) },
    { json: chatResp({ content: 'done' }) },
  ]);
  const ran = [];
  try {
    const out = await completeOpenAICompatibleWithTools(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      { lookup: async ({ q }) => { ran.push(q); return `r-${q}`; } },
      baseConfig(),
    );
    assert.equal(out, 'done');
    assert.deepEqual(ran, ['a']);
    const toolMsgs = calls[1].body.messages.filter((m) => m.role === 'tool');
    assert.equal(toolMsgs[0].content, 'r-a');
    assert.match(toolMsgs[1].content, /输出被截断（达到 max_tokens），该调用未执行/);
  } finally { restore(); }
});

test('completeWithTools: 500 抛出不降级；带重试配置时只重试那一次请求', async () => {
  const first = mockFetchSequence([{ status: 500, text: 'boom' }]);
  try {
    await assert.rejects(
      () => completeOpenAICompatibleWithTools([{ role: 'user', content: 'hi' }], sampleToolDefs, {}, baseConfig()),
      (err) => err.status === 500,
    );
    assert.equal(first.calls.length, 1);
  } finally { first.restore(); }

  const second = mockFetchSequence([
    { json: chatResp({ toolCalls: [{ name: 'lookup', args: {} }] }) },
    { status: 500, text: 'boom' },
    { json: chatResp({ content: 'done' }) },
  ]);
  let handlerCalls = 0;
  try {
    const out = await completeOpenAICompatibleWithTools(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      { lookup: async () => { handlerCalls += 1; return 'r'; } },
      { ...baseConfig(), retry: { max: 1, delayMs: 0 } },
    );
    assert.equal(out, 'done');
    assert.equal(handlerCalls, 1);
    assert.equal(second.calls.length, 3);
  } finally { second.restore(); }
});

test('completeWithTools: assistantMsg.reasoning_content 透传到下一轮 messages', async () => {
  const { calls, restore } = mockFetchSequence([
    {
      json: chatResp({
        toolCalls: [{ name: 'lookup', args: {} }],
        reasoning_content: 'mid-thought',
      }),
    },
    { json: chatResp({ content: 'done' }) },
  ]);
  try {
    await completeOpenAICompatibleWithTools(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      { lookup: async () => 'r' },
      baseConfig(),
    );
    const secondMessages = calls[1].body.messages;
    const assistant = secondMessages.find((m) => m.role === 'assistant');
    assert.ok(assistant, 'must have assistant msg in second turn');
    assert.equal(assistant.reasoning_content, 'mid-thought', 'reasoning_content must be carried over');
  } finally { restore(); }
});

test('completeWithTools: tool args 解析为对象传给 handler', async () => {
  const { restore } = mockFetchSequence([
    { json: chatResp({ toolCalls: [{ name: 'lookup', args: { a: 1, b: 2 } }] }) },
    { json: chatResp({ content: 'ok' }) },
  ]);
  let received = null;
  try {
    await completeOpenAICompatibleWithTools(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      { lookup: async (args) => { received = args; return 'r'; } },
      baseConfig(),
    );
    assert.deepEqual(received, { a: 1, b: 2 }, 'handler must receive parsed object');
  } finally { restore(); }
});

test('completeWithTools: handler 抛 ToolLoopCancelledError → 透传不吞', async () => {
  const { restore } = mockFetchSequence([
    { json: chatResp({ toolCalls: [{ name: 'lookup', args: {} }] }) },
  ]);
  try {
    await assert.rejects(
      () => completeOpenAICompatibleWithTools(
        [{ role: 'user', content: 'hi' }],
        sampleToolDefs,
        { lookup: async () => { throw new ToolLoopCancelledError('mock cancel'); } },
        baseConfig(),
      ),
      (err) => err.name === 'ToolLoopCancelledError' && /mock cancel/.test(err.message),
    );
  } finally { restore(); }
});

// completeWithTools header 由 buildOpenAICompatibleHeaders 统一构造:
// grok+conversationId 场景下应附加 x-grok-conv-id。
test('Authorization header: completeWithTools 使用 buildOpenAICompatibleHeaders(含 grok x-grok-conv-id)', async () => {
  const cfg = {
    ...baseConfig(),
    provider: 'grok',
    api_key: 'sk-grok',
    conversationId: 'conv_abc',
  };

  const { calls, restore } = mockFetchSequence([{ json: chatResp({ content: 'a' }) }]);
  try {
    await completeOpenAICompatibleWithTools(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      {},
      cfg,
    );
  } finally { restore(); }

  const expected = buildOpenAICompatibleHeaders(cfg);
  assert.deepEqual(calls[0].headers, expected, 'complete path headers must equal buildOpenAICompatibleHeaders');
});

test('prompt_cache_key: 仅 openai 官方在有 conversationId 时附加', async () => {
  const { calls, restore } = mockFetchSequence([
    { json: chatResp({ content: 'a' }) },
    { json: chatResp({ content: 'b' }) },
    { json: chatResp({ content: 'c' }) },
  ]);
  try {
    await completeOpenAICompatibleWithTools([{ role: 'user', content: 'q' }], sampleToolDefs, {}, { ...baseConfig(), conversationId: 'sess-1' });
    await completeOpenAICompatibleWithTools([{ role: 'user', content: 'q' }], sampleToolDefs, {}, baseConfig());
    await completeOpenAICompatibleWithTools([{ role: 'user', content: 'q' }], sampleToolDefs, {}, {
      ...baseConfig(), provider: 'deepseek', conversationId: 'sess-1',
    });
    assert.equal(calls[0].body.prompt_cache_key, 'sess-1');
    assert.equal('prompt_cache_key' in calls[1].body, false);
    assert.equal('prompt_cache_key' in calls[2].body, false);
  } finally {
    restore();
  }
});
