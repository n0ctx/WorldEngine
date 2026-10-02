/**
 * long-term-recall.js — 长期记忆召回（memory-v2）
 *
 * 对外暴露：
 *   recallTurns({ sessionId, coveredTo, mode, recentMessages })
 *     → Promise<{ recordIds: string[], candidateCount: number, skippedBeforeRound: number|null }>
 *   renderRecalledTurns(recordIds, budget = MEMORY_EXPAND_MAX_TOKENS)
 *     → { text: string, hitIds: string[] }
 */

import { getRecallIndexCandidates, getTurnRecordsWithContentByIds } from '../db/queries/turn-records.js';
import { getLastTurnMessages } from '../db/queries/messages.js';
import * as llm from '../llm/index.js';
import { countTokens } from '../utils/token-counter.js';
import { getConfig } from '../services/config.js';
import {
  MEMORY_EXPAND_MAX_TOKENS,
  MEMORY_EXPAND_DECISION_MAX_TOKENS,
  LONG_TERM_RECALL_TIMEOUT_MS,
} from '../utils/constants.js';
import { createLogger, formatMeta } from '../utils/logger.js';
import { renderBackendPrompt } from '../prompts/prompt-loader.js';
import { resolveAuxScope } from '../utils/aux-scope.js';
import { parseFencedJson } from '../utils/llm-json.js';
import { stripThinkBlocksFromText, toPromptMessage } from '../utils/turn-dialogue.js';

const log = createLogger('long-term-recall');

/** 将 cast_json 解析为人物名数组，非法或缺失时返回空数组。 */
function parseCastNames(castJson) {
  if (!castJson) return [];
  try {
    const parsed = JSON.parse(castJson);
    return Array.isArray(parsed) ? parsed.map((n) => String(n ?? '').trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** 单条候选渲染为索引行：#<轮次>｜<场景>｜<人物>｜<摘要>，空字段省略。 */
function renderIndexLine(candidate) {
  const parts = [
    `#${candidate.round_index}`,
    candidate.scene || '',
    parseCastNames(candidate.cast_json).join('、'),
    candidate.summary || '',
  ].filter(Boolean);
  return parts.join('｜');
}

/**
 * 按 token 预算从候选（round_index 升序）里挑出本轮可交给召回模型的部分：
 * 从最新往最旧累加索引行 token，直到放满 budget 为止；更早的、放不下的候选本轮不可召回。
 *
 * @returns {{ selected: Array, skippedBeforeRound: number|null, indexTokens: number }}
 *   skippedBeforeRound：round_index 小于此值的候选本轮不可召回；全部候选都放得下时为 null。
 */
function selectWithinBudget(candidatesAsc, budget) {
  let usedTokens = 0;
  let firstIncludedIndex = candidatesAsc.length;
  for (let i = candidatesAsc.length - 1; i >= 0; i--) {
    const lineTokens = countTokens(renderIndexLine(candidatesAsc[i]));
    if (usedTokens + lineTokens > budget) break;
    usedTokens += lineTokens;
    firstIncludedIndex = i;
  }
  const selected = candidatesAsc.slice(firstIncludedIndex);

  let skippedBeforeRound = null;
  if (selected.length === 0 && candidatesAsc.length > 0) {
    // 连最新一条都放不下预算：全部候选本轮不可召回。
    skippedBeforeRound = candidatesAsc[candidatesAsc.length - 1].round_index + 1;
  } else if (selected.length < candidatesAsc.length) {
    skippedBeforeRound = selected[0].round_index;
  }
  return { selected, skippedBeforeRound, indexTokens: usedTokens };
}

/** 默认取「上一条 AI 回复 + 当前用户消息」拼接文本；调用方可用 recentMessages 覆盖。 */
function buildRecentMessagesText(sessionId) {
  const lastTurn = getLastTurnMessages(sessionId).map(toPromptMessage);
  const lastUser = lastTurn.find((m) => m.role === 'user');
  const lastAsst = lastTurn.find((m) => m.role === 'assistant');
  return [
    lastAsst ? `AI：${lastAsst.content}` : '',
    lastUser ? `用户：${lastUser.content}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * 从模型返回的轮次编号列表里，只保留候选中存在的整数，去重并保持模型给出的顺序。
 */
function pickKnownRounds(rounds, knownRoundSet) {
  if (!Array.isArray(rounds)) return [];
  const seen = new Set();
  const picked = [];
  for (const r of rounds) {
    const n = Number(r);
    if (!Number.isInteger(n) || !knownRoundSet.has(n) || seen.has(n)) continue;
    seen.add(n);
    picked.push(n);
  }
  return picked;
}

export const __testables = {
  parseCastNames,
  renderIndexLine,
  selectWithinBudget,
  pickKnownRounds,
};

/**
 * 长期记忆召回：从「历史轮次目录」里挑选与当前对话相关的轮次，映射回 turn_records.id。
 *
 * 行为：
 * - 按 mode 读取开关（chat 读 memory_expansion_enabled，writing 读 writing.memory_expansion_enabled），
 *   为 false 时不查询、不调用模型，直接返回空结果。
 * - coveredTo 缺失（旧会话过渡期，尚无中期摘要覆盖范围）时视为无候选，直接返回空结果。
 * - 候选为空时不调用模型。
 * - 候选目录按 long_term_index_budget 从最新往最旧裁剪；超预算的更早轮次本轮不可召回，
 *   记在 skippedBeforeRound（未裁剪时为 null）。
 * - 模型输出 `{"turns":[<轮次编号>,...]}`：编号需在候选中出现，去重、保持模型给出的顺序。
 * - 模型调用异常、超时或输出解析失败时静默返回空结果，只记日志，不影响本轮生成。
 *
 * @param {{ sessionId: string, coveredTo: number|null, mode: 'chat'|'writing', recentMessages?: string }} options
 * @returns {Promise<{ recordIds: string[], candidateCount: number, skippedBeforeRound: number|null }>}
 */
export async function recallTurns({ sessionId, coveredTo, mode, recentMessages }) {
  const empty = { recordIds: [], candidateCount: 0, skippedBeforeRound: null };
  if (!Number.isInteger(coveredTo)) return empty;

  const config = getConfig();
  const recallConfig = mode === 'writing' ? config.writing : config;
  if (recallConfig.memory_expansion_enabled === false) return empty;

  const candidatesAsc = getRecallIndexCandidates(sessionId, coveredTo);
  if (candidatesAsc.length === 0) return empty;

  const indexBudget = recallConfig.long_term_index_budget ?? 20000;
  const { selected, skippedBeforeRound, indexTokens } = selectWithinBudget(candidatesAsc, indexBudget);
  if (selected.length === 0) {
    log.warn(`索引超预算，本轮无可用候选  ${formatMeta({ session: sessionId.slice(0, 8), candidates: candidatesAsc.length, budget: indexBudget })}`);
    return { recordIds: [], candidateCount: candidatesAsc.length, skippedBeforeRound };
  }

  const systemContent = renderBackendPrompt('memory-recall-system.md', {
    INDEX_LINES: selected.map(renderIndexLine).join('\n'),
  });
  const messages = [
    { role: 'system', content: systemContent },
    {
      role: 'user',
      content: renderBackendPrompt('memory-recall-user.md', {
        CONTEXT_TEXT: recentMessages ?? buildRecentMessagesText(sessionId),
      }),
    },
  ];

  const t0 = Date.now();
  let selectedRounds;
  try {
    const raw = await llm.complete(messages, {
      temperature: 0,
      maxTokens: MEMORY_EXPAND_DECISION_MAX_TOKENS,
      configScope: resolveAuxScope(sessionId),
      callType: 'long_term_recall',
      conversationId: sessionId,
      timeoutMs: LONG_TERM_RECALL_TIMEOUT_MS,
      cacheableSystem: systemContent,
    });
    const parsed = parseFencedJson(raw);
    const knownRounds = new Set(selected.map((c) => c.round_index));
    selectedRounds = pickKnownRounds(parsed?.turns, knownRounds);
  } catch (err) {
    log.warn(`召回判定失败，降级为不召回  ${formatMeta({ session: sessionId.slice(0, 8), error: err.message })}`);
    return { recordIds: [], candidateCount: candidatesAsc.length, skippedBeforeRound };
  }

  const idByRound = new Map(selected.map((c) => [c.round_index, c.id]));
  const recordIds = selectedRounds.map((r) => idByRound.get(r)).filter(Boolean);

  log.info(`DONE  ${formatMeta({
    session: sessionId.slice(0, 8),
    candidates: candidatesAsc.length,
    indexTokens,
    skippedBeforeRound,
    selectedRounds,
    ms: Date.now() - t0,
  })}`);

  return { recordIds, candidateCount: candidatesAsc.length, skippedBeforeRound };
}

/**
 * 将选中的 turn record 原文渲染为可读文本块，按轮次编号升序排列。
 * 单条超出 budget 时跳过该条，继续尝试渲染后面的（不因某一条超预算而丢弃后面全部）。
 *
 * @param {string[]} recordIds  turn_records.id 列表（顺序任意，内部按 round_index 排序）
 * @param {number} [budget]     token 预算，默认 MEMORY_EXPAND_MAX_TOKENS
 * @returns {{ text: string, hitIds: string[] }}  hitIds 为实际渲染进 text 的 recordId（按渲染顺序）
 */
export function renderRecalledTurns(recordIds, budget = MEMORY_EXPAND_MAX_TOKENS) {
  if (!recordIds || recordIds.length === 0) return { text: '', hitIds: [] };

  const records = getTurnRecordsWithContentByIds(recordIds);
  const ordered = recordIds
    .map((id) => records.get(id))
    .filter(Boolean)
    .sort((a, b) => a.round_index - b.round_index);

  const sections = [];
  const hitIds = [];
  let usedTokens = 0;

  for (const record of ordered) {
    const dateStr = new Date(record.created_at).toISOString().slice(0, 10);
    const titleStr = record.session_title || '未命名会话';

    const userContent = record.user_content ?? '';
    const asstContent = stripThinkBlocksFromText(record.asst_content ?? '').trimStart();
    const originalText = [
      userContent ? `{{user}}：${userContent}` : '',
      asstContent ? `{{char}}：${asstContent}` : '',
    ].filter(Boolean).join('\n\n');
    const sectionText = `【历史对话原文 · ${dateStr} · ${titleStr} · 第${record.round_index}轮】\n${originalText}`;
    const sectionTokens = countTokens(sectionText);

    if (usedTokens + sectionTokens > budget) continue;

    sections.push(sectionText);
    hitIds.push(record.id);
    usedTokens += sectionTokens;
  }

  return { text: sections.join('\n\n'), hitIds };
}
