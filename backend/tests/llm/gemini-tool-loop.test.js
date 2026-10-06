import test from 'node:test';
import assert from 'node:assert/strict';

import { completeGeminiWithTools } from '../../llm/providers/gemini/index.js';

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

// helper：构造 Gemini API 响应 body
function gemResp({ text, toolCalls, thoughtSignatures, finishReason } = {}) {
  const parts = [];
  if (thoughtSignatures) {
    for (const sig of thoughtSignatures) parts.push({ text: sig, thought: true });
  }
  if (text) parts.push({ text });
  if (toolCalls) {
    for (const tc of toolCalls) {
      const part = { functionCall: { name: tc.name, args: tc.args || {} } };
      if (tc.signature) part.thoughtSignature = tc.signature;
      parts.push(part);
    }
  }
  return { candidates: [{ content: { parts }, finishReason: finishReason ?? 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } };
}

const baseConfig = () => ({ model: 'gemini-2.5-flash', api_key: 'test-key', max_tokens: 4096 });

const sampleToolDefs = [{
  type: 'function',
  function: {
    name: 'lookup',
    description: 't',
    parameters: { type: 'object', properties: { q: { type: 'string' } } },
  },
}];

// =========================
// completeGeminiWithTools
// =========================

test('completeGeminiWithTools: 单轮直接文本 → 返回该文本', async () => {
  const { calls, restore } = mockFetchSequence([
    { json: gemResp({ text: 'hello' }) },
  ]);
  try {
    const out = await completeGeminiWithTools(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      {},
      baseConfig(),
    );
    assert.equal(out, 'hello');
    assert.equal(calls.length, 1);
  } finally { restore(); }
});

test('completeGeminiWithTools: 工具调用 → 二轮文本（含 functionResponse 回填）', async () => {
  const { calls, restore } = mockFetchSequence([
    { json: gemResp({ toolCalls: [{ name: 'lookup', args: { q: 'x' } }] }) },
    { json: gemResp({ text: 'done' }) },
  ]);
  try {
    const out = await completeGeminiWithTools(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      { lookup: async () => 'tool-result' },
      baseConfig(),
    );
    assert.equal(out, 'done');
    assert.equal(calls.length, 2);
    const secondContents = calls[1].body.contents;
    const hasFunctionResponse = secondContents.some((c) =>
      c.role === 'user' && (c.parts || []).some((p) => p.functionResponse && p.functionResponse.name === 'lookup'),
    );
    assert.equal(hasFunctionResponse, true, 'second turn body.contents must contain functionResponse');
  } finally { restore(); }
});

test('completeGeminiWithTools: 保留 thought_signature 透传到下一轮', async () => {
  const { calls, restore } = mockFetchSequence([
    { json: gemResp({ toolCalls: [{ name: 'lookup', args: {}, signature: 'sig-xyz' }] }) },
    { json: gemResp({ text: 'ok' }) },
  ]);
  try {
    const out = await completeGeminiWithTools(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      { lookup: async () => 'r' },
      baseConfig(),
    );
    assert.equal(out, 'ok');
    const secondContents = calls[1].body.contents;
    const modelTurn = secondContents.find((c) => c.role === 'model');
    assert.ok(modelTurn, 'second turn must include model role');
    const hasSig = (modelTurn.parts || []).some((p) => p.thoughtSignature === 'sig-xyz');
    assert.equal(hasSig, true, 'thoughtSignature must be passed through verbatim');
  } finally { restore(); }
});

test('completeGeminiWithTools: 400 → 降级到无工具补全', async () => {
  const { calls, restore } = mockFetchSequence([
    { status: 400, text: 'tools not supported' },
    { json: gemResp({ text: 'plain-fallback' }) },
  ]);
  try {
    const out = await completeGeminiWithTools(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      {},
      baseConfig(),
    );
    assert.equal(out, 'plain-fallback');
    assert.equal(calls.length, 2);
    assert.equal(calls[1].body.tools, undefined, 'fallback body must NOT include tools');
    assert.match(lastText(calls[1].body.contents), /^hi\n\n.*拒绝了工具调用请求，没有执行任何操作/s);
  } finally { restore(); }
});

const lastText = (contents) => contents.at(-1).parts.map((p) => p.text || '').join('');
const hasFunctionParts = (contents) => contents.some((c) => (c.parts || []).some((p) => p.functionCall || p.functionResponse));

test('completeGeminiWithTools: finishReason=MAX_TOKENS 时最后一个调用不执行', async () => {
  const { calls, restore } = mockFetchSequence([
    { json: gemResp({ toolCalls: [{ name: 'lookup', args: { q: 'a' } }, { name: 'lookup', args: { q: 'b' } }], finishReason: 'MAX_TOKENS' }) },
    { json: gemResp({ text: 'done' }) },
  ]);
  const ran = [];
  try {
    const out = await completeGeminiWithTools(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      { lookup: async ({ q }) => { ran.push(q); return `r-${q}`; } },
      baseConfig(),
    );
    assert.equal(out, 'done');
    assert.deepEqual(ran, ['a']);
    const responses = calls[1].body.contents.at(-1).parts.map((p) => p.functionResponse.response.output);
    assert.equal(responses[0], 'r-a');
    assert.match(responses[1], /输出被截断（达到 max_tokens），该调用未执行/);
  } finally { restore(); }
});

test('completeGeminiWithTools: 触顶时无工具补全收到带操作清单的说明，不再丢掉工具历史', async () => {
  const { calls, restore } = mockFetchSequence([
    { json: gemResp({ toolCalls: [{ name: 'lookup', args: { q: 'a' } }] }) },
    { json: gemResp({ toolCalls: [{ name: 'lookup', args: { q: 'b' } }] }) },
    { json: gemResp({ text: 'summary' }) },
  ]);
  const loopRef = {};
  try {
    const out = await completeGeminiWithTools(
      [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }],
      sampleToolDefs,
      { lookup: async ({ q }) => `r-${q}` },
      { ...baseConfig(), maxIterations: 2, loopRef },
    );
    assert.equal(out, 'summary');
    assert.equal(calls.length, 3);
    const finalBody = calls[2].body;
    assert.equal(finalBody.tools, undefined);
    assert.equal(hasFunctionParts(finalBody.contents), false);
    assert.equal(finalBody.systemInstruction.parts[0].text, 'sys');
    const note = lastText(finalBody.contents);
    assert.match(note, /轮数已达上限（2 轮）/);
    assert.match(note, /1\. \[成功\] lookup \{"q":"a"\} → r-a/);
    assert.match(note, /2\. \[成功\] lookup \{"q":"b"\} → r-b/);
    assert.deepEqual(loopRef, { stopReason: 'max_iterations', toolCallCount: 2 });
  } finally { restore(); }
});

test('completeGeminiWithTools: 中途 400 降级时说明里附操作清单', async () => {
  const { calls, restore } = mockFetchSequence([
    { json: gemResp({ toolCalls: [{ name: 'lookup', args: { q: 'a' } }] }) },
    { status: 400, text: 'bad' },
    { json: gemResp({ text: 'summary' }) },
  ]);
  try {
    const out = await completeGeminiWithTools(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      { lookup: async () => 'r-a' },
      baseConfig(),
    );
    assert.equal(out, 'summary');
    assert.equal(hasFunctionParts(calls[2].body.contents), false);
    assert.match(lastText(calls[2].body.contents), /中途拒绝了工具调用请求[\s\S]*\[成功\] lookup/);
  } finally { restore(); }
});

