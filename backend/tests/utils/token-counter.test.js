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

test('countTokens：纯中文按 0.78 计', () => {
  // 4 字 * 0.78 = 3.12 → ceil 4
  assert.equal(countTokens('你好世界'), 4);
  // 5 字 * 0.78 = 3.9 → ceil 4
  assert.equal(countTokens('你好世界呀'), 4);
});

test('countTokens：中英混合分别计算', () => {
  // 2 中 * 0.78 + 4 英 * 0.25 = 1.56 + 1 = 2.56 → ceil 3
  assert.equal(countTokens('你好abcd'), 3);
});

test('countMessages：累加每条消息 content 的 tokens', () => {
  const msgs = [
    { role: 'system', content: '你好' },        // ceil(2*0.78) = 2
    { role: 'user', content: 'abcd' },           // 1
    { role: 'assistant', content: '世界abcd' },  // ceil(2*0.78 + 4*0.25) = 3
  ];
  assert.equal(countMessages(msgs), 6);
});

test('countMessages：空数组返回 0', () => {
  assert.equal(countMessages([]), 0);
});
