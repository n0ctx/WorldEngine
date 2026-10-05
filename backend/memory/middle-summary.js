/**
 * middle-summary.js — 中期摘要：轮次滑出短期窗口后按事件整理（memory-v2 中期层）
 *
 * 摘要分两部分：
 *   - 已结束的事件：每个事件以「【第a–b轮｜时间｜地点｜人物】」开头，写起因、经过、结果、变化。
 *     事件结束后才一次写成，之后不再改写；存放在 turn record 的 middle_summary 里。
 *   - 进行中的事件：最后一个已结束事件之后、已滑出窗口的轮次，不写摘要，直接列出每轮的索引行。
 * 每次有轮次滑出时，让模型判断进行中的事件里有没有已经结束的，有就整理成事件接到末尾；
 * 总长超限时由代码先去掉最老事件的起因与经过，仍超限再删掉最老的事件。
 *
 * 对外暴露：
 *   planEviction(rounds, coveredTo, budget, latestRound)
 *     → { evictedTo, windowTokens, windowRounds }  纯函数，短期窗口滑出计算
 *
 *   computeMiddleSummary(sessionId, roundIndex)
 *     → Promise<{ text, coveredTo, evicted, failed, error, windowTokens, windowRounds, middleTokens }>
 *
 *   closedRoundOf(text, coveredTo) → number  已整理成事件的最后一轮
 *
 *   openEventLines(sessionId, closedTo, coveredTo) → string[]  进行中事件的逐轮索引行
 *
 *   renderStorySummary(sessionId, text, coveredTo) → string  已结束的事件加进行中事件的逐轮记录，注入正文用
 *
 *   resolveSpeakers(session) → { userLabel, assistantLabel, namingRule }  摘要类提示词的说话人标注与称呼规则
 */

import * as llm from '../llm/index.js';
import { getSessionById } from '../db/queries/sessions.js';
import { getCharacterById } from '../db/queries/characters.js';
import { getMessagesBySessionId } from '../db/queries/messages.js';
import {
  getAllTurnRecordsBySessionId,
  getTurnSummariesInRange,
  updateLatestMiddleSummary,
} from '../db/queries/turn-records.js';
import { getOrCreatePersona } from '../services/personas.js';
import { getConfig } from '../services/config.js';
import { resolveAuxScope } from '../utils/aux-scope.js';
import { renderBackendPrompt } from '../prompts/prompt-loader.js';
import { countTokens } from '../utils/token-counter.js';
import { splitRounds, roundTokens } from '../utils/session-rounds.js';
import { toPromptMessage } from '../utils/turn-dialogue.js';
import {
  ALL_MESSAGES_LIMIT,
  LLM_TASK_TEMPERATURE,
  LLM_BACKGROUND_TASK_TIMEOUT_MS,
  MIDDLE_SUMMARY_MAX_TOKENS,
  MIDDLE_OPEN_EVENT_MAX_ROUNDS,
  SHORT_TERM_EVICT_TARGET_RATIO,
} from '../utils/constants.js';

const EVENT_HEADER = /^【第(\d+)(?:\s*[–—~～至到-]\s*(\d+))?轮/;
/** 总长超限时可以从老事件里去掉的行 */
const TRIMMABLE_LINE = /^(起因|经过)：/;
const UNFINISHED_REPLY = '未完';

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

/** 把摘要拆成事件块：以「【」开头的行开始新的一块；第一个标题之前的文字（旧版摘要、手改的文字）自成一块 */
function splitEvents(text) {
  return (text || '').split(/\n(?=[ \t]*【)/).map((part) => part.trim()).filter(Boolean);
}

/** 事件标题里的轮次范围；没有轮号时返回 null */
function eventRange(event) {
  const match = event.match(EVENT_HEADER);
  if (!match) return null;
  const from = Number(match[1]);
  return [from, match[2] ? Number(match[2]) : from];
}

/**
 * 已整理成事件的最后一轮：取最后一个事件标题的止轮，不超过 coveredTo；摘要为空时为 0；
 * 最后一块没有轮号（旧版摘要、手改时删掉了标题）时视为已整理到 coveredTo。
 */
export function closedRoundOf(text, coveredTo) {
  const events = splitEvents(text);
  if (events.length === 0) return 0;
  return Math.min(eventRange(events.at(-1))?.[1] ?? coveredTo, coveredTo);
}

/** 进行中事件的逐轮记录：(closedTo, coveredTo] 内已生成的索引行 */
export function openEventLines(sessionId, closedTo, coveredTo) {
  return getTurnSummariesInRange(sessionId, closedTo, coveredTo)
    .map((record) => `第${record.round_index}轮：${record.summary.trim()}`);
}

/** 注入正文的剧情摘要：已结束的事件，加上进行中事件已滑出窗口部分的逐轮记录 */
export function renderStorySummary(sessionId, text, coveredTo) {
  const closedTo = closedRoundOf(text, coveredTo);
  const lines = openEventLines(sessionId, closedTo, coveredTo);
  const open = lines.length > 0 ? `【进行中的事件｜第${closedTo + 1}–${coveredTo}轮】\n${lines.join('\n')}` : '';
  return [(text || '').trim(), open].filter(Boolean).join('\n\n');
}

/**
 * 解析模型整理出的事件；只回「未完」时返回空数组。
 * 每个事件都要有轮号，且依次落在 (closedTo, coveredTo] 内、互不重叠，否则抛错。
 * 含第 coveredTo 轮的事件后面还可能接着发生，一律当作没结束丢掉，下次滑出时再整理。
 */
function parseClosedEvents(output, closedTo, coveredTo) {
  if (!output) throw new Error('中期摘要输出为空');
  if (output.startsWith(UNFINISHED_REPLY)) return [];
  const events = splitEvents(output);
  let last = closedTo;
  for (const event of events) {
    const range = eventRange(event);
    if (!range || range[0] <= last || range[1] < range[0] || range[1] > coveredTo) {
      throw new Error('中期摘要格式不符');
    }
    last = range[1];
  }
  return last === coveredTo ? events.slice(0, -1) : events;
}

/** 总长超过 MIDDLE_SUMMARY_MAX_TOKENS 时，先从最老的事件起去掉起因与经过，仍超限再删最老的事件；最后一个事件始终保留 */
function fitSummary(events) {
  const kept = [...events];
  const overLimit = () => countTokens(kept.join('\n\n')) > MIDDLE_SUMMARY_MAX_TOKENS;
  for (let i = 0; i < kept.length - 1 && overLimit(); i++) {
    kept[i] = kept[i].split('\n').filter((line) => !TRIMMABLE_LINE.test(line.trim())).join('\n');
  }
  while (kept.length > 1 && overLimit()) kept.shift();
  return kept.join('\n\n');
}

/** 让模型判断进行中的事件里有没有已经结束的，返回整理好的事件（可能为空）；只有一轮时不可能有已结束的事件，不调用模型 */
async function closeEvents(sessionId, speakers, closedText, closedTo, coveredTo) {
  const lines = openEventLines(sessionId, closedTo, coveredTo);
  if (lines.length < 2) return [];
  const forceNote = coveredTo - closedTo > MIDDLE_OPEN_EVENT_MAX_ROUNDS
    ? `- 进行中的记录已超过 ${MIDDLE_OPEN_EVENT_MAX_ROUNDS} 轮，这次至少要整理出一个事件`
    : '';
  const raw = await llm.complete([{
    role: 'user',
    content: renderBackendPrompt('memory-middle-summary.md', {
      CLOSED: closedText || '（暂无）',
      OPEN: lines.join('\n'),
      FIRST_ROUND: closedTo + 1,
      NAMING_RULE: speakers.namingRule,
      FORCE_NOTE: forceNote,
    }),
  }], {
    configScope: resolveAuxScope(sessionId),
    callType: 'middle_summary',
    conversationId: sessionId,
    timeoutMs: LLM_BACKGROUND_TASK_TIMEOUT_MS,
    temperature: LLM_TASK_TEMPERATURE,
  });
  return parseClosedEvents(stripThink(raw), closedTo, coveredTo);
}

/**
 * 计算第 roundIndex 轮的中期摘要。
 * 基线取 round_index < roundIndex 的最新记录（无记录或 middle_covered_to 为 null 时按 text='' / coveredTo=0 处理）。
 * 有滑出时覆盖范围直接推进，滑出的轮次先进入进行中的事件；再让模型整理其中已结束的事件。
 * 整理失败只标记 failed，摘要保持基线，下次滑出时再判断（不抛错，调用方在建行之后自行抛出）。
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
  const budget = resolveBudget(getConfig(), session);

  const baseline = getAllTurnRecordsBySessionId(sessionId).filter((r) => r.round_index < roundIndex).pop();
  const baseCoveredTo = baseline?.middle_covered_to ?? 0;
  const baseText = baseline?.middle_covered_to == null ? '' : (baseline.middle_summary ?? '');

  const messages = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0).map(toPromptMessage);
  const plan = planEviction(splitRounds(messages), baseCoveredTo, budget, roundIndex);

  const result = {
    text: baseText,
    coveredTo: plan.evictedTo,
    evicted: null,
    failed: false,
    error: null,
    windowTokens: plan.windowTokens,
    windowRounds: plan.windowRounds,
    middleTokens: countTokens(baseText),
  };
  if (plan.evictedTo === baseCoveredTo) return result;

  result.evicted = [baseCoveredTo + 1, plan.evictedTo];
  try {
    const closedTo = closedRoundOf(baseText, baseCoveredTo);
    const events = await closeEvents(sessionId, resolveSpeakers(session), baseText, closedTo, plan.evictedTo);
    if (events.length > 0) {
      result.text = fitSummary([...splitEvents(baseText), ...events]);
      result.middleTokens = countTokens(result.text);
    }
  } catch (err) {
    result.failed = true;
    result.error = err.message;
  }
  return result;
}

/** 用户手改最新一轮的剧情摘要正文；会话还没有轮次记录时返回 false */
export function editLatestMiddleSummary(sessionId, content) {
  return updateLatestMiddleSummary(sessionId, content);
}

export const __testables = {
  parseClosedEvents,
  fitSummary,
};
