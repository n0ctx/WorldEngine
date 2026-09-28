/**
 * session-rounds.js — 会话消息按“轮”切分（memory-v2 中期摘要的原文切分单位）
 *
 * 对外暴露：
 *   splitRounds(messages) → [{ roundIndex, messages }]
 *   roundTokens(round)    → number
 */

import { countMessages } from './token-counter.js';

/**
 * 将会话消息按轮切分：第 k 轮 = 第 k 条 user 消息起，到第 k+1 条 user 消息前（不含）。
 * 第 1 条 user 消息之前的开场白（若有）并入第 1 轮；无 user 消息时返回空数组。
 *
 * @param {Array<{role:string, content:string}>} messages
 * @returns {Array<{roundIndex:number, messages:Array}>}
 */
export function splitRounds(messages) {
  const userIndexes = messages
    .map((msg, index) => (msg.role === 'user' ? index : -1))
    .filter((index) => index >= 0);

  if (userIndexes.length === 0) return [];

  const rounds = [];
  for (let i = 0; i < userIndexes.length; i++) {
    const start = i === 0 ? 0 : userIndexes[i];
    const end = userIndexes[i + 1] ?? messages.length;
    rounds.push({ roundIndex: i + 1, messages: messages.slice(start, end) });
  }
  return rounds;
}

/**
 * 求一轮消息的 token 总数。
 *
 * @param {{roundIndex:number, messages:Array}} round
 * @returns {number}
 */
export function roundTokens(round) {
  return countMessages(round.messages);
}
