/**
 * middle-summary.js — 中期摘要：轮次滑出短期窗口时按阶段合并（memory-v2 中期层）
 *
 * 摘要按阶段组织：开头一段【前情】是最早剧情的浓缩，之后每个阶段以「【第a–b轮｜地点｜时间】」开头，
 * 写起因、经过、结果、变化。只有最后一个阶段会和新滑出的轮次一起交给模型续写或收尾；
 * 更早的阶段原样保留，总长超限时才把最老的几段压进【前情】。
 *
 * 对外暴露：
 *   planEviction(rounds, coveredTo, budget, latestRound)
 *     → { evictedTo, windowTokens, windowRounds }  纯函数，短期窗口滑出计算
 *
 *   computeMiddleSummary(sessionId, roundIndex)
 *     → Promise<{ text, coveredTo, evicted, failed, error, windowTokens, windowRounds, middleTokens }>
 *
 *   resolveSpeakers(session) → { userLabel, assistantLabel, namingRule }  摘要类提示词的说话人标注与称呼规则
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
import { countTokens, CJK_TOKENS_PER_CHAR } from '../utils/token-counter.js';
import { splitRounds, roundTokens } from '../utils/session-rounds.js';
import { toPromptMessage } from '../utils/turn-dialogue.js';
import {
  ALL_MESSAGES_LIMIT,
  LLM_TASK_TEMPERATURE,
  LLM_BACKGROUND_TASK_TIMEOUT_MS,
  MIDDLE_SUMMARY_MAX_TOKENS,
  MIDDLE_PROLOGUE_MAX_TOKENS,
  MIDDLE_PHASE_MAX_TOKENS,
  MIDDLE_COMPRESS_INPUT_MAX_TOKENS,
  MIDDLE_RAW_ROUNDS_MAX,
  SHORT_TERM_EVICT_TARGET_RATIO,
} from '../utils/constants.js';

/** 【前情】超限后最多再压这么多次；仍超限则回退基线 */
const MIDDLE_SUMMARY_SHRINK_ATTEMPTS = 2;
/** 折叠后剩余阶段压到（总上限 − 前情上限）的这个比例以内，之后几次滑出不必再折叠 */
const FOLD_TARGET_RATIO = 0.6;
const PROLOGUE_HEADER = '【前情】';

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

/**
 * 摘要类提示词里的说话人标注与称呼规则。
 * 对话模式两边是玩家与角色卡；写作模式没有单一角色，助手一侧是写出的故事正文。
 */
export function resolveSpeakers(session) {
  const character = session?.character_id ? getCharacterById(session.character_id) : null;
  const worldId = character?.world_id ?? session?.world_id;
  const personaName = (worldId ? getOrCreatePersona(worldId) : null)?.name?.trim();
  if (session?.mode === 'writing') {
    const protagonist = personaName ? `玩家扮演的主角叫"${personaName}"；` : '';
    return {
      userLabel: '玩家输入',
      assistantLabel: '正文',
      namingRule: `${protagonist}"玩家输入"是玩家这一轮的要求，"正文"是据此写出的故事，事实以正文为准；人物一律写出名字，不要用"玩家""角色""主角"这类代称`,
    };
  }
  const userName = personaName || '玩家';
  const characterName = character?.name?.trim() || '角色';
  return {
    userLabel: userName,
    assistantLabel: characterName,
    namingRule: `用户一方称"${userName}"，角色一方称"${characterName}"，其余人物写出名字`,
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
function renderRoundRaw(round, speakers) {
  return round.messages
    .map((msg) => `第${round.roundIndex}轮 ${msg.role === 'user' ? speakers.userLabel : speakers.assistantLabel}：${msg.content}`)
    .join('\n');
}

/**
 * 把被滑出的轮次拼成合并材料，按时间顺序排列：
 * 最后 MIDDLE_RAW_ROUNDS_MAX 轮用原文，更早的轮次用其索引行（turn record 的 summary，为空则跳过该轮）。
 *
 * @param {Array<{roundIndex:number, messages:Array}>} evictedRounds
 * @param {Map<number, object>} recordsByRound  round_index → turn record
 * @param {{userLabel:string, assistantLabel:string}} speakers
 * @returns {string[]}
 */
function buildMaterialItems(evictedRounds, recordsByRound, speakers) {
  const rawStart = Math.max(0, evictedRounds.length - MIDDLE_RAW_ROUNDS_MAX);
  const items = [];
  evictedRounds.forEach((round, index) => {
    if (index >= rawStart) {
      items.push(renderRoundRaw(round, speakers));
      return;
    }
    const summary = recordsByRound.get(round.roundIndex)?.summary?.trim();
    if (summary) items.push(`第${round.roundIndex}轮：${summary}`);
  });
  return items;
}

/** 发起一次中期摘要 LLM 调用（合并/折叠共用调用参数），返回剥离 think 块后的正文 */
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

/** token 上限折成提示词里的字数上限，与 countTokens 的中文换算一致 */
function charsFor(tokens) {
  return Math.floor(tokens / CJK_TOKENS_PER_CHAR);
}

/**
 * 把摘要文本拆成前情与阶段：以「【」开头的行开始新的一段；「【前情】」段和第一个标题之前的文字
 * （旧版不分阶段的摘要、用户手改时删掉标题的文字）都算前情。
 *
 * @returns {{ prologue:string, phases:string[] }}  prologue 是正文（不含标题），phases 是含标题的整段文本
 */
function parseSummary(text) {
  const prologue = [];
  const phases = [];
  for (const chunk of (text || '').split(/\n(?=[ \t]*【)/)) {
    const part = chunk.trim();
    if (!part) continue;
    if (part.startsWith(PROLOGUE_HEADER)) prologue.push(part.slice(PROLOGUE_HEADER.length).trim());
    else if (part.startsWith('【')) phases.push(part);
    else prologue.push(part);
  }
  return { prologue: prologue.filter(Boolean).join('\n'), phases };
}

function serializeSummary({ prologue, phases }) {
  return [prologue ? `${PROLOGUE_HEADER}\n${prologue}` : '', ...phases].filter(Boolean).join('\n\n');
}

/**
 * 总长超过 MIDDLE_SUMMARY_MAX_TOKENS 或前情超过 MIDDLE_PROLOGUE_MAX_TOKENS 时需要折叠：
 * 从最老的阶段开始数，直到剩余阶段不超过（总上限 − 前情上限）× FOLD_TARGET_RATIO。
 * 最后一个阶段只有在它自己就超出这个余量时才会被折进前情。
 *
 * @returns {number|null}  要折进前情的最老阶段数；不需要折叠时为 null（0 表示只压前情本身）
 */
function planFold(prologue, phases) {
  const total = countTokens(serializeSummary({ prologue, phases }));
  if (total <= MIDDLE_SUMMARY_MAX_TOKENS && countTokens(prologue) <= MIDDLE_PROLOGUE_MAX_TOKENS) return null;
  const target = (MIDDLE_SUMMARY_MAX_TOKENS - MIDDLE_PROLOGUE_MAX_TOKENS) * FOLD_TARGET_RATIO;
  const tokens = phases.map((p) => countTokens(p));
  let rest = tokens.reduce((sum, t) => sum + t, 0);
  let count = 0;
  while (rest > target) {
    rest -= tokens[count];
    count++;
  }
  return count;
}

/** 让模型把新材料接到当前阶段上，返回续写或收尾后的一个或多个阶段；输出不是阶段格式时抛错 */
async function callMerge(sessionId, speakers, earlierText, openPhase, materialText) {
  const output = await callMiddleSummaryLLM(sessionId, renderBackendPrompt('memory-middle-summary.md', {
    EARLIER: earlierText || '（暂无）',
    OPEN_PHASE: openPhase || '（暂无）',
    NEW_ROUNDS: materialText,
    NAMING_RULE: speakers.namingRule,
    PHASE_MAX_CHARS: charsFor(MIDDLE_PHASE_MAX_TOKENS),
  }));
  if (!output) throw new Error('中期摘要输出为空');
  const { prologue, phases } = parseSummary(output);
  if (prologue || phases.length === 0) throw new Error('中期摘要格式不符');
  return phases;
}

/**
 * 按 MIDDLE_COMPRESS_INPUT_MAX_TOKENS 分批把新材料接到最后一个阶段上：
 * 每批只把当前阶段交给模型改写，更早的阶段只作参考、原样保留。
 *
 * @returns {Promise<string[]>}  合并后的全部阶段（尚未折叠）
 */
async function mergeMaterial(sessionId, speakers, base, items) {
  const sealed = base.phases.slice(0, -1);
  let open = base.phases.at(-1);
  let i = 0;
  while (i < items.length) {
    let batchTokens = 0;
    const batch = [];
    while (i < items.length) {
      const itemTokens = countTokens(items[i]);
      if (batch.length > 0 && countTokens(open) + batchTokens + itemTokens > MIDDLE_COMPRESS_INPUT_MAX_TOKENS) break;
      batch.push(items[i]);
      batchTokens += itemTokens;
      i++;
    }
    const earlier = serializeSummary({ prologue: base.prologue, phases: sealed });
    const phases = await callMerge(sessionId, speakers, earlier, open, batch.join('\n\n'));
    open = phases.pop();
    sealed.push(...phases);
  }
  return [...sealed, open];
}

/** 把最老的几个阶段压进前情；前情超出上限时再压，最多 MIDDLE_SUMMARY_SHRINK_ATTEMPTS 次，仍超限或为空时抛错 */
async function foldIntoPrologue(sessionId, speakers, prologue, phases) {
  const maxChars = charsFor(MIDDLE_PROLOGUE_MAX_TOKENS);
  const callFold = async (existing, phasesText, retryNote) => {
    const output = await callMiddleSummaryLLM(sessionId, renderBackendPrompt('memory-middle-summary-shrink.md', {
      PROLOGUE: existing || '（暂无）',
      PHASES: phasesText || '（无）',
      NAMING_RULE: speakers.namingRule,
      MAX_CHARS: maxChars,
      RETRY_NOTE: retryNote,
    }));
    return output.replace(/^【前情】\s*/, '');
  };

  let text = await callFold(prologue, phases.join('\n\n'), '');
  for (let attempt = 0; countTokens(text) > MIDDLE_PROLOGUE_MAX_TOKENS; attempt++) {
    if (attempt === MIDDLE_SUMMARY_SHRINK_ATTEMPTS) throw new Error('中期摘要超出长度限制');
    text = await callFold(text, '', `你上一次写了 ${text.length} 字，仍然超限。`);
  }
  if (!text) throw new Error('中期摘要输出为空');
  return text;
}

/** 把新材料接到摘要的最后一个阶段上，需要时把最老的阶段压进前情，返回新的摘要文本 */
async function rebuildSummary(sessionId, speakers, baseText, items) {
  const base = parseSummary(baseText);
  let phases = await mergeMaterial(sessionId, speakers, base, items);
  let prologue = base.prologue;

  const foldCount = planFold(prologue, phases);
  if (foldCount !== null) {
    prologue = await foldIntoPrologue(sessionId, speakers, prologue, phases.slice(0, foldCount));
    phases = phases.slice(foldCount);
  }
  return serializeSummary({ prologue, phases });
}

/**
 * 计算第 roundIndex 轮的中期摘要。
 * 基线取 round_index < roundIndex 的最新记录（无记录或 middle_covered_to 为 null 时按 text='' / coveredTo=0 处理）。
 * 无滑出时原样继承基线；有滑出时把被滑出的轮次接到最后一个阶段上，总长超限再把最老的阶段压进前情；
 * 任一步失败则回退基线并标记 failed（不抛错，调用方在建行之后自行抛出）。
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
  const speakers = resolveSpeakers(session);
  const budget = resolveBudget(getConfig(), session);

  const allRecords = getAllTurnRecordsBySessionId(sessionId);
  const baseline = allRecords.filter((r) => r.round_index < roundIndex).pop();
  const baseCoveredTo = baseline?.middle_covered_to ?? 0;
  const baseText = baseline?.middle_covered_to == null ? '' : (baseline.middle_summary ?? '');

  const messages = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0).map(toPromptMessage);
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
  const items = buildMaterialItems(evictedRounds, recordsByRound, speakers);

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
    const summaryText = await rebuildSummary(sessionId, speakers, baseText, items);
    if (countTokens(summaryText) > MIDDLE_SUMMARY_MAX_TOKENS) {
      return failedResult('中期摘要超出长度限制');
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
  parseSummary,
  serializeSummary,
  planFold,
};
