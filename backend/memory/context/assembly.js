/**
 * assembly.js — 组装提示词时的上下文视图：哪些轮次以原文进历史、哪些以摘要出现、哪些可供召回
 *
 * 三处内容各管一段，不重复注入：
 *   - 剧情摘要（system 尾部）：在用的块，按轮次先后排列；
 *   - 历史消息：没有被块覆盖、也没被兜底移出的原文轮次；
 *   - 长期召回：只从不在历史里的轮次（被块覆盖或被移出）中挑选原文，召回的原文不会和历史重复。
 * 读路径不写块：失效块只是在视图里不出现（改用子块或原文），修复在后台压缩任务里做。
 *
 * 兜底移出：原文超过短期预算的 CONTEXT_RAW_HARD_CAP_RATIO 倍时一次移到预算以内，或上一轮提示词
 * 超过上下文上限的 CONTEXT_EMERGENCY_RATIO 时移到 CONTEXT_PRESSURE_RATIO 以内；只移未保护的最老原文，
 * 原文仍在库里、仍可召回。被移出的轮次在剧情摘要里以逐轮索引行代替（从最近的往前放，和在用块合计不超过
 * 摘要上限），放不下的只留一句说明。压缩恢复后块覆盖了这些轮次，移出自然消失。
 *
 * 对外暴露：
 *   loadHistoryBase(sessionId) → Promise<{ promptContext, storySummary, recallScope, uncompressedMessages }>
 *   visibleHistory(history, visibleRounds) → messages
 *   recordPromptUsage(sessionId, messages, promptContext)
 */

import { saveContextState } from '../../db/queries/context-blocks.js';
import { resolveContextLimit } from '../../services/model-context-limit.js';
import { countContextTokens, countTokens } from '../../utils/token-counter.js';
import { splitRounds } from '../../utils/session-rounds.js';
import { toPromptMessage } from '../../utils/turn-dialogue.js';
import {
  CONTEXT_EMERGENCY_RATIO,
  CONTEXT_PRESSURE_RATIO,
  CONTEXT_RAW_HARD_CAP_RATIO,
  CONTEXT_SUMMARY_BUDGET_RATIO,
} from '../../utils/constants.js';
import { loadSessionContext } from './session-context.js';
import { blockTokens, planEmergencyHide } from './view.js';

/** 需要从历史里移出多少 token 才回到安全范围 */
function overflowTokens(ctx, rawTokens, contextLimit) {
  let overflow = rawTokens > ctx.budget * CONTEXT_RAW_HARD_CAP_RATIO ? rawTokens - ctx.budget : 0;
  const lastPrompt = ctx.state.lastPromptTokens;
  if (lastPrompt && contextLimit && lastPrompt > contextLimit * CONTEXT_EMERGENCY_RATIO) {
    overflow = Math.max(overflow, Math.ceil(lastPrompt - contextLimit * CONTEXT_PRESSURE_RATIO));
  }
  return overflow;
}

/** 连续轮号合成区间：[3,4,5,9] → [[3,5],[9,9]] */
function toRanges(rounds) {
  const ranges = [];
  for (const round of [...rounds].sort((a, b) => a - b)) {
    const last = ranges.at(-1);
    if (last && last[1] === round - 1) last[1] = round;
    else ranges.push([round, round]);
  }
  return ranges;
}

function roundLabel(from, to) {
  return from === to ? `第${from}轮` : `第${from}–${to}轮`;
}

/**
 * 被移出轮次的逐轮索引行：从最近的一轮往前放，和在用块的摘要合计不超过摘要上限；
 * 没有索引行的轮次跳过，放不下时停（结果是被移出轮次里较新的一段）。
 */
function hiddenIndexLines(ctx, hidden) {
  const summaries = new Map(ctx.indexRows.map((row) => [row.round_index, row.summary.trim()]));
  let room = ctx.budget * CONTEXT_SUMMARY_BUDGET_RATIO - ctx.view.active.reduce((sum, block) => sum + blockTokens(block), 0);
  const lines = new Map();
  for (const round of [...hidden].sort((a, b) => b - a)) {
    const summary = summaries.get(round);
    if (!summary) continue;
    const line = `第${round}轮：${summary}`;
    const cost = countTokens(line);
    if (cost > room) break;
    room -= cost;
    lines.set(round, line);
  }
  return lines;
}

/** 剧情摘要正文：在用块与被移出的原文区间（附逐轮索引行）按轮次先后排列；没有内容时为空串 */
function renderSummaryText(active, hidden, indexLines) {
  const items = [
    ...active.map((block) => ({
      from: block.fromRound,
      text: `【${roundLabel(block.fromRound, block.toRound)}${block.topic ? `｜${block.topic}` : ''}】\n${block.summary.trim()}`,
    })),
    ...toRanges(hidden).map(([from, to]) => {
      const lines = [];
      for (let round = from; round <= to; round++) if (indexLines.has(round)) lines.push(indexLines.get(round));
      const note = `（${roundLabel(from, to)}的原文暂时不在上下文里，需要时会作为召回原文提供${lines.length > 0 ? '；下面是其中几轮的索引' : ''}。）`;
      return { from, text: [note, ...lines].join('\n') };
    }),
  ];
  return items.sort((a, b) => a.from - b.from).map((item) => item.text).join('\n\n');
}

/** 本轮的上下文视图：剧情摘要正文、以原文进历史的轮次、不在历史里（可召回）的轮次、被兜底移出的原文 token */
async function loadPromptContext(ctx) {
  const contextLimit = await resolveContextLimit(ctx.session.mode === 'writing' ? 'writing' : 'main');
  const rawTokens = ctx.view.raw.reduce((sum, unit) => sum + unit.tokens, 0);
  const hiddenRounds = planEmergencyHide(ctx.view.raw, ctx.protectedSet, {
    overflowTokens: overflowTokens(ctx, rawTokens, contextLimit),
  });
  const visibleRounds = new Set(ctx.view.raw.map((unit) => unit.round).filter((round) => !hiddenRounds.has(round)));
  const outOfViewRounds = new Set(ctx.units.map((unit) => unit.round).filter((round) => !visibleRounds.has(round)));
  return {
    ctx,
    contextLimit,
    summaryText: renderSummaryText(ctx.view.active, hiddenRounds, hiddenIndexLines(ctx, hiddenRounds)),
    visibleRounds,
    outOfViewRounds,
    hiddenTokens: ctx.view.raw.filter((unit) => hiddenRounds.has(unit.round)).reduce((sum, unit) => sum + unit.tokens, 0),
  };
}

/**
 * 两种模式共用的历史起点：上下文视图、长期召回的候选范围，以及给模型看的全部消息（去掉思考过程）。
 * @returns {Promise<{ promptContext:object, storySummary:string, recallScope:object, uncompressedMessages:Array }>}
 */
export async function loadHistoryBase(sessionId) {
  const ctx = loadSessionContext(sessionId);
  const promptContext = await loadPromptContext(ctx);
  return {
    promptContext,
    storySummary: promptContext.summaryText,
    recallScope: {
      units: ctx.units,
      outOfViewRounds: promptContext.outOfViewRounds,
      activeBlocks: ctx.view.active,
      indexRows: ctx.indexRows,
    },
    uncompressedMessages: ctx.messages.map(toPromptMessage),
  };
}

/**
 * 历史里只放 visibleRounds 里的完整轮次；其余轮次以剧情摘要出现，或作为长期召回的候选。
 * history 已由调用方决定是否摘掉本轮新输入，摘掉它不改变更早轮次的轮号（第 k 轮 = 第 k 条玩家消息）。
 */
export function visibleHistory(history, visibleRounds) {
  const rounds = splitRounds(history);
  if (rounds.length === 0) return history;
  return rounds.filter((round) => visibleRounds.has(round.roundIndex)).flatMap((round) => round.messages);
}

/**
 * 记下这次组装的提示词估算 token 与上下文上限，供下一次的压力判断与兜底移出使用。
 * 记的是「不移出时」的量（实际提示词 + 被兜底移出的原文）：否则移出后记下的量回落到阈值以下，
 * 下一轮移出取消、提示词又涨回去，隔轮来回振荡。压缩真正腾出空间后这个量才会下降。
 */
export function recordPromptUsage(sessionId, messages, promptContext) {
  saveContextState(sessionId, {
    lastPromptTokens: countContextTokens(messages) + promptContext.hiddenTokens,
    contextLimit: promptContext.contextLimit,
  });
}
