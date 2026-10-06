import test, { after, afterEach, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createTestConfig, createTestSandbox, freshImport } from '../helpers/test-env.js';

const RAW_ON = { logging: { mode: 'raw', llm_raw: { enabled: true } } };

const sandbox = createTestSandbox('raw-logger', RAW_ON);
sandbox.setEnv();
const rawDir = path.join(sandbox.root, 'logs', 'llm-raw');

let openai;
let ollama;
before(async () => {
  openai = await freshImport('backend/llm/providers/openai-compatible/index.js');
  ollama = await freshImport('backend/llm/providers/ollama/index.js');
});

const origFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = origFetch;
  fs.rmSync(rawDir, { recursive: true, force: true });
  sandbox.writeConfig(createTestConfig(RAW_ON));
});
after(() => sandbox.cleanup());

function mockFetch(responses) {
  globalThis.fetch = async () => {
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
}

function jsonResp(data) {
  return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
}

function sseResp(chunks) {
  const text = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new Response(text, { headers: { 'content-type': 'text/event-stream' } });
}

function readDumps() {
  if (!fs.existsSync(rawDir)) return [];
  return fs.readdirSync(rawDir).sort().map((name) => JSON.parse(fs.readFileSync(path.join(rawDir, name), 'utf-8')));
}

const openaiConfig = (extra = {}) => ({
  provider: 'openai',
  api_key: 'sk-test',
  base_url: 'https://api.openai.com/v1',
  model: 'gpt-4',
  max_tokens: 256,
  temperature: 0.5,
  callType: 'state_update',
  ...extra,
});

test('原始日志未开启时不建目录也不写文件', async () => {
  sandbox.writeConfig(createTestConfig({ logging: { mode: 'raw', llm_raw: { enabled: false } } }));
  mockFetch([jsonResp({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] })]);

  assert.equal(await openai.completeOpenAICompatible([{ role: 'user', content: 'hi' }], openaiConfig()), 'ok');
  assert.equal(fs.existsSync(rawDir), false);
});

test('非流式调用：请求与完整返回写在同一文件，含结束原因', async () => {
  const data = { choices: [{ message: { content: '{"a":1', reasoning_content: '想一想' }, finish_reason: 'length' }], usage: { prompt_tokens: 10, completion_tokens: 256 } };
  mockFetch([jsonResp(data)]);

  await openai.completeOpenAICompatible([{ role: 'user', content: 'hi' }], openaiConfig());

  const [dump] = readDumps();
  assert.equal(dump._meta.callType, 'state_update');
  assert.equal(dump.rawBody.messages[0].content, 'hi');
  assert.equal(dump.response.status, 'ok');
  assert.deepEqual(dump.response.body, data);
  assert.equal(typeof dump.response.durationMs, 'number');
});

test('流式调用：记下交给调用方的完整文本与结束原因', async () => {
  mockFetch([sseResp([
    { choices: [{ delta: { reasoning_content: '先' } }] },
    { choices: [{ delta: { reasoning_content: '想' } }] },
    { choices: [{ delta: { content: '你好' } }] },
    { choices: [{ delta: { content: '世界' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 4 } },
  ])]);

  let out = '';
  for await (const chunk of openai.streamOpenAICompatible([{ role: 'user', content: 'hi' }], openaiConfig({ callType: 'writing_main' }))) out += chunk;

  assert.equal(out, '<think>先想</think>\n你好世界');
  const [dump] = readDumps();
  assert.equal(dump.response.status, 'ok');
  assert.deepEqual(dump.response.stream, {
    text: '<think>先想</think>\n你好世界',
    finishReason: 'stop',
    usage: { prompt_tokens: 5, completion_tokens: 4 },
    completed: true,
  });
});

test('流式调用被调用方提前结束：标为 aborted 并保留已收到的部分', async () => {
  mockFetch([sseResp([
    { choices: [{ delta: { content: '第一段' } }] },
    { choices: [{ delta: { content: '第二段' } }] },
  ])]);

  for await (const chunk of openai.streamOpenAICompatible([{ role: 'user', content: 'hi' }], openaiConfig())) {
    assert.equal(chunk, '第一段');
    break;
  }

  const [dump] = readDumps();
  assert.equal(dump.response.status, 'aborted');
  assert.equal(dump.response.stream.completed, false);
  assert.equal(dump.response.stream.text, '第一段');
});

test('工具轮 400 退回无工具补全：该轮记下状态码与报错正文', async () => {
  mockFetch([
    new Response('tools not supported', { status: 400 }),
    jsonResp({ choices: [{ message: { content: '直接回答' }, finish_reason: 'stop' }] }),
  ]);
  const tools = [{ type: 'function', function: { name: 'lookup', parameters: { type: 'object', properties: {} } } }];

  const text = await openai.completeOpenAICompatibleWithTools([{ role: 'user', content: 'hi' }], tools, {}, openaiConfig({ callType: 'assistant' }));

  assert.equal(text, '直接回答');
  const dumps = readDumps();
  const toolTurn = dumps.find((d) => d._meta.callType === 'assistant:tools');
  const fallback = dumps.find((d) => d._meta.callType === 'assistant');
  assert.equal(toolTurn.response.status, 'error');
  assert.deepEqual(toolTurn.response.error, { status: 400, text: 'tools not supported' });
  assert.equal(fallback.response.status, 'ok');
});

test('连接失败：记为 error 并照常抛出', async () => {
  mockFetch([new TypeError('fetch failed')]);

  await assert.rejects(openai.completeOpenAICompatible([{ role: 'user', content: 'hi' }], openaiConfig()), /fetch failed/);

  const [dump] = readDumps();
  assert.equal(dump.response.status, 'error');
  assert.equal(dump.response.error.message, 'fetch failed');
});

test('本地模型：请求与返回都落盘', async () => {
  mockFetch([jsonResp({ choices: [{ message: { content: '本地回答' }, finish_reason: 'stop' }] })]);

  const text = await ollama.complete([{ role: 'user', content: 'hi' }], {
    provider: 'ollama',
    base_url: 'http://127.0.0.1:11434',
    model: 'qwen',
    max_tokens: 128,
    temperature: 0.3,
    callType: 'entry_match',
  });

  assert.equal(text, '本地回答');
  const [dump] = readDumps();
  assert.equal(dump._meta.provider, 'ollama');
  assert.equal(dump._meta.callType, 'entry_match');
  assert.equal(dump.rawBody.model, 'qwen');
  assert.equal(dump.response.body.choices[0].message.content, '本地回答');
});
