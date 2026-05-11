import test from 'node:test';
import assert from 'node:assert/strict';

import { completeWithTools } from '../../llm/providers/ollama/index.js';
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

