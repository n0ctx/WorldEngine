import test from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';

// 经 completeWithTools 顶层入口 + mock provider 的回合队列，验证重试、超时、取消都落在「单次模型请求」上。

// 整个文件共用一个沙箱：配置在首次读取后有缓存，逐用例换沙箱会让后面的用例读不到 mock provider。
const sandbox = createTestSandbox('llm-tools-turns', {
  provider_keys: { mock: 'secret' },
  llm: { provider: 'mock', model: 'mock-model', temperature: 0.5, max_tokens: 128 },
});
sandbox.setEnv();
process.env.WE_LLM_RETRY_MAX = '2';
process.env.WE_LLM_RETRY_DELAY_MS = '1';
const { completeWithTools, completeWithToolsDetailed } = await freshImport('backend/llm/index.js');

test.afterEach(() => resetMockEnv());
test.after(() => {
  sandbox.cleanup();
  delete process.env.WE_LLM_RETRY_MAX;
  delete process.env.WE_LLM_RETRY_DELAY_MS;
});

function countingTool(name, result = 'ok') {
  const tool = {
    type: 'function',
    function: { name, description: 't', parameters: { type: 'object', properties: {} } },
    calls: [],
    execute: async (args) => {
      tool.calls.push(args);
      return typeof result === 'function' ? result(args) : result;
    },
  };
  return tool;
}

const remainingTurns = () => JSON.parse(process.env.MOCK_LLM_TOOL_TURNS_QUEUE);
const userMsg = [{ role: 'user', content: 'x' }];

test('completeWithTools: 工具执行后模型请求报 500，重试成功，工具不重跑', async () => {
  process.env.MOCK_LLM_TOOL_TURNS_QUEUE = JSON.stringify([
    [{ name: 'write', arguments: { n: 1 } }],
    { error: 'upstream exploded', status: 500 },
    [{ name: 'write', arguments: { n: 2 } }],
    '全部完成',
  ]);
  const write = countingTool('write', '已写入');
  const loopRef = {};
  const out = await completeWithToolsDetailed(userMsg, [write], { configScope: 'main', loopRef });
  assert.equal(out.text, '全部完成');
  assert.deepEqual(write.calls, [{ n: 1 }, { n: 2 }]);
  assert.deepEqual(loopRef, { stopReason: 'completed', toolCallCount: 2 });
  assert.deepEqual(remainingTurns(), []);
  assert.deepEqual(out.messages.filter((m) => m.role === 'tool').map((m) => m.content), ['已写入', '已写入']);
});

test('completeWithTools: 重试用尽后抛 LLMError，已执行的工具仍只执行一次', async () => {
  process.env.MOCK_LLM_TOOL_TURNS_QUEUE = JSON.stringify([
    [{ name: 'write', arguments: {} }],
    { error: 'down 1', status: 503 },
    { error: 'down 2', status: 503 },
    { error: 'down 3', status: 503 },
    'never reached',
  ]);
  const write = countingTool('write');
  await assert.rejects(
    () => completeWithTools(userMsg, [write], { configScope: 'main' }),
    (err) => err.name === 'LLMError' && err.status === 503 && /down 3/.test(err.message),
  );
  assert.equal(write.calls.length, 1);
  assert.deepEqual(remainingTurns(), ['never reached']);
});

test('completeWithTools: 401 立即抛出，不重试', async () => {
  process.env.MOCK_LLM_TOOL_TURNS_QUEUE = JSON.stringify([{ error: 'invalid api key', status: 401 }, 'never reached']);
  await assert.rejects(
    () => completeWithTools(userMsg, [countingTool('write')], { configScope: 'main' }),
    (err) => err.name === 'LLMError' && err.status === 401 && err.provider === 'mock',
  );
  assert.deepEqual(remainingTurns(), ['never reached']);
});

test('completeWithTools: timeoutMs 是单次请求的窗口，超时得到 LLM_TIMEOUT 且不重试', async () => {
  process.env.MOCK_LLM_TOOL_TURNS_QUEUE = JSON.stringify([
    [{ name: 'write', arguments: {} }],
    { delayMs: 50, text: 'too late' },
    'never reached',
  ]);
  const write = countingTool('write');
  await assert.rejects(
    () => completeWithTools(userMsg, [write], { configScope: 'main', timeoutMs: 10, callType: 'assistant' }),
    (err) => err.name === 'LLMError' && err.code === 'LLM_TIMEOUT' && err.status === 504 && /assistant timed out after 10ms/.test(err.message),
  );
  assert.equal(write.calls.length, 1);
  assert.deepEqual(remainingTurns(), ['never reached']);
});

test('completeWithTools: 调用方 signal 中止 → ToolLoopCancelledError，后续工具不执行', async () => {
  process.env.MOCK_LLM_TOOL_TURNS_QUEUE = JSON.stringify([
    [{ name: 'stop', arguments: {} }, { name: 'write', arguments: {} }],
    'never reached',
  ]);
  const controller = new AbortController();
  const stop = countingTool('stop', () => { controller.abort(); return 'stopping'; });
  const write = countingTool('write');
  await assert.rejects(
    () => completeWithTools(userMsg, [stop, write], { configScope: 'main', signal: controller.signal }),
    (err) => err.name === 'ToolLoopCancelledError',
  );
  assert.equal(stop.calls.length, 1);
  assert.equal(write.calls.length, 0);
  assert.deepEqual(remainingTurns(), ['never reached']);
});

test('completeWithTools: 回合队列的降级项与截断项', async () => {
  process.env.MOCK_LLM_COMPLETE = '兜底回复';
  process.env.MOCK_LLM_TOOL_TURNS_QUEUE = JSON.stringify([
    { calls: [{ name: 'write', arguments: { n: 1 } }, { name: 'write', arguments: { n: 2 } }], truncated: true },
    { fallback: true },
  ]);
  const write = countingTool('write');
  const loopRef = {};
  const text = await completeWithTools(userMsg, [write], { configScope: 'main', loopRef });
  assert.equal(text, '兜底回复');
  assert.deepEqual(write.calls, [{ n: 1 }]);
  assert.deepEqual(loopRef, { stopReason: 'fallback_midway', toolCallCount: 1 });
});

test('completeWithTools: 旧变量 MOCK_LLM_TOOL_CALLS 等价于「一轮调用 + 一轮文本」', async () => {
  process.env.MOCK_LLM_TOOL_CALLS = JSON.stringify([{ name: 'write', arguments: { n: 1 } }, { name: 'missing', arguments: {} }]);
  process.env.MOCK_LLM_COMPLETE = '好了';
  const write = countingTool('write');
  const loopRef = {};
  const first = await completeWithToolsDetailed(userMsg, [write], { configScope: 'main', loopRef });
  assert.equal(first.text, '好了');
  assert.deepEqual(write.calls, [{ n: 1 }]);
  assert.deepEqual(loopRef, { stopReason: 'completed', toolCallCount: 1 });

  // MOCK_LLM_TOOL_CALLS_QUEUE：每次 completeWithTools 取一项，优先于 MOCK_LLM_TOOL_CALLS；取完后回到 MOCK_LLM_TOOL_CALLS
  process.env.MOCK_LLM_TOOL_CALLS_QUEUE = JSON.stringify([[{ name: 'write', arguments: { n: 2 } }], []]);
  await completeWithToolsDetailed(userMsg, [write], { configScope: 'main' });
  assert.deepEqual(write.calls, [{ n: 1 }, { n: 2 }]);
  await completeWithToolsDetailed(userMsg, [write], { configScope: 'main' });
  assert.equal(write.calls.length, 2);
  await completeWithToolsDetailed(userMsg, [write], { configScope: 'main' });
  assert.deepEqual(write.calls.at(-1), { n: 1 });
});
