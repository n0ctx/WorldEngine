import test from 'node:test';
import assert from 'node:assert/strict';

import { buildContinuationMessages } from '../../routes/stream-helpers.js';

const CONTINUE_INSTRUCTION = '请直接继续上一条 AI 回复，从上次停下的位置自然接续，不要重复已写内容，不要解释。';

test('续写模式（尾部为待续写 assistant）：仅追加一条 user 续写指令，不重复贴 originalContent', () => {
  const messages = [
    { role: 'system', content: 'system' },
    { role: 'user', content: '讲下去' },
    { role: 'assistant', content: '原始回复' },
  ];

  const result = buildContinuationMessages(messages, '原始回复');

  assert.deepEqual(result, [
    { role: 'system', content: 'system' },
    { role: 'user', content: '讲下去' },
    { role: 'assistant', content: '原始回复' },
    { role: 'user', content: CONTINUE_INSTRUCTION },
  ]);
  // originalContent 只出现一次（来自历史末尾），不被重复追加
  assert.equal(result.filter((m) => m.content === '原始回复').length, 1);
});

test('启用 suggestion 时拼到续写指令末尾（单次注入）', () => {
  const messages = [
    { role: 'system', content: 'system' },
    { role: 'user', content: '讲下去' },
    { role: 'assistant', content: '原始回复' },
  ];

  const result = buildContinuationMessages(messages, '原始回复', { suggestionText: '[选项生成]\n输出 next_prompt 块' });

  assert.equal(result.length, 4);
  assert.equal(result[3].role, 'user');
  assert.ok(result[3].content.startsWith('请直接继续上一条 AI 回复'));
  assert.ok(result[3].content.endsWith('[选项生成]\n输出 next_prompt 块'));
  // suggestion 仅出现一次
  assert.equal(result.filter((m) => m.content.includes('[选项生成]')).length, 1);
});

test('prefill provider 且未启用 suggestion：原样返回，末尾 assistant 即 prefill', () => {
  const messages = [
    { role: 'system', content: 'system' },
    { role: 'user', content: '讲下去' },
    { role: 'assistant', content: '原始回复' },
  ];

  const result = buildContinuationMessages(messages, '原始回复', { usePrefill: true });

  assert.deepEqual(result, messages);
});

test('prefill provider 但启用 suggestion：退回追加 user 续写指令（prefill 后无法再带指令）', () => {
  const messages = [
    { role: 'system', content: 'system' },
    { role: 'assistant', content: '原始回复' },
  ];

  const result = buildContinuationMessages(messages, '原始回复', { usePrefill: true, suggestionText: '[选项生成]' });

  assert.equal(result.length, 3);
  assert.equal(result[2].role, 'user');
  assert.ok(result[2].content.endsWith('[选项生成]'));
});

test('兜底：尾部非 assistant 时补贴 originalContent 再追加续写指令', () => {
  const messages = [
    { role: 'system', content: 'system' },
    { role: 'user', content: '讲下去' },
  ];

  const result = buildContinuationMessages(messages, '原始回复');

  assert.deepEqual(result, [
    { role: 'system', content: 'system' },
    { role: 'user', content: '讲下去' },
    { role: 'assistant', content: '原始回复' },
    { role: 'user', content: CONTINUE_INSTRUCTION },
  ]);
});
