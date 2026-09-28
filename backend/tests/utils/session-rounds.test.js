import test from 'node:test';
import assert from 'node:assert/strict';

import { roundTokens, splitRounds } from '../../utils/session-rounds.js';

test('splitRounds：开场白（第 1 条 user 之前）并入第 1 轮', () => {
  const messages = [
    { role: 'assistant', content: '开场白' },
    { role: 'user', content: '你好' },
    { role: 'assistant', content: '回应' },
  ];
  const rounds = splitRounds(messages);
  assert.equal(rounds.length, 1);
  assert.equal(rounds[0].roundIndex, 1);
  assert.deepEqual(rounds[0].messages, messages);
});

test('splitRounds：一轮内多条 assistant 消息归入同一轮', () => {
  const messages = [
    { role: 'user', content: '第一句' },
    { role: 'assistant', content: '回应A' },
    { role: 'assistant', content: '回应B' },
    { role: 'user', content: '第二句' },
    { role: 'assistant', content: '回应C' },
  ];
  const rounds = splitRounds(messages);
  assert.equal(rounds.length, 2);
  assert.deepEqual(rounds[0], { roundIndex: 1, messages: messages.slice(0, 3) });
  assert.deepEqual(rounds[1], { roundIndex: 2, messages: messages.slice(3, 5) });
});

test('splitRounds：空会话返回空数组', () => {
  assert.deepEqual(splitRounds([]), []);
});

test('splitRounds：无 user 消息时返回空数组', () => {
  const messages = [{ role: 'assistant', content: '独白' }];
  assert.deepEqual(splitRounds(messages), []);
});

test('splitRounds：末尾是 user 消息时最后一轮只含该条', () => {
  const messages = [
    { role: 'user', content: '第一句' },
    { role: 'assistant', content: '回应A' },
    { role: 'user', content: '第二句' },
  ];
  const rounds = splitRounds(messages);
  assert.equal(rounds.length, 2);
  assert.deepEqual(rounds[1], { roundIndex: 2, messages: [messages[2]] });
});

test('roundTokens：累加轮内所有消息的 token 数', () => {
  const round = {
    roundIndex: 1,
    messages: [
      { role: 'user', content: '你好' },
      { role: 'assistant', content: 'hello' },
    ],
  };
  // 中文 2 字 ≈ 1 token；'hello' 5 字符 ≈ ceil(5*0.25) = 2 token
  assert.equal(roundTokens(round), 1 + 2);
});
