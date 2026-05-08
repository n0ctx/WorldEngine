import test from 'node:test';
import assert from 'node:assert/strict';

import { countMessages, countTokens } from '../../utils/token-counter.js';

test('countTokens：空串/nullish 返回 0', () => {
  assert.equal(countTokens(''), 0);
  assert.equal(countTokens(null), 0);
  assert.equal(countTokens(undefined), 0);
});

test('countTokens：纯英文按 0.25 计', () => {
  // "abcd" → 4 字符 * 0.25 = 1
  assert.equal(countTokens('abcd'), 1);
  // "abcde" → 5 * 0.25 = 1.25 → ceil 2
  assert.equal(countTokens('abcde'), 2);
});

test('countTokens：纯中文按 0.5 计', () => {
  // 4 字 * 0.5 = 2
  assert.equal(countTokens('你好世界'), 2);
});

test('countTokens：中英混合分别计算', () => {
  // 2 中 * 0.5 + 4 英 * 0.25 = 1 + 1 = 2
  assert.equal(countTokens('你好abcd'), 2);
});

test('countMessages：累加每条消息 content 的 tokens', () => {
  const msgs = [
    { role: 'system', content: '你好' },        // 1
    { role: 'user', content: 'abcd' },           // 1
    { role: 'assistant', content: '世界abcd' },  // ceil(2*0.5 + 4*0.25) = 2
  ];
  assert.equal(countMessages(msgs), 4);
});

test('countMessages：空数组返回 0', () => {
  assert.equal(countMessages([]), 0);
});
