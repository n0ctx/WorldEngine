/**
 * middle-summary.js — 中期摘要：轮次滑出短期窗口时的滚动合并（memory-v2 中期层）
 *
 * 对外暴露：
 *   planEviction(rounds, coveredTo, budget, latestRound)
 *     → { evictedTo, windowTokens, windowRounds }  纯函数，短期窗口滑出计算
 *
 *   computeMiddleSummary(sessionId, roundIndex)
 *     → Promise<{ text, coveredTo, evicted, failed, error, windowTokens, windowRounds, middleTokens }>
 */

import * as llm from '../llm/index.js';
import { getSessionById } from '../db/queries/sessions.js';
import { getCharacterById } from '../db/queries/characters.js';
import { getMessagesBySessionId } from '../db/queries/messages.js';
import { getAllTurnRecordsBySessionId, updateLatestMiddleSummary } from '../db/queries/turn-records.js';
import { getOrCreatePersona } from '../services/personas.js';
import { getConfig } from '../services/config.js';
import { resolveAuxScope } from '../utils/aux-scope.js';
import { renderBackendPrompt } from '../prompts/prompt-loader.js';
import { countTokens } from '../utils/token-counter.js';
import { splitRounds, roundTokens } from '../utils/session-rounds.js';
import {
  ALL_MESSAGES_LIMIT,
  LLM_TASK_TEMPERATURE,
  LLM_BACKGROUND_TASK_TIMEOUT_MS,
  MIDDLE_SUMMARY_MAX_TOKENS,
  MIDDLE_COMPRESS_INPUT_MAX_TOKENS,
  MIDDLE_RAW_ROUNDS_MAX,
  SHORT_TERM_EVICT_TARGET_RATIO,
} from '../utils/constants.js';

/** 提示词里的目标字数，比 token 硬上限更紧，留给模型习惯性写超的余量 */
const MIDDLE_SUMMARY_TARGET_CHARS = 800;
/** 超限后最多再压这么多次；仍超限则回退基线 */
const MIDDLE_SUMMARY_SHRINK_ATTEMPTS = 2;

/**
 * 计算短期窗口滑出计划。
 * 窗口 = rounds 中 roundIndex ∈ (coveredTo, latestRound] 的轮次。窗口总 token 不超 budget 时不滑出；
 * 超出时从最老开始滑出，直到总 token ≤ budget × SHORT_TERM_EVICT_TARGET_RATIO；latestRound 永不滑出。
 *
 * @param {Array<{roundIndex:number, messages:Array}>} rounds  splitRounds 的结果
 * @param {number} coveredTo    已覆盖到的轮号（0 表示尚未覆盖）
 * @param {number} budget       短期窗口 token 预算
 * @param {number} latestRound  当前轮号
 * @returns {{ evictedTo:number, windowTokens:number, windowRounds:number }}
 *   evictedTo：滑出后覆盖到的轮号（无滑出时等于 coveredTo）
 *   windowTokens/windowRounds：滑出后剩余窗口的 token 数与轮数
 */
export function planEviction(rounds, coveredTo, budget, latestRound) {
  const window = rounds.filter((r) => r.roundIndex > coveredTo && r.roundIndex <= latestRound);
  const tokens = window.map((r) => roundTokens(r));
  let total = tokens.reduce((sum, t) => sum + t, 0);
  const target = total > budget ? budget * SHORT_TERM_EVICT_TARGET_RATIO : budget;

  let evictedTo = coveredTo;
  let idx = 0;
  while (idx < window.length && total > target && window[idx].roundIndex !== latestRound) {
    total -= tokens[idx];
    evictedTo = window[idx].roundIndex;
    idx++;
  }

  return {
    evictedTo,
    windowTokens: total,
    windowRounds: window.length - idx,
  };
}

/** 会话的用户名 / 角色名，缺省分别为「玩家」「角色」 */
export function resolveNames(session) {
  const character = session?.character_id ? getCharacterById(session.character_id) : null;
  const worldId = character?.world_id ?? session?.world_id;
  const persona = worldId ? getOrCreatePersona(worldId) : null;
  return {
    userName: persona?.name?.trim() || '玩家',
    characterName: character?.name?.trim() || '角色',
  };
}

/** 短期窗口 token 预算：写作模式继承 writing.short_term_token_budget，为空时回退顶层配置 */
function resolveBudget(config, session) {
  if (session?.mode === 'writing') {
    return config.writing?.short_term_token_budget ?? config.short_term_token_budget;
  }
  return config.short_term_token_budget;
}

function stripThink(raw) {
  return (raw || '')
    .replace(/<think>[\s\S]*?<\/think>\n*/g, '')
    .replace(/<think>[\s\S]*$/, '')
    .trim();
}

/** 单轮原文材料：标明轮号与说话人，保留该轮全部消息（含续写等多条 assistant） */
function renderRoundRaw(round, userName, characterName) {
  return round.messages
    .map((msg) => `第${round.roundIndex}轮 ${msg.role === 'user' ? userName : characterName}：${msg.content}`)
    .join('\n');
}

/**
 * 把被滑出的轮次拼成合并材料，按时间顺序排列：
 * 最后 MIDDLE_RAW_ROUNDS_MAX 轮用原文，更早的轮次用其索引行（turn record 的 summary，为空则跳过该轮）。
 *
 * @param {Array<{roundIndex:number, messages:Array}>} evictedRounds
 * @param {Map<number, object>} recordsByRound  round_index → turn record
 * @param {string} userName
 * @param {string} characterName
 * @returns {string[]}
 */
function buildMaterialItems(evictedRounds, recordsByRound, userName, characterName) {
  const rawStart = Math.max(0, evictedRounds.length - MIDDLE_RAW_ROUNDS_MAX);
  const items = [];
  evictedRounds.forEach((round, index) => {
    if (index >= rawStart) {
      items.push(renderRoundRaw(round, userName, characterName));
      return;
    }
    const summary = recordsByRound.get(round.roundIndex)?.summary?.trim();
    if (summary) items.push(`第${round.roundIndex}轮：${summary}`);
  });
  return items;
}

/** 发起一次中期摘要 LLM 调用（合并/压缩共用调用参数），返回剥离 think 块后的正文 */
async function callMiddleSummaryLLM(sessionId, promptContent) {
  const raw = await llm.complete([{ role: 'user', content: promptContent }], {
    configScope: resolveAuxScope(sessionId),
    callType: 'middle_summary',
    conversationId: sessionId,
    timeoutMs: LLM_BACKGROUND_TASK_TIMEOUT_MS,
    temperature: LLM_TASK_TEMPERATURE,
  });
  return stripThink(raw);
}

async function callMerge(sessionId, userName, characterName, previousSummary, materialText) {
  return callMiddleSummaryLLM(sessionId, renderBackendPrompt('memory-middle-summary.md', {
    USER_NAME: userName,
    CHARACTER_NAME: characterName,
    PREVIOUS_SUMMARY: previousSummary,
    PREVIOUS_CHARS: previousSummary.length,
    NEW_ROUNDS: materialText,
    NEW_CHARS: materialText.length,
    MAX_CHARS: MIDDLE_SUMMARY_TARGET_CHARS,
  }));
}

async function callShrink(sessionId, summary) {
  return callMiddleSummaryLLM(sessionId, renderBackendPrompt('memory-middle-summary-shrink.md', {
    SUMMARY: summary,
    SUMMARY_CHARS: summary.length,
    WRITTEN_CHARS: summary.length,
    MAX_CHARS: MIDDLE_SUMMARY_TARGET_CHARS,
  }));
}

/**
 * 按 MIDDLE_COMPRESS_INPUT_MAX_TOKENS 分批滚动合并旧摘要与新材料：
 * 单批（旧摘要 + 本批材料）超预算就切下一批，前一批的输出作为下一批的旧摘要。
 *
 * @returns {Promise<string>}  最终合并文本（尚未做长度校验）
 */
async function mergeMaterial(sessionId, userName, characterName, baseText, items) {
  let summaryText = baseText;
  let i = 0;
  while (i < items.length) {
    let batchTokens = 0;
    const batch = [];
    while (i < items.length) {
      const itemTokens = countTokens(items[i]);
      if (batch.length > 0 && countTokens(summaryText) + batchTokens + itemTokens > MIDDLE_COMPRESS_INPUT_MAX_TOKENS) break;
      batch.push(items[i]);
      batchTokens += itemTokens;
      i++;
    }
    summaryText = await callMerge(sessionId, userName, characterName, summaryText, batch.join('\n\n'));
  }
  return summaryText;
}

/**
 * 计算第 roundIndex 轮的中期摘要。
 * 基线取 round_index < roundIndex 的最新记录（无记录或 middle_covered_to 为 null 时按 text='' / coveredTo=0 处理）。
 * 无滑出时原样继承基线；有滑出时滚动合并被滑出的轮次，超长再压两次，仍失败则回退基线并标记 failed
 * （不抛错，调用方在建行之后自行抛出）。
 *
 * @param {string} sessionId
 * @param {number} roundIndex  当前轮号（即将写入的 turn record 的 round_index）
 * @returns {Promise<{
 *   text:string, coveredTo:number, evicted:[number,number]|null,
 *   failed:boolean, error:string|null, windowTokens:number, windowRounds:number, middleTokens:number
 * }>}
 */
export async function computeMiddleSummary(sessionId, roundIndex) {
  const session = getSessionById(sessionId);
  const { userName, characterName } = resolveNames(session);
  const budget = resolveBudget(getConfig(), session);

  const allRecords = getAllTurnRecordsBySessionId(sessionId);
  const baseline = allRecords.filter((r) => r.round_index < roundIndex).pop();
  const baseCoveredTo = baseline?.middle_covered_to ?? 0;
  const baseText = baseline?.middle_covered_to == null ? '' : (baseline.middle_summary ?? '');

  const messages = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  const rounds = splitRounds(messages);
  const plan = planEviction(rounds, baseCoveredTo, budget, roundIndex);

  if (plan.evictedTo === baseCoveredTo) {
    return {
      text: baseText,
      coveredTo: baseCoveredTo,
      evicted: null,
      failed: false,
      error: null,
      windowTokens: plan.windowTokens,
      windowRounds: plan.windowRounds,
      middleTokens: countTokens(baseText),
    };
  }

  const evictedRange = [baseCoveredTo + 1, plan.evictedTo];
  const evictedRounds = rounds.filter((r) => r.roundIndex >= evictedRange[0] && r.roundIndex <= evictedRange[1]);
  const recordsByRound = new Map(allRecords.map((r) => [r.round_index, r]));
  const items = buildMaterialItems(evictedRounds, recordsByRound, userName, characterName);

  // 失败时覆盖范围不推进，下一轮的短期窗口仍是滑出前的完整窗口
  const failedResult = (error) => {
    const unevicted = planEviction(rounds, baseCoveredTo, Infinity, roundIndex);
    return {
      text: baseText,
      coveredTo: baseCoveredTo,
      evicted: evictedRange,
      failed: true,
      error,
      windowTokens: unevicted.windowTokens,
      windowRounds: unevicted.windowRounds,
      middleTokens: countTokens(baseText),
    };
  };

  try {
    let summaryText = await mergeMaterial(sessionId, userName, characterName, baseText, items);

    for (let attempt = 0; attempt < MIDDLE_SUMMARY_SHRINK_ATTEMPTS && countTokens(summaryText) > MIDDLE_SUMMARY_MAX_TOKENS; attempt++) {
      summaryText = await callShrink(sessionId, summaryText);
    }

    if (!summaryText || countTokens(summaryText) > MIDDLE_SUMMARY_MAX_TOKENS) {
      return failedResult(summaryText ? '中期摘要超出长度限制' : '中期摘要输出为空');
    }

    return {
      text: summaryText,
      coveredTo: plan.evictedTo,
      evicted: evictedRange,
      failed: false,
      error: null,
      windowTokens: plan.windowTokens,
      windowRounds: plan.windowRounds,
      middleTokens: countTokens(summaryText),
    };
  } catch (err) {
    return failedResult(err.message);
  }
}

/** 用户手改最新一轮的剧情摘要正文；会话还没有轮次记录时返回 false */
export function editLatestMiddleSummary(sessionId, content) {
  return updateLatestMiddleSummary(sessionId, content);
}

export const __testables = {
  buildMaterialItems,
};
