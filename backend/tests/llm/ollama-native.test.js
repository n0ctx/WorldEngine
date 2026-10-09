import test from 'node:test';
import assert from 'node:assert/strict';

import { complete, completeWithTools, streamChat } from '../../llm/providers/ollama/index.js';
import { PROVIDER_THINKING_LEVELS } from '../../../shared/thinking-levels.mjs';

// Ollama 走原生 /api/chat：请求体、逐行 JSON 流式响应、工具调用与思考字段
process.env.LOG_FILE = 'false';

function mockFetchSequence(responses) {
  const calls = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    const next = responses.shift();
    if (!next) throw new Error('mock fetch exhausted');
    const text = typeof next === 'string' ? next : JSON.stringify(next);
    return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return { calls, restore: () => { globalThis.fetch = origFetch; } };
}

const baseConfig = (extra = {}) => ({
  provider: 'ollama',
  base_url: 'http://localhost:11434',
  model: 'qwen3',
  max_tokens: 512,
  temperature: 0.7,
  ...extra,
});

const done = (message, extra = {}) => ({ message: { role: 'assistant', ...message }, done: true, done_reason: 'stop', ...extra });

test('complete: 发到 /api/chat，生成参数与采样参数写进 options，思考内容包成 <think>', async () => {
  const { calls, restore } = mockFetchSequence([done({ content: '答复', thinking: '想一想' })]);
  try {
    const text = await complete([{ role: 'user', content: 'hi' }], baseConfig({
      sampling: { top_p: 0.9, top_k: 40, min_p: 0.05, repetition_penalty: 1.1, presence_penalty: 0.5, frequency_penalty: null },
    }));
    assert.equal(text, '<think>想一想</think>\n答复');
    assert.equal(calls[0].url, 'http://localhost:11434/api/chat');
    assert.deepEqual(calls[0].body.options, {
      temperature: 0.7, num_predict: 512, top_p: 0.9, top_k: 40, min_p: 0.05, repeat_penalty: 1.1, presence_penalty: 0.5,
    });
    assert.equal(calls[0].body.stream, false);
    assert.equal('think' in calls[0].body, false);
  } finally { restore(); }
});

test('think：档位表里 ollama 的每个档位都写出 think 字段', async () => {
  const levels = PROVIDER_THINKING_LEVELS.ollama.map(({ value }) => value);
  const { calls, restore } = mockFetchSequence(levels.map(() => done({ content: 'ok' })));
  try {
    for (const thinking_level of levels) {
      await complete([{ role: 'user', content: 'hi' }], baseConfig({ thinking_level }));
    }
    assert.deepEqual(calls.map((c) => c.body.think), [false, 'low', 'medium', 'high']);
  } finally { restore(); }
});

test('消息转换：图片拆进 images，工具调用参数转对象，工具结果补 tool_name', async () => {
  const { calls, restore } = mockFetchSequence([done({ content: 'ok' })]);
  try {
    await complete([
      { role: 'system', content: '设定' },
      { role: 'user', content: [{ type: 'text', text: '看图' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,QUJD' } }] },
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'lookup', arguments: '{"q":"x"}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: '结果' },
    ], baseConfig());
    assert.deepEqual(calls[0].body.messages, [
      { role: 'system', content: '设定' },
      { role: 'user', content: '看图', images: ['QUJD'] },
      { role: 'assistant', content: '', tool_calls: [{ id: 'c1', function: { name: 'lookup', arguments: { q: 'x' } } }] },
      { role: 'tool', content: '结果', tool_call_id: 'c1', tool_name: 'lookup' },
    ]);
  } finally { restore(); }
});

test('streamChat: 逐行 JSON 拼出思考与正文，最后一行记用量', async () => {
  const lines = [
    { message: { role: 'assistant', content: '', thinking: '先想' }, done: false },
    { message: { role: 'assistant', content: '正' }, done: false },
    { message: { role: 'assistant', content: '文' }, done: false },
    { message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop', prompt_eval_count: 12, eval_count: 3 },
  ];
  const { calls, restore } = mockFetchSequence([lines.map((l) => JSON.stringify(l)).join('\n')]);
  const usageRef = {};
  try {
    let text = '';
    for await (const chunk of streamChat([{ role: 'user', content: 'hi' }], baseConfig({ usageRef }))) text += chunk;
    assert.equal(text, '<think>先想</think>\n正文');
    assert.equal(calls[0].body.stream, true);
    assert.deepEqual(usageRef, { prompt_tokens: 12, completion_tokens: 3 });
  } finally { restore(); }
});

test('streamChat: 流中途的 error 行抛出', async () => {
  const lines = [{ message: { role: 'assistant', content: '半' }, done: false }, { error: 'model crashed' }];
  const { restore } = mockFetchSequence([lines.map((l) => JSON.stringify(l)).join('\n')]);
  try {
    await assert.rejects(async () => {
      for await (const _chunk of streamChat([{ role: 'user', content: 'hi' }], baseConfig())) { /* drain */ }
    }, /model crashed/);
  } finally { restore(); }
});

test('completeWithTools: 原生 tool_calls（参数为对象）执行后回填，第二轮带 tool_name', async () => {
  const { calls, restore } = mockFetchSequence([
    done({ content: '', tool_calls: [{ function: { index: 0, name: 'lookup', arguments: { q: 'x' } } }] }),
    done({ content: '完成' }),
  ]);
  const seen = [];
  try {
    const out = await completeWithTools(
      [{ role: 'user', content: 'hi' }],
      [{ type: 'function', function: { name: 'lookup', description: 't', parameters: { type: 'object', properties: {} } } }],
      { lookup: async (args) => { seen.push(args); return '查到了'; } },
      baseConfig(),
    );
    assert.equal(out, '完成');
    assert.deepEqual(seen, [{ q: 'x' }]);
    assert.equal(calls[0].body.tools[0].function.name, 'lookup');
    const [, assistant, tool] = calls[1].body.messages;
    assert.deepEqual(assistant.tool_calls, [{ id: 'call_0_0', function: { name: 'lookup', arguments: { q: 'x' } } }]);
    assert.deepEqual(tool, { role: 'tool', content: '查到了', tool_call_id: 'call_0_0', tool_name: 'lookup' });
  } finally { restore(); }
});
