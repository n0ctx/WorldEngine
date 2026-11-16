/**
 * plan.js — 上下文压缩内核（纯函数，无 I/O）：把模型提交的压缩动作校验成可写入的块
 *
 * 模型每个动作给出 { start, end, topic, summary }：
 *   - 两端都是轮次（「第12轮」「12」「R12」）：把这段原文写成一级块。每一轮都必须仍是原文、存在、
 *     不在保护区；范围伸进保护区时截到保护区之前（截完一轮不剩就跳过并提示）。范围不足
 *     CONTEXT_MIN_FOLD_TOKENS 时拒绝，除非它两边已是块或保护区、只能这样整段压。
 *   - 两端都是块（「b3」）：把 bN 到 bM 之间首尾相接的在用块提炼成上一级块（三级再合成三级），
 *     中间不能夹原文轮次，至少两个块。
 * 每条动作单独校验：引用不存在、格式不对、摘要为空 / 太短 / 太长 / 不比来源更短，都只拒绝该条，
 * 报错写回给模型改好后重交；同一批里后提交的范围与前面已通过的重叠时跳过并提示。各范围互不重叠，
 * 部分写入不会让视图不一致。
 *
 * 对外暴露：
 *   parseRef(text) → { kind:'round', round } | { kind:'block', no } | null
 *   planCompression(actions, ctx) → { planned, errors, warnings }
 */

import { blockTokens } from './view.js';
import { countTokens } from '../../utils/token-counter.js';
import {
  CONTEXT_MIN_FOLD_TOKENS,
  CONTEXT_SUMMARY_MAX_CHARS,
  CONTEXT_SUMMARY_MAX_SOURCE_RATIO,
  CONTEXT_SUMMARY_MIN_CHARS,
} from '../../utils/constants.js';

const BLOCK_REF = /^\s*b(\d+)\s*$/i;
const ROUND_REF = /^\s*(?:第\s*|R|#)?\s*(\d+)\s*轮?\s*$/i;

export function parseRef(text) {
  const value = String(text ?? '');
  const block = value.match(BLOCK_REF);
  if (block) return { kind: 'block', no: Number(block[1]) };
  const round = value.match(ROUND_REF);
  if (round) return { kind: 'round', round: Number(round[1]) };
  return null;
}

function label(action) {
  return `${action.start ?? '?'}–${action.end ?? '?'}`;
}

/** 一段原文轮次 → 一级块的计划；失败返回 { error } 或 { warning } */
function planRounds(from, to, ctx) {
  const { units, view, protectedSet, shownRounds } = ctx;
  if (from < 1 || to > units.length) return { error: `第${from}–${to}轮超出现有轮次（共 ${units.length} 轮）` };
  for (let round = from; round <= to; round++) {
    if (shownRounds && !shownRounds.has(round) && !protectedSet.has(round) && !view.covered.has(round)) {
      return { error: `第${round}轮这次没有提供原文，不能压缩` };
    }
    if (view.covered.has(round)) {
      const owner = view.active.find((block) => round >= block.fromRound && round <= block.toRound);
      return { error: `第${round}轮已在块 b${owner?.no} 里，原文轮次范围不能包含已压缩的轮次` };
    }
  }
  let end = to;
  for (let round = from; round <= to; round++) {
    if (protectedSet.has(round)) { end = round - 1; break; }
  }
  if (end < from) return { warning: `第${from}–${to}轮在保护区内（最近的剧情），已跳过` };
  const slice = units.slice(from - 1, end);
  const rawTokens = slice.reduce((sum, unit) => sum + unit.tokens, 0);
  const boundedBefore = from === 1 || view.covered.has(from - 1);
  const boundedAfter = end === units.length || view.covered.has(end + 1) || protectedSet.has(end + 1);
  if (rawTokens < CONTEXT_MIN_FOLD_TOKENS && !(boundedBefore && boundedAfter)) {
    return { error: `第${from}–${end}轮只有约 ${rawTokens} token，太短，请和相邻轮次合成一段` };
  }
  const warning = end < to ? `第${end + 1}–${to}轮在保护区内，范围已截到第${end}轮` : null;
  return { block: { tier: 1, fromRound: from, toRound: end, consumes: [], sourceTokens: rawTokens, rawTokens }, warning };
}

/** bN 到 bM 的在用块 → 上一级块的计划 */
function planBlocks(startNo, endNo, ctx) {
  const { view } = ctx;
  const first = view.active.find((block) => block.no === startNo);
  const last = view.active.find((block) => block.no === endNo);
  if (!first || !last) return { error: `b${!first ? startNo : endNo} 不是在用的块` };
  const [lo, hi] = first.fromRound <= last.fromRound ? [first, last] : [last, first];
  const members = view.active.filter((block) => block.fromRound >= lo.fromRound && block.toRound <= hi.toRound);
  if (members.length < 2) return { error: `b${startNo}–b${endNo} 只含一个块，提炼至少要两个相邻的块` };
  for (let i = 1; i < members.length; i++) {
    if (members[i].fromRound !== members[i - 1].toRound + 1) {
      return { error: `b${members[i - 1].no} 与 b${members[i].no} 之间夹着原文轮次，请先压缩这几轮或分开提炼` };
    }
  }
  const tier = Math.min(3, Math.min(...members.map((block) => block.tier)) + 1);
  return {
    block: {
      tier,
      fromRound: lo.fromRound,
      toRound: hi.toRound,
      consumes: members.map((block) => block.id),
      sourceTokens: members.reduce((sum, block) => sum + blockTokens(block), 0),
      rawTokens: members.reduce((sum, block) => sum + block.rawTokens, 0),
    },
  };
}

/** 动作两端解析成同类的范围：{ kind:'round', from, to } / { kind:'block', from, to }（块号），或 { error } */
function resolveRange(action) {
  const start = parseRef(action.start);
  const end = parseRef(action.end ?? action.start);
  if (!start || !end) return { error: `${label(action)}：范围两端要写成「第N轮」或「bN」` };
  if (start.kind !== end.kind) return { error: `${label(action)}：范围两端要么都是轮次、要么都是块` };
  if (start.kind === 'block') return { kind: 'block', from: start.no, to: end.no };
  return { kind: 'round', from: Math.min(start.round, end.round), to: Math.max(start.round, end.round) };
}

/** 按范围种类分派：原文轮次与块各有一套规则 */
const PLANNERS = { round: planRounds, block: planBlocks };

function planOne(action, ctx) {
  const range = resolveRange(action);
  if (range.error) return range;
  return PLANNERS[range.kind](range.from, range.to, ctx);
}

/** 摘要本身的长度要求；不满足时返回报错文字 */
function summaryProblem(block) {
  const text = block.summary;
  if (!text) return '摘要为空';
  if ([...text].length < CONTEXT_SUMMARY_MIN_CHARS) return `摘要少于 ${CONTEXT_SUMMARY_MIN_CHARS} 字`;
  const max = CONTEXT_SUMMARY_MAX_CHARS[block.tier];
  if ([...text].length > max) return `${block.tier}级摘要超过 ${max} 字（现在 ${[...text].length} 字）`;
  if (countTokens(text) > block.sourceTokens * CONTEXT_SUMMARY_MAX_SOURCE_RATIO) return '摘要不比被替换的内容短，没有起到压缩作用';
  return null;
}

function overlaps(a, b) {
  return a.fromRound <= b.toRound && b.fromRound <= a.toRound;
}

/**
 * @param {Array<{start:string, end:string, topic?:string, summary:string}>} actions
 * @param {{ units:Array, view:object, protectedSet:Set<number>, shownRounds?:Set<number> }} ctx
 *   shownRounds：这次交给模型的原文轮次；给了时只能压缩其中的轮次（模型没读过的原文不能替它写摘要）
 * @returns {{ planned:Array, errors:string[], warnings:string[] }}
 *   planned[i].action 是它对应的原始动作，写入前重新校验时原样再交一次
 */
export function planCompression(actions, ctx) {
  const acc = { planned: [], errors: [], warnings: [] };
  for (const action of Array.isArray(actions) ? actions : []) admitAction(action ?? {}, ctx, acc);
  return acc;
}

/** 校验一个动作并记进 acc：通过的计划、单条错误，或提示（截断、重叠跳过） */
function admitAction(action, ctx, acc) {
  const result = planOne(action, ctx);
  if (result.error) { acc.errors.push(result.error); return; }
  if (result.warning) acc.warnings.push(result.warning);
  if (!result.block) return;
  const block = {
    ...result.block,
    topic: String(action.topic ?? '').trim().slice(0, 40),
    summary: String(action.summary ?? '').trim(),
    action,
  };
  const problem = summaryProblem(block);
  if (problem) { acc.errors.push(`${label(action)}：${problem}`); return; }
  if (acc.planned.some((other) => overlaps(other, block))) {
    acc.warnings.push(`${label(action)} 与同一批前面的范围重叠，已跳过`);
    return;
  }
  acc.planned.push(block);
}
