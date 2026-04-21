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
