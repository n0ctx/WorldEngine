import test from 'node:test';
import assert from 'node:assert/strict';

import { findRegenerateSource } from '../client/message-helpers.js';

test('findRegenerateSource 跳过工具/计划消息，返回最近一条 user', () => {
  const result = findRegenerateSource(
    [
      { id: 'u1', role: 'user', content: '做一张角色卡' },
      { id: 'step-1', role: 'step', title: '分析', status: 'done' },
      { id: 'call-1', role: 'tool_call', toolName: 'preview_card', status: 'done' },
      { id: 'plan-1', role: 'plan_doc', content: '# plan' },
      { id: 'a1', role: 'assistant', content: '这是结果' },
    ],
    'a1',
  );

  assert.deepEqual(result, {
    index: 0,
    message: { id: 'u1', role: 'user', content: '做一张角色卡' },
  });
});

test('findRegenerateSource 遇到上一轮 assistant 时停止，避免串到更早 user', () => {
  const result = findRegenerateSource(
    [
      { id: 'u1', role: 'user', content: '第一轮' },
      { id: 'a1', role: 'assistant', content: '第一轮回复' },
      { id: 'step-2', role: 'step', title: '分析', status: 'done' },
      { id: 'a2', role: 'assistant', content: '孤立回复' },
    ],
    'a2',
  );

  assert.equal(result, null);
});
