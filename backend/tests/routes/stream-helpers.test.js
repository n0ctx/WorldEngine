import test from 'node:test';
import assert from 'node:assert/strict';

import { buildContinuationMessages } from '../../routes/stream-helpers.js';

test('buildContinuationMessages 统一改写为 assistant prefill + user 续写指令', () => {
  const messages = [
    { role: 'system', content: 'system' },
    { role: 'user', content: '讲下去' },
  ];

  const result = buildContinuationMessages(messages, '原始回复');

  assert.deepEqual(result, [
    { role: 'system', content: 'system' },
    { role: 'user', content: '讲下去' },
    { role: 'assistant', content: '原始回复' },
    { role: 'user', content: '请直接继续上一条 AI 回复，从上次停下的位置自然接续，不要重复已写内容，不要解释。' },
  ]);
});

test('buildContinuationMessages 启用 suggestion 时拼到续写指令末尾', () => {
  const messages = [
    { role: 'system', content: 'system' },
    { role: 'user', content: '讲下去' },
  ];

  const result = buildContinuationMessages(messages, '原始回复', { suggestionText: '[选项生成]\n输出 next_prompt 块' });

  assert.equal(result.length, 4);
  assert.equal(result[2].role, 'assistant');
  assert.equal(result[3].role, 'user');
  assert.ok(result[3].content.startsWith('请直接继续上一条 AI 回复'));
  assert.ok(result[3].content.endsWith('[选项生成]\n输出 next_prompt 块'));
});

test('buildContinuationMessages 尾部非 user 时仍补 user 续写指令', () => {
  const messages = [
    { role: 'system', content: 'system' },
    { role: 'assistant', content: '前文' },
  ];

  const result = buildContinuationMessages(messages, '原始回复');

  assert.deepEqual(result, [
    { role: 'system', content: 'system' },
    { role: 'assistant', content: '前文' },
    { role: 'user', content: '请直接继续上一条 AI 回复，从上次停下的位置自然接续，不要重复已写内容，不要解释。' },
  ]);
});
