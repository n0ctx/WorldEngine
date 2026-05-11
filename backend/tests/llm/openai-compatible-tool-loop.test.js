import test from 'node:test';
import assert from 'node:assert/strict';

import {
  completeOpenAICompatibleWithTools,
  resolveToolContextOpenAI,
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

function chatResp({ content, reasoning_content, toolCalls } = {}) {
  const message = { role: 'assistant', content: content ?? null };
  if (reasoning_content) message.reasoning_content = reasoning_content;
  if (toolCalls) {
    message.tool_calls = toolCalls.map((tc, i) => ({
      id: tc.id || `c${i}`,
      type: 'function',
      function: { name: tc.name, arguments: JSON.stringify(tc.args || {}) },
    }));
  }
  return { choices: [{ message }] };
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
  } finally { restore(); }
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

// =========================
// resolveToolContextOpenAI
// =========================

test('resolveToolContext: 单轮无 tool_calls → 返回原 messages 引用', async () => {
  const { restore } = mockFetchSequence([
    { json: chatResp({ content: 'no-tools' }) },
  ]);
  const original = [{ role: 'user', content: 'hi' }];
  try {
    const out = await resolveToolContextOpenAI(
      original,
      sampleToolDefs,
      {},
      baseConfig(),
    );
    assert.equal(out, original, 'must return same reference when no tools were invoked');
  } finally { restore(); }
});

test('resolveToolContext: 工具调用 → 返回 enriched messages 含 role:tool 与 assistant.tool_calls', async () => {
  const { restore } = mockFetchSequence([
    { json: chatResp({ toolCalls: [{ name: 'lookup', args: { q: 'x' } }] }) },
    { json: chatResp({ content: 'final' }) },
  ]);
  try {
    const out = await resolveToolContextOpenAI(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      { lookup: async () => 'res' },
      baseConfig(),
    );
    assert.ok(Array.isArray(out), 'must return enriched messages array');
    const assistant = out.find((m) => m.role === 'assistant');
    assert.ok(assistant, 'enriched messages must include assistant entry');
    assert.ok(Array.isArray(assistant.tool_calls) && assistant.tool_calls.length > 0, 'assistant must carry tool_calls');
    const tool = out.find((m) => m.role === 'tool');
    assert.ok(tool, 'enriched messages must include a role:tool entry');
    assert.equal(tool.content, 'res');
  } finally { restore(); }
});

test('resolveToolContext: handler 抛 ToolLoopCancelledError → 透传不吞', async () => {
  const { restore } = mockFetchSequence([
    { json: chatResp({ toolCalls: [{ name: 'lookup', args: {} }] }) },
  ]);
  try {
    await assert.rejects(
      () => resolveToolContextOpenAI(
        [{ role: 'user', content: 'hi' }],
        sampleToolDefs,
        { lookup: async () => { throw new ToolLoopCancelledError('mock cancel'); } },
        baseConfig(),
      ),
      (err) => err.name === 'ToolLoopCancelledError' && /mock cancel/.test(err.message),
    );
  } finally { restore(); }
});

test('resolveToolContext: 首轮 fetch body 含 max_tokens=1000;二轮含 max_tokens=config.max_tokens', async () => {
  const { calls, restore } = mockFetchSequence([
    { json: chatResp({ toolCalls: [{ name: 'lookup', args: {} }] }) },
    { json: chatResp({ content: 'final' }) },
  ]);
  try {
    await resolveToolContextOpenAI(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      { lookup: async () => 'r' },
      { ...baseConfig(), max_tokens: 8000 },
    );
    assert.equal(calls.length, 2);
    assert.equal(calls[0].body.max_tokens, 1000, '首轮 max_tokens 应为 1000');
    assert.equal(calls[1].body.max_tokens, 8000, '二轮 max_tokens 应沿用 config.max_tokens');
  } finally { restore(); }
});

// 该测试断言两条路径(complete/resolve)的 Authorization/header 由 buildOpenAICompatibleHeaders 统一构造:
// grok+conversationId 场景下 resolve 路径应同样附加 x-grok-conv-id。
// 迁移到 runToolLoop 后两路统一使用 buildOpenAICompatibleHeaders, 该测试启用。
test('Authorization header 一致性: complete 与 resolve 都用 buildOpenAICompatibleHeaders(含 grok x-grok-conv-id)', async () => {
  const cfg = {
    ...baseConfig(),
    provider: 'grok',
    api_key: 'sk-grok',
    conversationId: 'conv_abc',
  };

  // 1. completeWithTools 单轮
  const seq1 = mockFetchSequence([{ json: chatResp({ content: 'a' }) }]);
  try {
    await completeOpenAICompatibleWithTools(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      {},
      cfg,
    );
  } finally { seq1.restore(); }

  // 2. resolveToolContext 单轮
  const seq2 = mockFetchSequence([{ json: chatResp({ content: 'b' }) }]);
  try {
    await resolveToolContextOpenAI(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      {},
      cfg,
    );
  } finally { seq2.restore(); }

  const expected = buildOpenAICompatibleHeaders(cfg);
  assert.deepEqual(seq1.calls[0].headers, expected, 'complete path headers must equal buildOpenAICompatibleHeaders');
  assert.deepEqual(seq2.calls[0].headers, expected, 'resolve path headers must equal buildOpenAICompatibleHeaders');
});
