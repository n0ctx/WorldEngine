/**
 * policy.js — 上下文压缩内核（纯函数，无 I/O）：什么时候压、建议压哪里
 *
 * 触发看增长，不看每轮：
 *   - 可见量 = 原文轮次 token + 在用块摘要 token。基线是上次压缩成功后、或上次模型放弃/失败时的可见量，
 *     并随可见量回落（回退、删除、恢复原文）同步下调（低水位）。
 *   - 一级：原文超过短期预算、可见量比基线至少多出一个增长步长、未保护的原文够一次压缩的收益下限。
 *   - 提炼：在用块的摘要总量超过摘要上限（短期预算 × CONTEXT_SUMMARY_BUDGET_RATIO）时，从最老的块组起建议合并，
 *     够回落到上限的 CONTEXT_SUMMARY_LOW_WATER_RATIO 为止；越老的内容被提炼的次数越多，总量因此有界。同样受增长步长约束。
 *   - 压力：上一轮提示词占上下文上限达到 CONTEXT_PRESSURE_RATIO 时忽略增长步长。
 *   - 积压：上次压缩成功但原文仍超预算、或摘要仍超上限（一次没处理完）时继续压，不等增长。
 * 建议范围只是给模型的参考，最终压哪里、写多细由模型决定，系统只校验（见 plan.js）。
 *
 * 对外暴露：
 *   compressibleSegments(raw, protectedSet) → [{ from, to, tokens }]
 *   tierGroups(active, latestRound) → [{ tier, targetTier, blockIds, from, to, tokens }]
 *   decideCompression(input) → decision
 */

import { blockTokens } from './view.js';
import {
  CONTEXT_GROWTH_STEP_RATIO,
  CONTEXT_MIN_BENEFIT_TOKENS,
  CONTEXT_MIN_FOLD_TOKENS,
  CONTEXT_PRESSURE_RATIO,
  CONTEXT_PROMOTION_ROUNDS,
  CONTEXT_SUMMARY_BUDGET_RATIO,
  CONTEXT_SUMMARY_LOW_WATER_RATIO,
  CONTEXT_TIER_MAX_BLOCKS,
  CONTEXT_TIER_MIN_BLOCKS,
} from '../../utils/constants.js';

/** 两轮之间是否换了剧情阶段：写作模式换章，或者两轮都写明了场景且场景不同 */
function isStageBoundary(prev, unit) {
  if (prev.chapter != null && unit.chapter != null && prev.chapter !== unit.chapter) return true;
  return !!(prev.scene && unit.scene && prev.scene !== unit.scene);
}

/**
 * 未保护的原文按连续轮次切段；段内在剧情阶段切换处再切，但每段至少 CONTEXT_MIN_FOLD_TOKENS，
 * 不够的尾段并回前一段。整段不足下限的孤立几轮照样列出（它两边都是块或保护区，只能这样整段压）。
 */
export function compressibleSegments(raw, protectedSet) {
  const segments = [];
  let current = null;
  let prev = null;
  const close = () => {
    if (!current) return;
    const last = segments.at(-1);
    if (current.tokens < CONTEXT_MIN_FOLD_TOKENS && last && last.to === current.from - 1 && last.run === current.run) {
      last.to = current.to;
      last.tokens += current.tokens;
    } else {
      segments.push(current);
    }
    current = null;
  };
  let run = 0;
  for (const unit of raw) {
    if (protectedSet.has(unit.round)) {
      close();
      prev = null;
      run += 1;
      continue;
    }
    const contiguous = prev && prev.round === unit.round - 1;
    if (!contiguous) {
      close();
      run += 1;
    } else if (current && isStageBoundary(prev, unit) && current.tokens >= CONTEXT_MIN_FOLD_TOKENS) {
      close();
    }
    if (!current) current = { from: unit.round, to: unit.round, tokens: 0, run, scene: unit.scene };
    current.to = unit.round;
    current.tokens += unit.tokens;
    prev = unit;
  }
  close();
  return segments.map(({ run: _run, ...segment }) => segment);
}

function isOld(block, latestRound) {
  return latestRound - block.createdRound >= CONTEXT_PROMOTION_ROUNDS;
}

/**
 * 可提炼的块组：同一级、首尾相接（上一块止轮 + 1 = 下一块起轮）的老块，每组 CONTEXT_TIER_MIN_BLOCKS 到
 * CONTEXT_TIER_MAX_BLOCKS 个，按轮次从老到新排列。一级、二级合成上一级；三级块再合成三级（递归浓缩）。
 */
export function tierGroups(active, latestRound) {
  const groups = [];
  let group = [];
  const flush = () => {
    if (group.length >= CONTEXT_TIER_MIN_BLOCKS) {
      const tier = group[0].tier;
      groups.push({
        tier,
        targetTier: Math.min(3, tier + 1),
        blockIds: group.map((block) => block.id),
        blockNos: group.map((block) => block.no),
        from: group[0].fromRound,
        to: group.at(-1).toRound,
        tokens: group.reduce((sum, block) => sum + blockTokens(block), 0),
      });
    }
    group = [];
  };
  for (const block of active) {
    const last = group.at(-1);
    const joins = last && isOld(block, latestRound) && block.tier === last.tier && block.fromRound === last.toRound + 1;
    if (!joins || group.length === CONTEXT_TIER_MAX_BLOCKS) flush();
    if (isOld(block, latestRound)) group.push(block);
  }
  flush();
  return groups;
}

/** 各级在用块的摘要 token 合计 */
function tierTokens(active) {
  const totals = { 1: 0, 2: 0, 3: 0 };
  for (const block of active) totals[block.tier] += blockTokens(block);
  return totals;
}

/**
 * 摘要超上限时要合并的块组：从最老的组起取，直到预计（合并后约剩一半）能回落到低水位；压力下取全部。
 */
function dueMerges(groups, summaryTokens, summaryBudget, pressure) {
  if (pressure) return groups;
  if (summaryTokens <= summaryBudget) return [];
  const excess = summaryTokens - summaryBudget * CONTEXT_SUMMARY_LOW_WATER_RATIO;
  const picked = [];
  let saving = 0;
  for (const group of groups) {
    if (saving >= excess) break;
    picked.push(group);
    saving += group.tokens / 2;
  }
  return picked;
}

/**
 * 判断本轮要不要调用模型维护上下文。
 *
 * @param {object} input
 * @param {Array} input.units        全部轮次单元
 * @param {object} input.view        resolveView 的结果
 * @param {Set<number>} input.protectedSet
 * @param {object} input.state       getContextState 的结果
 * @param {number} input.budget      短期预算（原文轮次的目标上限）
 * @returns {object} decision：run / reasons / pressure / usage / rawTokens / summaryTokens / visibleTokens /
 *   reference（低水位后的基线）/ segments（一级建议范围）/ merges（提炼建议）
 */
export function decideCompression({ units, view, protectedSet, state, budget }) {
  const latestRound = units.at(-1)?.round ?? 0;
  const rawTokens = view.raw.reduce((sum, unit) => sum + unit.tokens, 0);
  const byTier = tierTokens(view.active);
  const summaryTokens = byTier[1] + byTier[2] + byTier[3];
  const visibleTokens = rawTokens + summaryTokens;
  const reference = Math.min(state.baselineTokens ?? 0, visibleTokens);
  const usage = state.lastPromptTokens && state.contextLimit ? state.lastPromptTokens / state.contextLimit : null;
  const pressure = usage != null && usage >= CONTEXT_PRESSURE_RATIO;
  const grown = visibleTokens - reference >= budget * CONTEXT_GROWTH_STEP_RATIO;
  const summaryBudget = budget * CONTEXT_SUMMARY_BUDGET_RATIO;
  const backlog = state.lastOutcome === 'compressed' && (rawTokens > budget || summaryTokens > summaryBudget);
  const gateOpen = pressure || grown || backlog;

  const segments = compressibleSegments(view.raw, protectedSet);
  const foldable = segments.reduce((sum, segment) => sum + segment.tokens, 0);
  const merges = dueMerges(tierGroups(view.active, latestRound), summaryTokens, summaryBudget, pressure);

  const reasons = [];
  const t1Due = foldable >= CONTEXT_MIN_BENEFIT_TOKENS && (pressure || rawTokens > budget);
  if (t1Due) reasons.push(pressure ? 'pressure' : 'raw-over-budget');
  if (merges.length > 0) reasons.push('summary-over-budget');
  if (reasons.length > 0 && gateOpen && backlog && !grown && !pressure) reasons.push('backlog');

  return {
    run: reasons.length > 0 && gateOpen,
    reasons,
    pressure,
    usage,
    latestRound,
    rawTokens,
    summaryTokens,
    tierTokens: byTier,
    visibleTokens,
    reference,
    foldableTokens: foldable,
    segments: t1Due ? segments : [],
    merges,
  };
}
