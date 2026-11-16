/**
 * compressor.js — 上下文维护任务：每轮生成结束后在后台队列里运行（任务 label：context-compress）
 *
 * 队列里的部分只做快速判断，模型调用在队列外后台进行，不占用同故事线的队列（队列串行，运行中的任务不会被
 * 抢占，模型调用放在队列里会让下一轮的 turn-record 排在它后面），下一轮组装提示词也不等它：压缩写入之前
 * 一直用当前视图，提示词不会超限靠组装端的兜底移出。
 *
 * 流程（每一步失败都不改动原文；块的写入只发生在最后一步、单个事务内）：
 *   1. 读取视图，删掉来源已失效的块（子块重新在用）。
 *   2. 增长门槛判断（policy.js）；没到门槛只更新低水位基线，不调用模型。需要压缩时把各轮指纹留底，
 *      启动后台运行并立刻返回（同一故事线已有一次在运行时直接返回 busy）。
 *   3. 调用副模型：它看到在用块、建议范围、可压缩原文与保护区，自己决定压哪里、写多细。
 *      工具调用的提交当场校验，报错写回工具结果，模型可在 CONTEXT_COMPRESS_MAX_ITERATIONS 轮内改好重交；
 *      模型或服务不支持工具时按纯文本 JSON 提交，校验失败给一次重交机会。
 *   4. 模型返回后同步重读视图并按同一套规则重新校验（期间用户可能改了块或原文），
 *      与重读之间没有 await，校验通过的范围在同一个事务里写入。模型调用期间回退、编辑、删除、重新生成不会等它
 *      （回退只等队列空闲），所以写入前还要核对留底的各轮指纹：有任何一轮被改或被删，整批不写
 *      （摘要只能配它读到的那份原文；模型也读过受保护区的预览，被撤销的剧情不能经摘要带进来）。
 * 重复执行是安全的：已被块覆盖的轮次、已被吸收的块不能再压，同一批提交再写一次时重新校验全部落空。
 * 结果写进 context_state：compressed / declined / stale / failed；放弃（含提交全部没通过校验）、过期与失败时
 * 把当时的可见量记作基线，原文再增长一个步长才会再次尝试，并让连续未写入次数加一（policy.js 据此指数退避），
 * 成功写入后清零。
 * 后台运行不会让任务抛错：模型调用出错只记日志与 context_state.last_error（剧情摘要弹窗可见），不再经 SSE 弹提示——
 * 压缩不占用本轮的 SSE 连接，否则连接要等它结束才关。副模型不可用时同一轮的状态整理、turn-record 照样会提示。
 * 视图不变，兜底移出保证提示词不超限。
 *
 * 维护调用与剧情生成完全隔离：主模型从不看到压缩规则、工具或块号，副模型的输出只进 context_blocks。
 *
 * 对外暴露：
 *   maintainContext(sessionId) → Promise<{ outcome, decision?, completion? }>
 *     outcome：skip / idle / busy / started；started 时 completion 是后台运行的 Promise，
 *     结果为 { outcome: compressed / declined / stale / failed / skip, decision, blocks?, error? }，永不 reject。
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
import { digestOfRange, roundsChangedSince, unitDigests } from './view.js';
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

/**
 * 本次没有写入块：记下结果与基线，连续未写入次数加一。
 * 后台运行结束时库里的状态可能已不是启动时的样子（用户恢复了原文、回退、又发了新一轮），
 * 基线与轮号按此刻重新读取，不用启动时的 decision，否则会把调用期间的恢复或回退盖回旧值。
 * 故事线已被删除时什么都不写。
 */
function finish(sessionId, outcome, error = null) {
  const loaded = loadSessionContext(sessionId);
  if (!loaded) return;
  const now = decideCompression({ units: loaded.units, view: loaded.view, protectedSet: loaded.protectedSet, state: loaded.state, budget: loaded.budget });
  saveContextState(sessionId, {
    baselineTokens: now.visibleTokens,
    lastOutcome: outcome,
    lastError: error,
    lastRunRound: now.latestRound,
    noWriteStreak: loaded.state.noWriteStreak + 1,
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
 * seen：调用模型时留的底 { summaries, digests }，null 表示不核对（只用于测试）。
 *   - digests：各轮指纹。留底之后有任何一轮被改或被删（重新生成、编辑、删除），整批不写：模型据旧原文写的摘要
 *     不能配上新原文的指纹，也不能把被撤销的剧情带进来（回退只在写入前删块，管不到这次还在路上的运行）。
 *   - summaries：各在用块的摘要；吸收的块在这之后被手改过的提炼动作丢弃。
 * 故事线已被删除时返回 { gone: true }。
 */
function commitAccepted(sessionId, accepted, shownRounds, runId, seen = null) {
  const loaded = loadSessionContext(sessionId);
  if (!loaded) return { gone: true, blocks: [], dropped: accepted.length };
  if (seen && roundsChangedSince(loaded.units, seen.digests)) return { ctx: loaded, blocks: [], dropped: accepted.length };
  const ctx = repairStaleBlocks(loaded);
  const result = planCompression(accepted.map((item) => item.action), planContext(ctx, shownRounds));
  const planned = result.planned.filter((block) => !absorbsEditedBlock(block, ctx, seen?.summaries));
  if (planned.length === 0) return { ctx, blocks: [], dropped: accepted.length };
  const blocks = planned.map((block) => ({
    ...block,
    sourceDigest: digestOfRange(ctx.units, block.fromRound, block.toRound),
  }));
  const sourceTokens = blocks.reduce((sum, block) => sum + block.sourceTokens, 0);
  const summaryTokens = blocks.reduce((sum, block) => sum + countTokens(block.summary), 0);
  const decision = decideCompression({ units: ctx.units, view: ctx.view, protectedSet: ctx.protectedSet, state: ctx.state, budget: ctx.budget });
  // 建块轮次与回退的删块规则对应：模型读到的最新一轮，而不是写入时库里的最新一轮
  const launchRound = seen ? seen.digests.length : ctx.latestRound;
  const written = commitContextRun(sessionId, {
    runId,
    createdRound: launchRound,
    blocks,
    statePatch: {
      baselineTokens: decision.visibleTokens - sourceTokens + summaryTokens,
      compressCount: ctx.state.compressCount + 1,
      tokensSaved: ctx.state.tokensSaved + Math.max(0, sourceTokens - summaryTokens),
      lastOutcome: 'compressed',
      lastError: null,
      lastRunRound: launchRound,
      noWriteStreak: 0,
    },
  });
  return { ctx, blocks: written, dropped: accepted.length - written.length };
}

/** 正在后台运行的压缩：sessionId → Promise；同一故事线同时只跑一次 */
const inFlight = new Map();

/** 模型调用 + 写入；出错时抛出，由 runCompression 记成 failed */
async function attemptCompression(sessionId, ctx, decision, meta) {
  const sid = sessionId.slice(0, 8);
  const runId = runIdOf(ctx);
  const seen = {
    digests: unitDigests(ctx.units),
    summaries: new Map(ctx.view.active.map((block) => [block.id, block.summary])),
  };
  const { messages, shownRounds } = buildCompressMessages(ctx, decision, resolveSpeakers(ctx.session));
  log.info(`START  ${formatMeta({ ...meta, segments: decision.segments.length, merges: decision.merges.length })}`);
  const requested = await requestActions(messages, planContext(ctx, shownRounds), sessionId);
  if (requested.accepted.length === 0) {
    finish(sessionId, 'declined', requested.reason || null);
    log.info(`DECLINED  ${formatMeta({ session: sid, reason: requested.reason })}`);
    return { outcome: 'declined', decision };
  }

  const { gone, blocks, dropped } = commitAccepted(sessionId, requested.accepted, shownRounds, runId, seen);
  if (gone) {
    log.info(`GONE  ${formatMeta({ session: sid })}`);
    return { outcome: 'skip', decision };
  }
  if (blocks.length === 0) {
    finish(sessionId, 'stale', '提交期间上下文已变化，本次压缩未写入');
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

/** 永不 reject：失败记进 context_state 与日志，由调用方决定要不要等 */
async function runCompression(sessionId, ctx, decision, meta) {
  try {
    return await attemptCompression(sessionId, ctx, decision, meta);
  } catch (err) {
    finish(sessionId, 'failed', err.message);
    log.warn(`FAILED  ${formatMeta({ session: sessionId.slice(0, 8), error: err.message })}`);
    return { outcome: 'failed', decision, error: err.message };
  }
}

export async function maintainContext(sessionId) {
  const sid = sessionId.slice(0, 8);
  if (inFlight.has(sessionId)) {
    log.info(`BUSY  ${formatMeta({ session: sid })}`);
    return { outcome: 'busy' };
  }
  const loaded = loadSessionContext(sessionId);
  if (!loaded || loaded.latestRound === 0) return { outcome: 'skip' };
  const ctx = repairStaleBlocks(loaded);
  const decision = decideCompression({ units: ctx.units, view: ctx.view, protectedSet: ctx.protectedSet, state: ctx.state, budget: ctx.budget });
  if (decision.reference !== ctx.state.baselineTokens) saveContextState(sessionId, { baselineTokens: decision.reference });
  const meta = {
    session: sid, round: decision.latestRound, raw: decision.rawTokens, summary: decision.summaryTokens,
    reference: decision.reference, budget: ctx.budget, backoff: decision.backoff, reasons: decision.reasons.join(',') || null,
  };
  if (!decision.run) {
    log.info(`IDLE  ${formatMeta(meta)}`);
    return { outcome: 'idle', decision };
  }
  // 此处到登记之间没有 await：inFlight 的检查与登记在同一个同步片段里完成
  const completion = runCompression(sessionId, ctx, decision, meta)
    .catch((err) => {
      log.warn(`FAILED  ${formatMeta({ session: sid, error: err?.message })}`);
      return { outcome: 'failed', decision, error: err?.message };
    })
    .finally(() => inFlight.delete(sessionId));
  inFlight.set(sessionId, completion);
  return { outcome: 'started', decision, completion };
}

export const __testables = { commitAccepted, acceptActions };
