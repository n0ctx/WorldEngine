import test from 'node:test';
import assert from 'node:assert/strict';

import { completeWithTools, resolveToolContext } from '../../llm/providers/ollama/index.js';
import { ToolLoopCancelledError } from '../../llm/tool-loop-control.js';
import { LLM_TOOL_RESOLUTION_MAX_TOKENS } from '../../utils/constants.js';

// 通用 fetch mock 工厂：按顺序返回预设响应；记录每次入参以便断言
function mockFetchSequence(responses) {
  const calls = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push({ url, body });
    const next = responses.shift();
    if (!next) throw new Error('mock fetch exhausted');
    if (next.status && next.status >= 400) {
      return { ok: false, status: next.status, text: async () => next.text || '' };
    }
    return { ok: true, status: 200, json: async () => next.json };
  };
  return { calls, restore: () => { globalThis.fetch = origFetch; } };
}

function chatResp({ content, toolCalls } = {}) {
  const message = { role: 'assistant', content: content ?? null };
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
  provider: 'ollama',
  base_url: 'http://localhost:11434',
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

test('completeWithTools: 4xx → 降级到 complete(无 tools),保留原始 user 消息', async () => {
  const { calls, restore } = mockFetchSequence([
    { status: 500, text: 'oops' },
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
    const hasUser = calls[1].body.messages.some((m) => m.role === 'user' && m.content === 'hi');
    assert.equal(hasUser, true, 'fallback must reuse original user message');
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

// =========================
// resolveToolContext
// =========================

test('resolveToolContext: 单轮无 tool_calls → 返回原 messages 引用', async () => {
  const { restore } = mockFetchSequence([
    { json: chatResp({ content: 'no-tools' }) },
  ]);
  const original = [{ role: 'user', content: 'hi' }];
  try {
    const out = await resolveToolContext(
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
    const out = await resolveToolContext(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      { lookup: async () => 'res' },
      baseConfig(),
    );
    assert.ok(Array.isArray(out), 'must return enriched messages array');
    const assistant = out.find((m) => m.role === 'assistant');
    assert.ok(assistant, 'enriched messages must include assistant entry');
    assert.ok(Array.isArray(assistant.tool_calls) && assistant.tool_calls.length > 0, 'assistant entry must carry tool_calls');
    const tool = out.find((m) => m.role === 'tool');
    assert.ok(tool, 'enriched messages must include a role:tool entry');
    assert.equal(tool.content, 'res');
  } finally { restore(); }
});

test('resolveToolContext: handler 抛 ToolLoopCancelledError → 基线行为为字符串化喂回(不透传)', async () => {
  // 注意：基线 (未迁移) 行为是 catch 后字符串化喂回模型，本测试锁定该基线。
  // 步骤 2 迁移到 runToolLoop 后，此测试将失败 → 届时更新为断言透传。
  const { calls, restore } = mockFetchSequence([
    { json: chatResp({ toolCalls: [{ name: 'lookup', args: {} }] }) },
    { json: chatResp({ content: 'final' }) },
  ]);
  try {
    const out = await resolveToolContext(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      { lookup: async () => { throw new ToolLoopCancelledError('mock cancel'); } },
      baseConfig(),
    );
    assert.ok(Array.isArray(out));
    const tool = out.find((m) => m.role === 'tool');
    assert.ok(tool, 'baseline: error is stringified and fed back as tool message');
    assert.match(tool.content, /工具执行失败/);
    assert.equal(calls.length, 2);
  } finally { restore(); }
});

test('resolveToolContext: 首轮 fetch body 含 temperature=0 + max_tokens=LLM_TOOL_RESOLUTION_MAX_TOKENS', async () => {
  const { calls, restore } = mockFetchSequence([
    { json: chatResp({ content: 'no-tools' }) },
  ]);
  try {
    await resolveToolContext(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      {},
      baseConfig(),
    );
    assert.equal(calls[0].body.temperature, 0);
    assert.equal(calls[0].body.max_tokens, LLM_TOOL_RESOLUTION_MAX_TOKENS);
  } finally { restore(); }
});

test('resolveToolContext: 二轮 fetch body temperature=0,max_tokens 沿用 config.max_tokens', async () => {
  const { calls, restore } = mockFetchSequence([
    { json: chatResp({ toolCalls: [{ name: 'lookup', args: {} }] }) },
    { json: chatResp({ content: 'final' }) },
  ]);
  try {
    await resolveToolContext(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      { lookup: async () => 'r' },
      { ...baseConfig(), max_tokens: 8000 },
    );
    assert.equal(calls.length, 2);
    assert.equal(calls[1].body.temperature, 0);
    assert.equal(calls[1].body.max_tokens, 8000);
    assert.notEqual(calls[1].body.max_tokens, LLM_TOOL_RESOLUTION_MAX_TOKENS, '二轮不应再用 RESOLUTION_MAX_TOKENS');
  } finally { restore(); }
});

test('resolveToolContext: 4xx 且未 enriched → 返回原 messages 引用', async () => {
  const { restore } = mockFetchSequence([
    { status: 500, text: 'oops' },
  ]);
  const original = [{ role: 'user', content: 'hi' }];
  try {
    const out = await resolveToolContext(
      original,
      sampleToolDefs,
      {},
      baseConfig(),
    );
    assert.equal(out, original, 'fallback before any enrichment must return original reference');
  } finally { restore(); }
});
