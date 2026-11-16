/**
 * compressor.js — 上下文维护任务：每轮生成结束后在后台队列里运行（任务 label：context-compress）
 *
 * 流程（每一步失败都不改动原文；块的写入只发生在最后一步、单个事务内）：
 *   1. 读取视图，删掉来源已失效的块（子块重新在用）。
 *   2. 增长门槛判断（policy.js）；没到门槛只更新低水位基线，不调用模型。
 *   3. 调用副模型：它看到在用块、建议范围、可压缩原文与保护区，自己决定压哪里、写多细。
 *      工具调用的提交当场校验，报错写回工具结果，模型可在 CONTEXT_COMPRESS_MAX_ITERATIONS 轮内改好重交；
 *      模型或服务不支持工具时按纯文本 JSON 提交，校验失败给一次重交机会。
 *   4. 模型返回后同步重读视图并按同一套规则重新校验（期间用户可能改了块或原文），
 *      与重读之间没有 await，校验通过的范围在同一个事务里写入。
 * 重复执行是安全的：已被块覆盖的轮次、已被吸收的块不能再压，同一批提交再写一次时重新校验全部落空。
 * 结果写进 context_state：compressed / declined / stale / failed；放弃（含提交全部没通过校验）与失败时
 * 把当时的可见量记作基线，原文再增长一个步长才会再次尝试，不会每轮重复调用。
 * 模型调用本身出错时任务抛错，后台任务失败提示照常出现；视图不变，兜底移出保证提示词不超限。
 *
 * 维护调用与剧情生成完全隔离：主模型从不看到压缩规则、工具或块号，副模型的输出只进 context_blocks。
 *
 * 对外暴露：
 *   maintainContext(sessionId) → Promise<{ outcome, decision?, blocks? }>
 */

import crypto from 'node:crypto';
import * as llm from '../../llm/index.js';
import { commitContextRun, saveContextState } from '../../db/queries/context-blocks.js';
import { resolveAuxScope } from '../../utils/aux-scope.js';
import { countTokens } from '../../utils/token-counter.js';
import { createLogger, formatMeta } from '../../utils/logger.js';
import {
  CONTEXT_COMPRESS_MAX_ITERATIONS,
  CONTEXT_COMPRESS_TIMEOUT_MS,
  LLM_TASK_TEMPERATURE,
} from '../../utils/constants.js';
import { resolveSpeakers } from '../speakers.js';
import { loadSessionContext, repairStaleBlocks } from './session-context.js';
import { decideCompression } from './policy.js';
import { planCompression } from './plan.js';
import { digestOfRange } from './view.js';
import {
  buildCompressMessages,
  compressToolDefinition,
  formatPlanFeedback,
  parseTextActions,
} from './doctrine.js';

const log = createLogger('context');

function planContext(ctx, shownRounds) {
  return { units: ctx.units, view: ctx.view, protectedSet: ctx.protectedSet, shownRounds };
}

/** 一次压缩写入的块共用一个 runId（由视图算出，便于在日志与库里把同一次写入的块对上） */
function runIdOf(ctx) {
  const hash = crypto.createHash('sha1');
  hash.update(`${ctx.sessionId}|${ctx.latestRound}|`);
  for (const block of ctx.view.active) hash.update(`${block.id},`);
  for (const unit of ctx.view.raw) hash.update(`${unit.digest},`);
  return hash.digest('hex');
}

function overlapsAny(block, accepted) {
  return accepted.some((other) => block.fromRound <= other.toRound && other.fromRound <= block.toRound);
}

/**
 * 校验一次提交并把通过的动作并入 accepted；返回写回给模型的说明。
 * 与之前已通过的范围重叠的动作跳过（同一批内的重叠由 planCompression 处理）。
 */
function acceptActions(actions, planCtx, accepted) {
  const result = planCompression(actions, planCtx);
  const fresh = result.planned.filter((block) => !overlapsAny(block, accepted.map((a) => a.block)));
  const skipped = result.planned.length - fresh.length;
  for (const block of fresh) accepted.push({ block, action: block.action });
  const feedback = formatPlanFeedback({ ...result, planned: fresh });
  return skipped > 0 ? `${feedback}\n- 提示：${skipped} 个范围与之前已记录的范围重叠，已跳过` : feedback;
}

/** 工具提交优先；最终回复里带 JSON 提交时按纯文本协议处理，校验失败给一次重交机会 */
async function requestActions(messages, planCtx, sessionId) {
  const accepted = [];
  const options = {
    configScope: resolveAuxScope(sessionId),
    callType: 'context_compress',
    conversationId: sessionId,
    timeoutMs: CONTEXT_COMPRESS_TIMEOUT_MS,
    temperature: LLM_TASK_TEMPERATURE,
  };
  const tool = compressToolDefinition((args) => acceptActions(args?.ranges, planCtx, accepted));
  const { text } = await llm.completeWithToolsDetailed(messages, [tool], { ...options, maxIterations: CONTEXT_COMPRESS_MAX_ITERATIONS });
  if (accepted.length > 0) return { accepted, reason: '' };

  const submitted = parseTextActions(text ?? '');
  if (!submitted) return { accepted, reason: String(text ?? '').trim().slice(0, 200) };
  let feedback = acceptActions(submitted.actions, planCtx, accepted);
  if (accepted.length === 0 && submitted.actions.length > 0) {
    const retry = await llm.complete([
      ...messages,
      { role: 'assistant', content: text },
      { role: 'user', content: `${feedback}\n只输出修正后的 JSON。` },
    ], options);
    const again = parseTextActions(retry ?? '');
    feedback = again ? acceptActions(again.actions, planCtx, accepted) : feedback;
  }
  return { accepted, reason: accepted.length > 0 ? '' : (submitted.reason || feedback) };
}

function finish(sessionId, decision, outcome, error = null) {
  saveContextState(sessionId, {
    baselineTokens: decision.visibleTokens,
    lastOutcome: outcome,
    lastError: error,
    lastRunRound: decision.latestRound,
  });
}

/** 提炼动作要吸收的块在模型调用期间被用户改过（模型据旧文写的上级摘要会盖掉手改的内容） */
function absorbsEditedBlock(block, ctx, seenSummaries) {
  if (!seenSummaries) return false;
  return block.consumes.some((id) => ctx.blocks.find((other) => other.id === id)?.summary !== seenSummaries.get(id));
}

/**
 * 写入：同步重读视图、按同一套规则重新校验，通过的范围在一个事务里写入。
 * 本函数内没有 await，读到的视图与写入之间不会插入别的请求。
 * seenSummaries：调用模型时各在用块的摘要；吸收的块在这之后被手改过的提炼动作丢弃。
 * 故事线已被删除时返回 { gone: true }。
 */
function commitAccepted(sessionId, accepted, shownRounds, runId, seenSummaries = null) {
  const loaded = loadSessionContext(sessionId);
  if (!loaded) return { gone: true, blocks: [], dropped: accepted.length };
  const ctx = repairStaleBlocks(loaded);
  const result = planCompression(accepted.map((item) => item.action), planContext(ctx, shownRounds));
  const planned = result.planned.filter((block) => !absorbsEditedBlock(block, ctx, seenSummaries));
  if (planned.length === 0) return { ctx, blocks: [], dropped: accepted.length };
  const blocks = planned.map((block) => ({
    ...block,
    sourceDigest: digestOfRange(ctx.units, block.fromRound, block.toRound),
  }));
  const sourceTokens = blocks.reduce((sum, block) => sum + block.sourceTokens, 0);
  const summaryTokens = blocks.reduce((sum, block) => sum + countTokens(block.summary), 0);
  const decision = decideCompression({ units: ctx.units, view: ctx.view, protectedSet: ctx.protectedSet, state: ctx.state, budget: ctx.budget });
  const written = commitContextRun(sessionId, {
    runId,
    createdRound: ctx.latestRound,
    blocks,
    statePatch: {
      baselineTokens: decision.visibleTokens - sourceTokens + summaryTokens,
      compressCount: ctx.state.compressCount + 1,
      tokensSaved: ctx.state.tokensSaved + Math.max(0, sourceTokens - summaryTokens),
      lastOutcome: 'compressed',
      lastError: null,
      lastRunRound: ctx.latestRound,
    },
  });
  return { ctx, blocks: written, dropped: accepted.length - written.length };
}

export async function maintainContext(sessionId) {
  const sid = sessionId.slice(0, 8);
  const loaded = loadSessionContext(sessionId);
  if (!loaded || loaded.latestRound === 0) return { outcome: 'skip' };
  const ctx = repairStaleBlocks(loaded);
  const decision = decideCompression({ units: ctx.units, view: ctx.view, protectedSet: ctx.protectedSet, state: ctx.state, budget: ctx.budget });
  if (decision.reference !== ctx.state.baselineTokens) saveContextState(sessionId, { baselineTokens: decision.reference });
  const meta = {
    session: sid, round: decision.latestRound, raw: decision.rawTokens, summary: decision.summaryTokens,
    reference: decision.reference, budget: ctx.budget, reasons: decision.reasons.join(',') || null,
  };
  if (!decision.run) {
    log.info(`IDLE  ${formatMeta(meta)}`);
    return { outcome: 'idle', decision };
  }
  const runId = runIdOf(ctx);
  const { messages, shownRounds } = buildCompressMessages(ctx, decision, resolveSpeakers(ctx.session));
  log.info(`START  ${formatMeta({ ...meta, segments: decision.segments.length, merges: decision.merges.length })}`);
  let requested;
  try {
    requested = await requestActions(messages, planContext(ctx, shownRounds), sessionId);
  } catch (err) {
    finish(sessionId, decision, 'failed', err.message);
    log.warn(`FAILED  ${formatMeta({ session: sid, error: err.message })}`);
    throw err;
  }
  if (requested.accepted.length === 0) {
    finish(sessionId, decision, 'declined', requested.reason || null);
    log.info(`DECLINED  ${formatMeta({ session: sid, reason: requested.reason })}`);
    return { outcome: 'declined', decision };
  }

  const seenSummaries = new Map(ctx.view.active.map((block) => [block.id, block.summary]));
  const { gone, blocks, dropped } = commitAccepted(sessionId, requested.accepted, shownRounds, runId, seenSummaries);
  if (gone) {
    log.info(`GONE  ${formatMeta({ session: sid })}`);
    return { outcome: 'skip', decision };
  }
  if (blocks.length === 0) {
    finish(sessionId, decision, 'stale', '提交期间上下文已变化，本次压缩未写入');
    log.warn(`STALE  ${formatMeta({ session: sid, dropped })}`);
    return { outcome: 'stale', decision };
  }
  log.info(`DONE  ${formatMeta({
    session: sid,
    blocks: blocks.map((block) => `b${block.no}:t${block.tier}:${block.fromRound}-${block.toRound}`).join(' '),
    dropped,
  })}`);
  return { outcome: 'compressed', decision, blocks };
}

export const __testables = { commitAccepted, acceptActions };
