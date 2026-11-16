/**
 * session-context.js — 读取一条故事线的压缩上下文：原文轮次单元、块、当前视图、运行状态与预算
 *
 * 故事线（session）是压缩数据的隔离边界：块、状态、指纹都按 session_id 存取，不跨故事线引用。
 *
 * 对外暴露：
 *   resolveShortTermBudget(config, session) → number
 *   loadSessionContext(sessionId) → ctx | null
 *   repairStaleBlocks(ctx) → ctx  删除失效块（子块随之重新在用），返回重新读取后的 ctx
 *   viewStats(ctx) → object  上下文状态统计
 */

import { getSessionById } from '../../db/queries/sessions.js';
import { getMessagesBySessionId } from '../../db/queries/messages.js';
import { getTurnIndexRows } from '../../db/queries/turn-records.js';
import { getContextState, listContextBlocks, removeContextBlocks } from '../../db/queries/context-blocks.js';
import { getConfig, getEffectiveChapterTurnSize } from '../../services/config.js';
import { resolveChapterMessageSize } from '../../utils/constants.js';
import { toPromptMessage } from '../../utils/turn-dialogue.js';
import { createLogger, formatMeta } from '../../utils/logger.js';
import { blockTokens, buildRoundUnits, protectedRounds, resolveView } from './view.js';

const log = createLogger('context');

/** 短期预算（原文轮次的目标上限）：写作模式读 writing.short_term_token_budget，为空时继承顶层配置 */
export function resolveShortTermBudget(config, session) {
  if (session?.mode === 'writing') return config.writing?.short_term_token_budget ?? config.short_term_token_budget;
  return config.short_term_token_budget;
}

/**
 * @param {string} sessionId
 * @returns {null | { sessionId, session, messages, units, blocks, view, protectedSet, state, budget, latestRound, indexRows }}
 *   messages：库里的消息行（原始正文）；units：按轮切好的单元
 */
export function loadSessionContext(sessionId) {
  const session = getSessionById(sessionId);
  if (!session) return null;
  const indexRows = getTurnIndexRows(sessionId);
  const scenes = new Map(indexRows.filter((row) => row.scene).map((row) => [row.round_index, row.scene]));
  const chapterMessageSize = session.mode === 'writing'
    ? resolveChapterMessageSize(getEffectiveChapterTurnSize('writing'))
    : null;
  const messages = getMessagesBySessionId(sessionId, null, 0);
  const units = buildRoundUnits(messages, { scenes, chapterMessageSize, toPromptMessage });
  const blocks = listContextBlocks(sessionId);
  const view = resolveView(blocks, units);
  const budget = resolveShortTermBudget(getConfig(), session);
  return {
    sessionId,
    session,
    messages,
    units,
    blocks,
    view,
    protectedSet: protectedRounds(view.raw, { budget }),
    state: getContextState(sessionId),
    budget,
    latestRound: units.at(-1)?.round ?? 0,
    indexRows,
  };
}

/**
 * 失效块（来源被编辑、删除，或覆盖范围已不存在）从库里删掉，它吸收的子块重新在用；
 * 读路径（组装提示词）只按视图跳过失效块、不写库，修复统一在压缩任务开始时做。
 */
export function repairStaleBlocks(ctx) {
  if (ctx.view.stale.length === 0) return ctx;
  const removed = removeContextBlocks(ctx.sessionId, ctx.view.stale);
  log.info(`STALE REMOVED  ${formatMeta({ session: ctx.sessionId.slice(0, 8), removed })}`);
  return loadSessionContext(ctx.sessionId);
}

/** 上下文状态统计：给接口与日志用 */
export function viewStats(ctx) {
  const rawTokens = ctx.view.raw.reduce((sum, unit) => sum + unit.tokens, 0);
  const summaryTokens = ctx.view.active.reduce((sum, block) => sum + blockTokens(block), 0);
  const coveredRawTokens = ctx.view.active.reduce((sum, block) => sum + block.rawTokens, 0);
  const tiers = { 1: 0, 2: 0, 3: 0 };
  for (const block of ctx.view.active) tiers[block.tier] += 1;
  const { state } = ctx;
  return {
    latestRound: ctx.latestRound,
    budget: ctx.budget,
    rawRounds: ctx.view.raw.length,
    rawTokens,
    coveredRounds: ctx.view.covered.size,
    coveredRawTokens,
    summaryTokens,
    compressionRatio: summaryTokens > 0 ? Number((coveredRawTokens / summaryTokens).toFixed(2)) : null,
    activeBlocks: ctx.view.active.length,
    blocksByTier: tiers,
    staleBlocks: ctx.view.stale.length,
    protectedRounds: [...ctx.protectedSet].sort((a, b) => a - b),
    lastPromptTokens: state.lastPromptTokens,
    contextLimit: state.contextLimit,
    usage: state.lastPromptTokens && state.contextLimit ? Number((state.lastPromptTokens / state.contextLimit).toFixed(3)) : null,
    compressCount: state.compressCount,
    tokensSaved: state.tokensSaved,
    lastOutcome: state.lastOutcome,
    lastError: state.lastError,
    lastRunRound: state.lastRunRound,
    noWriteStreak: state.noWriteStreak,
  };
}
