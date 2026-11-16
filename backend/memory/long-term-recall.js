/**
 * long-term-recall.js — 长期召回：从不在历史里的轮次（被压缩块覆盖、或被兜底移出）中按需取回原文
 *
 * 候选目录每轮一行：#<轮次>｜<场景>｜<人物>｜<索引摘要>（轮次索引由 turn-summarizer.js 生成；
 * 还没有索引的轮次取原文开头一段代替），按所属的压缩块分组，组标题标出块覆盖的轮次与小标题。
 * 目录超过 long_term_index_budget 时，按与近期对话的词法相关度（search.js）挑选放得下的候选，
 * 而不是只留最近的几轮；相关度相同时偏向较近的轮次。
 * 副模型从目录里挑轮次，原文从库里的消息读取，因此没有轮次索引的轮次也能召回。
 *
 * 对外暴露：
 *   recallTurns({ sessionId, mode, scope, recentMessages? })
 *     → Promise<{ rounds:number[], candidateCount:number, droppedCount:number }>
 *   renderRecalledTurns(rounds, units, budget = MEMORY_EXPAND_MAX_TOKENS)
 *     → { text:string, hitRounds:number[] }
 */

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
import { toPromptMessage } from '../utils/turn-dialogue.js';
import { rankDocuments } from './context/search.js';

const log = createLogger('long-term-recall');
const SNIPPET_CHARS = 60;

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

/** 没有轮次索引时用这一轮回复的开头一段代替摘要 */
function snippetOf(unit) {
  const reply = unit?.prompt.findLast((msg) => msg.role === 'assistant')?.content ?? unit?.prompt[0]?.content ?? '';
  const chars = [...reply.replace(/\s+/g, ' ').trim()];
  return chars.length > SNIPPET_CHARS ? `${chars.slice(0, SNIPPET_CHARS).join('')}……` : chars.join('');
}

/** 单条候选渲染为索引行：#<轮次>｜<场景>｜<人物>｜<摘要>，空字段省略。 */
function renderIndexLine(candidate) {
  return [
    `#${candidate.round}`,
    candidate.scene || '',
    parseCastNames(candidate.cast_json).join('、'),
    candidate.summary || '',
  ].filter(Boolean).join('｜');
}

/** 候选：不在历史里的轮次，带索引行与参与相关度打分的全文 */
function buildCandidates(scope) {
  const indexByRound = new Map(scope.indexRows.map((row) => [row.round_index, row]));
  return [...scope.outOfViewRounds].sort((a, b) => a - b).map((round) => {
    const unit = scope.units[round - 1];
    const index = indexByRound.get(round);
    const candidate = {
      round,
      scene: index?.scene || '',
      cast_json: index?.cast_json || null,
      summary: index?.summary || snippetOf(unit),
    };
    candidate.line = renderIndexLine(candidate);
    candidate.tokens = countTokens(candidate.line);
    candidate.searchText = `${candidate.line}\n${unit?.prompt.map((msg) => msg.content).join('\n') ?? ''}`;
    return candidate;
  });
}

/**
 * 目录放不下时按相关度挑：先放得分高的，再按从新到旧补满预算；返回按轮次升序的入选候选。
 */
function selectWithinBudget(candidates, budget, queryText) {
  const total = candidates.reduce((sum, c) => sum + c.tokens, 0);
  if (total <= budget) return { selected: candidates, indexTokens: total };
  const ranked = rankDocuments(queryText, candidates.map((c) => ({ id: c.round, text: c.searchText })));
  const byRound = new Map(candidates.map((c) => [c.round, c]));
  const order = [...ranked.map((hit) => byRound.get(hit.id)), ...[...candidates].reverse()];
  const picked = new Set();
  let used = 0;
  for (const candidate of order) {
    if (picked.has(candidate.round) || used + candidate.tokens > budget) continue;
    picked.add(candidate.round);
    used += candidate.tokens;
  }
  return { selected: candidates.filter((c) => picked.has(c.round)), indexTokens: used };
}

/** 目录按所属块分组：组标题是块覆盖的轮次与小标题；被兜底移出的轮次单独成组 */
function renderCatalog(selected, activeBlocks) {
  const groups = [];
  for (const candidate of selected) {
    const block = activeBlocks.find((b) => candidate.round >= b.fromRound && candidate.round <= b.toRound);
    const title = block
      ? `【第${block.fromRound}–${block.toRound}轮${block.topic ? `·${block.topic}` : ''}】`
      : '【暂不在上下文的原文】';
    if (groups.at(-1)?.title !== title) groups.push({ title, lines: [] });
    groups.at(-1).lines.push(candidate.line);
  }
  return groups.map((group) => `${group.title}\n${group.lines.join('\n')}`).join('\n');
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

/** 从模型返回的轮次编号列表里，只保留候选中存在的整数，去重并保持模型给出的顺序。 */
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
  buildCandidates,
  renderCatalog,
};

/**
 * 行为：
 * - 按 mode 读取开关（chat 读 memory_expansion_enabled，writing 读 writing.memory_expansion_enabled），为 false 时直接返回空结果。
 * - scope 缺失或没有不在历史里的轮次时，不调用模型。
 * - 模型输出 `{"turns":[<轮次编号>,...]}`：编号需在入选目录中出现，去重、保持模型给出的顺序。
 * - 模型调用异常、超时或输出解析失败时静默返回空结果，只记日志，不影响本轮生成。
 *
 * @param {{ sessionId:string, mode:'chat'|'writing', recentMessages?:string,
 *   scope: { units:Array, outOfViewRounds:Set<number>, activeBlocks:Array, indexRows:Array } | null }} options
 */
export async function recallTurns({ sessionId, mode, recentMessages, scope }) {
  const empty = { rounds: [], candidateCount: 0, droppedCount: 0 };
  if (!scope || scope.outOfViewRounds.size === 0) return empty;

  const config = getConfig();
  const recallConfig = mode === 'writing' ? config.writing : config;
  if (recallConfig.memory_expansion_enabled === false) return empty;

  const contextText = recentMessages ?? buildRecentMessagesText(sessionId);
  const candidates = buildCandidates(scope);
  const indexBudget = recallConfig.long_term_index_budget ?? 20000;
  const { selected, indexTokens } = selectWithinBudget(candidates, indexBudget, contextText);
  const droppedCount = candidates.length - selected.length;
  if (selected.length === 0) {
    log.warn(`索引超预算，本轮无可用候选  ${formatMeta({ session: sessionId.slice(0, 8), candidates: candidates.length, budget: indexBudget })}`);
    return { rounds: [], candidateCount: candidates.length, droppedCount };
  }

  const systemContent = renderBackendPrompt('memory-recall-system.md', {
    INDEX_LINES: renderCatalog(selected, scope.activeBlocks),
  });
  const messages = [
    { role: 'system', content: systemContent },
    { role: 'user', content: renderBackendPrompt('memory-recall-user.md', { CONTEXT_TEXT: contextText }) },
  ];

  const t0 = Date.now();
  let rounds;
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
    rounds = pickKnownRounds(parseFencedJson(raw)?.turns, new Set(selected.map((c) => c.round)));
  } catch (err) {
    log.warn(`召回判定失败，降级为不召回  ${formatMeta({ session: sessionId.slice(0, 8), error: err.message })}`);
    return { rounds: [], candidateCount: candidates.length, droppedCount };
  }

  log.info(`DONE  ${formatMeta({
    session: sessionId.slice(0, 8),
    candidates: candidates.length,
    indexTokens,
    dropped: droppedCount,
    selectedRounds: rounds,
    ms: Date.now() - t0,
  })}`);
  return { rounds, candidateCount: candidates.length, droppedCount };
}

/**
 * 将选中轮次的原文渲染为可读文本块，按轮次编号升序排列。
 * 单条超出 budget 时跳过该条，继续尝试渲染后面的。
 *
 * @param {number[]} rounds  轮号（顺序任意）
 * @param {Array} units      轮次单元（memory/context/view.js#buildRoundUnits）
 * @param {number} [budget]
 * @returns {{ text:string, hitRounds:number[] }}
 */
export function renderRecalledTurns(rounds, units, budget = MEMORY_EXPAND_MAX_TOKENS) {
  if (!rounds || rounds.length === 0) return { text: '', hitRounds: [] };
  const sections = [];
  const hitRounds = [];
  let usedTokens = 0;
  for (const round of [...rounds].sort((a, b) => a - b)) {
    const unit = units[round - 1];
    if (!unit) continue;
    const dateStr = new Date(unit.messages[0].created_at).toISOString().slice(0, 10);
    const originalText = unit.prompt
      .filter((msg) => msg.content)
      .map((msg) => `${msg.role === 'user' ? '{{user}}' : '{{char}}'}：${msg.content.trimStart()}`)
      .join('\n\n');
    const sectionText = `【历史对话原文 · ${dateStr} · 第${round}轮】\n${originalText}`;
    const sectionTokens = countTokens(sectionText);
    if (usedTokens + sectionTokens > budget) continue;
    sections.push(sectionText);
    hitRounds.push(round);
    usedTokens += sectionTokens;
  }
  return { text: sections.join('\n\n'), hitRounds };
}
