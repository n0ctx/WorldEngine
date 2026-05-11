import test from 'node:test';
import assert from 'node:assert/strict';

import { completeGeminiWithTools, resolveToolContextGemini } from '../../llm/providers/gemini/index.js';
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

// helper：构造 Gemini API 响应 body
function gemResp({ text, toolCalls, thoughtSignatures } = {}) {
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
  return { candidates: [{ content: { parts } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } };
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
  } finally { restore(); }
});

// =========================
// resolveToolContextGemini
// =========================

test('resolveToolContextGemini: 单轮文本 → 返回原 messages 引用', async () => {
  const { restore } = mockFetchSequence([
    { json: gemResp({ text: 'no-tools' }) },
  ]);
  const original = [{ role: 'user', content: 'hi' }];
  try {
    const out = await resolveToolContextGemini(
      original,
      sampleToolDefs,
      {},
      baseConfig(),
    );
    assert.equal(out, original, 'must return the same reference when no tools were invoked');
  } finally { restore(); }
});

test('resolveToolContextGemini: 工具调用 → enriched messages 含 _geminiParts 与 thoughtSignature', async () => {
  const { restore } = mockFetchSequence([
    { json: gemResp({ toolCalls: [{ name: 'lookup', args: { q: 'x' }, signature: 'sig-abc' }] }) },
    { json: gemResp({ text: 'final' }) },
  ]);
  try {
    const out = await resolveToolContextGemini(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      { lookup: async () => 'res' },
      baseConfig(),
    );
    assert.ok(Array.isArray(out), 'must return enriched messages array');
    const assistant = out.find((m) => m.role === 'assistant');
    assert.ok(assistant, 'enriched messages must include assistant entry');
    assert.ok(Array.isArray(assistant._geminiParts), 'assistant entry must carry _geminiParts');
    const hasSig = assistant._geminiParts.some((p) => p.thoughtSignature === 'sig-abc');
    assert.equal(hasSig, true, '_geminiParts must preserve thoughtSignature');
  } finally { restore(); }
});

test('resolveToolContextGemini: handler 抛 ToolLoopCancelledError → 透传不吞', async () => {
  const { restore } = mockFetchSequence([
    { json: gemResp({ toolCalls: [{ name: 'lookup', args: {} }] }) },
  ]);
  try {
    await assert.rejects(
      () => resolveToolContextGemini(
        [{ role: 'user', content: 'hi' }],
        sampleToolDefs,
        { lookup: async () => { throw new ToolLoopCancelledError('mock cancel'); } },
        baseConfig(),
      ),
      (err) => err.name === 'ToolLoopCancelledError' && /mock cancel/.test(err.message),
    );
  } finally { restore(); }
});

test('resolveToolContextGemini: 首轮 fetch body 含 maxOutputTokens=1000 + temperature=0', async () => {
  const { calls, restore } = mockFetchSequence([
    { json: gemResp({ text: 'no-tools' }) },
  ]);
  try {
    await resolveToolContextGemini(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      {},
      baseConfig(),
    );
    const gen = calls[0].body.generationConfig || {};
    assert.equal(gen.maxOutputTokens, 1000);
    assert.equal(gen.temperature, 0);
  } finally { restore(); }
});

test('resolveToolContextGemini: 二轮 fetch body 含 maxOutputTokens=config.max_tokens', async () => {
  const { calls, restore } = mockFetchSequence([
    { json: gemResp({ toolCalls: [{ name: 'lookup', args: {} }] }) },
    { json: gemResp({ text: 'final' }) },
  ]);
  try {
    await resolveToolContextGemini(
      [{ role: 'user', content: 'hi' }],
      sampleToolDefs,
      { lookup: async () => 'r' },
      { ...baseConfig(), max_tokens: 8000 },
    );
    assert.equal(calls.length, 2);
    const gen = calls[1].body.generationConfig || {};
    assert.equal(gen.maxOutputTokens, 8000);
    assert.equal(gen.temperature, 0);
  } finally { restore(); }
});
