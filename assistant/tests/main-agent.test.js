import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { buildHistory } from '../client/history.js';
import { createTestSandbox, freshImport, resetMockEnv } from '../../backend/tests/helpers/test-env.js';

const sandbox = createTestSandbox('assistant-main-agent-suite');
sandbox.setEnv();

after(() => {
  sandbox.cleanup();
});

async function collectStream(gen) {
  let text = '';
  for await (const chunk of gen) text += chunk;
  return text;
}

async function loadMainAgent() {
  return freshImport('assistant/server/main-agent.js');
}

test('buildContextString 会拼接 world/character/config 上下文', async () => {
  const { __testables: mainTestables } = await loadMainAgent();
  const context = mainTestables.buildContextString({
    world: { id: 'world-1', name: '云海', system_prompt: '世界设定', post_prompt: '世界后置' },
    character: { id: 'char-1', name: '阿塔', system_prompt: '角色设定', first_message: '你好' },
    config: { llm: { provider: 'mock', model: 'mock-model', temperature: 0.7, max_tokens: 256 }, global_system_prompt: '全局系统' },
  });

  assert.match(context, /当前世界.*云海/);
  assert.match(context, /当前角色.*阿塔/);
  assert.match(context, /全局配置.*mock-model/);
});

test('buildHistory 会把 proposal 摘要前置到同轮 assistant 消息', () => {
  const history = buildHistory([
    { role: 'user', content: '帮我改世界卡' },
    {
      role: 'proposal',
      proposal: {
        type: 'world-card',
        operation: 'update',
        changes: { name: '新世界', system_prompt: '世界设定' },
        entryOps: [{ op: 'create' }],
      },
    },
    { role: 'assistant', content: '我已经整理好了方案。' },
  ]);

  assert.equal(history.length, 2);
  assert.equal(history[0].role, 'user');
  assert.match(history[1].content, /\[世界卡修改\]/);
  assert.match(history[1].content, /name: 新世界/);
  assert.match(history[1].content, /我已经整理好了方案/);
});

test('buildHistory 会在同轮合并多个 proposal 摘要，并在新 user 轮次重置', () => {
  const history = buildHistory([
    { role: 'user', content: '先整理世界和角色' },
    { role: 'proposal', proposal: { type: 'world-card', operation: 'update', changes: { name: '白港' } } },
    { role: 'proposal', proposal: { type: 'character-card', operation: 'create', changes: { name: '伊瑟' } } },
    { role: 'assistant', content: '方案一并整理好了。' },
    { role: 'user', content: '继续补充' },
    { role: 'assistant', content: '第二轮不应带上旧提案摘要。' },
  ]);

  assert.equal(history.length, 4);
  assert.match(history[1].content, /\[世界卡修改\]/);
  assert.match(history[1].content, /\[角色卡新建\]/);
  assert.match(history[1].content, /---/);
  assert.doesNotMatch(history[3].content, /\[世界卡修改\]/);
});

test('buildContextString 在缺少上下文时返回默认提示', async () => {
  const { __testables: mainTestables } = await loadMainAgent();
  assert.match(
    mainTestables.buildContextString({}),
    /当前未选择世界或角色/,
  );
});

test('runAgent 只对读取类工具触发 onToolCall，并在多轮 history 下稳定流式返回', async () => {
  const { runAgent } = await loadMainAgent();
  resetMockEnv();
  process.env.MOCK_LLM_TOOL_CALLS = JSON.stringify([
    { name: 'preview_card', arguments: { target: 'world-card' } },
    { name: 'world_card_agent', arguments: { task: '整理修改方案' } },
  ]);
  process.env.MOCK_LLM_STREAM_CHUNKS = JSON.stringify(['已', '完成']);

  const calls = [];
  const toolCalls = [];
  const text = await collectStream(runAgent(
    '请调整设定',
    [
      { role: 'proposal', content: 'should-be-ignored' },
      ...Array.from({ length: 20 }, (_, index) => ({
        role: index % 2 === 0 ? 'user' : 'assistant',
        content: `历史消息 ${index}`,
      })),
    ],
    {},
    [
      {
        type: 'function',
        function: { name: 'preview_card' },
        execute: async (args) => {
          toolCalls.push(['preview_card', args]);
          return '当前卡片摘要';
        },
      },
      {
        type: 'function',
        function: { name: 'world_card_agent' },
        execute: async (args) => {
          toolCalls.push(['world_card_agent', args]);
          return '[world_card_agent] 提案已生成';
        },
      },
    ],
    {
      onToolCall: (name, args) => calls.push([name, args]),
    },
  ));

  assert.equal(text, '已完成');
  assert.deepEqual(calls, [['preview_card', { target: 'world-card' }]]);
  assert.deepEqual(toolCalls, [
    ['preview_card', { target: 'world-card' }],
    ['world_card_agent', { task: '整理修改方案' }],
  ]);
});

test('runAgent 在工具预检失败时会向上抛错', async () => {
  const { runAgent } = await loadMainAgent();
  resetMockEnv();
  process.env.MOCK_LLM_TOOL_CALLS = JSON.stringify([
    { name: 'preview_card', arguments: { target: 'world-card' } },
  ]);

  const gen = runAgent(
    '看看当前世界',
    [],
    {},
    [{
      type: 'function',
      function: { name: 'preview_card' },
      execute: async () => {
        throw new Error('tool exploded');
      },
    }],
  );

  await assert.rejects(
    collectStream(gen),
    /tool exploded/,
  );
});
