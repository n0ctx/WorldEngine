/**
 * session-rounds.js — 会话消息按“轮”切分（剧情摘要块与召回的原文切分单位）
 *
 * 对外暴露：
 *   splitRounds(messages) → [{ roundIndex, messages }]
 *   roundTokens(round)    → number
 *   roundDigest(round)    → string  一轮原文的内容指纹
 *   rangeDigest(digests)  → string  连续若干轮的合并指纹（压缩块据此判断来源是否被改动）
 */

import crypto from 'node:crypto';
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

/**
 * 一轮原文的内容指纹：按顺序取每条消息的 id、角色与库里的原始正文（含思考过程，与给模型看的版本无关），
 * 界面上对这一轮的任何编辑、删除或换消息都会让指纹变化。
 *
 * @param {{messages:Array<{id?:string, role:string, content:string}>}} round
 * @returns {string}
 */
export function roundDigest(round) {
  const hash = crypto.createHash('sha1');
  for (const msg of round.messages) {
    hash.update(`${msg.id ?? ''}\u0000${msg.role}\u0000${msg.content ?? ''}\u0001`);
  }
  return hash.digest('hex');
}

/**
 * 连续若干轮的合并指纹：压缩块记录建块时来源轮次的合并指纹，之后任一来源轮的指纹变了，块即失效。
 *
 * @param {string[]} digests  按轮次顺序排列的 roundDigest 结果
 * @returns {string}
 */
export function rangeDigest(digests) {
  return crypto.createHash('sha1').update(digests.join(',')).digest('hex');
}
