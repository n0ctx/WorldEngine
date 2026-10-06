import test from 'node:test';
import assert from 'node:assert/strict';

import { completeAnthropicWithTools } from '../../llm/providers/anthropic/index.js';

// 按顺序返回预设响应的 fetch mock；记录每次请求体
function mockFetchSequence(responses) {
  const calls = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    const next = responses.shift();
    if (!next) throw new Error('mock fetch exhausted');
    if (next.status && next.status >= 400) {
      return { ok: false, status: next.status, text: async () => next.text || '' };
    }
    return { ok: true, status: 200, json: async () => next.json };
  };
  return { calls, restore: () => { globalThis.fetch = origFetch; } };
}

function anthropicResp({ text, toolUses, stopReason } = {}) {
  const content = [];
  if (text) content.push({ type: 'text', text });
  for (const [i, tu] of (toolUses || []).entries()) {
    content.push({ type: 'tool_use', id: tu.id || `toolu_${i}`, name: tu.name, input: tu.input || {} });
  }
  return {
    content,
    stop_reason: stopReason ?? (toolUses ? 'tool_use' : 'end_turn'),
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

const baseConfig = () => ({
  provider: 'anthropic',
  api_key: 'sk-ant-test',
  base_url: 'https://anthropic.example',
  model: 'claude-test',
  max_tokens: 1024,
  temperature: 0.3,
});

const sampleToolDefs = [{
  type: 'function',
  function: {
    name: 'lookup',
    description: 't',
    parameters: { type: 'object', properties: { q: { type: 'string' } } },
  },
}];

const toolResults = (body) => body.messages.at(-1).content.filter((b) => b.type === 'tool_result');

test('completeAnthropicWithTools: 工具调用 → 二轮文本，第二轮带 tool_use 与 tool_result', async () => {
  const { calls, restore } = mockFetchSequence([
    { json: anthropicResp({ text: 'let me check', toolUses: [{ id: 'toolu_a', name: 'lookup', input: { q: 'x' } }] }) },
    { json: anthropicResp({ text: 'done' }) },
  ]);
  let received = null;
  const loopRef = {};
  try {
    const out = await completeAnthropicWithTools(
      [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }],
      sampleToolDefs,
      { lookup: async (args) => { received = args; return 'tool-result'; } },
      { ...baseConfig(), loopRef },
    );
    assert.equal(out, 'done');
    assert.deepEqual(received, { q: 'x' });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].body.tools[0].name, 'lookup');
    const second = calls[1].body.messages;
    const assistant = second.find((m) => m.role === 'assistant');
    assert.deepEqual(assistant.content.find((b) => b.type === 'tool_use'), { type: 'tool_use', id: 'toolu_a', name: 'lookup', input: { q: 'x' } });
    const results = toolResults(calls[1].body);
    assert.equal(results.length, 1);
    assert.equal(results[0].tool_use_id, 'toolu_a');
    assert.equal(results[0].content, 'tool-result');
    assert.deepEqual(loopRef, { stopReason: 'completed', toolCallCount: 1 });
  } finally { restore(); }
});

test('completeAnthropicWithTools: stop_reason=max_tokens 时最后一个调用不执行', async () => {
  const { calls, restore } = mockFetchSequence([
    {
      json: anthropicResp({
        toolUses: [{ id: 'toolu_a', name: 'lookup', input: { q: 'a' } }, { id: 'toolu_b', name: 'lookup', input: { q: 'b' } }],
        stopReason: 'max_tokens',
      }),
    },
    { json: anthropicResp({ text: 'done' }) },
  ]);
  const ran = [];
  try {
    const out = await completeAnthropicWithTools(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      { lookup: async ({ q }) => { ran.push(q); return `r-${q}`; } },
      baseConfig(),
    );
    assert.equal(out, 'done');
    assert.deepEqual(ran, ['a']);
    const results = toolResults(calls[1].body);
    assert.equal(results[0].content, 'r-a');
    assert.equal(results[1].tool_use_id, 'toolu_b');
    assert.match(results[1].content, /输出被截断（达到 max_tokens），该调用未执行/);
  } finally { restore(); }
});

test('completeAnthropicWithTools: 首轮 400 降级，无工具补全收到「没有执行任何操作」的说明', async () => {
  const { calls, restore } = mockFetchSequence([
    { status: 400, text: 'tools unsupported' },
    { json: anthropicResp({ text: 'plain' }) },
  ]);
  try {
    const out = await completeAnthropicWithTools([{ role: 'user', content: 'hi' }], sampleToolDefs, {}, baseConfig());
    assert.equal(out, 'plain');
    assert.equal(calls[1].body.tools, undefined);
    assert.match(JSON.stringify(calls[1].body.messages), /拒绝了工具调用请求，没有执行任何操作/);
  } finally { restore(); }
});
