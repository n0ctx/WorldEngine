import test from 'node:test';
import assert from 'node:assert/strict';

import { __testables as mainTestables } from '../server/main-agent.js';
import { buildHistory } from '../client/history.js';

test('buildContextString 会拼接 world/character/config 上下文', () => {
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
