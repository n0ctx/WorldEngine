/**
 * segments.js — assembler 各段的渲染实现
 *
 * 纪律：这里只放纯构造器 —— 不打日志、不推 SSE、不做 LLM / DB 之外的副作用。
 * 段的「顺序」由 assembler.js 独占负责；本文件只负责「每一段长什么样」。
 *
 * ⚠️ 本文件任何函数的输出字节变化都等价于修改 assembler 的锁定顺序，
 *    需同步确认 tests/prompts/__snapshots__/assembler-golden.snap。
 */

import {
  renderPersonaState,
  renderWorldState,
  renderRecalledSummaries,
} from '../memory/recall.js';
import { renderExpandedTurnRecords } from '../memory/summary-expander.js';
import { readMemoryFile as readLongTermMemory } from '../services/long-term-memory.js';
import { readTables } from '../services/table-memory.js';
import { renderTablesToMarkdown } from '../services/table-memory-ops.js';
import { MEMORY_EXPAND_MAX_TOKENS, SUGGESTION_TOKEN_RESERVE } from '../utils/constants.js';

/** [2] 常驻 cached 条目（trigger_type=always 且 token=0） */
export function renderCachedEntriesSection(allWorldEntries, tv) {
  const cachedEntries = allWorldEntries
    .filter((entry) => entry.trigger_type === 'always' && entry.token === 0 && entry.content);
  if (cachedEntries.length === 0) return { text: null, count: 0 };
  const cachedTexts = cachedEntries.map((entry) => `【${tv(entry.title)}】\n${tv(entry.content)}`);
  return {
    text: `<world_entries>\n${cachedTexts.join('\n\n')}\n</world_entries>`,
    count: cachedEntries.length,
  };
}

/** [3] 玩家 System Prompt */
export function renderUserInfoSection(personaName, personaPrompt, tv) {
  if (!personaName && !personaPrompt) return null;
  const lines = [];
  if (personaName) lines.push(`名字：${personaName}`);
  if (personaPrompt) lines.push(tv(personaPrompt));
  return tv(`<user_info>\n${lines.join('\n')}\n</user_info>`);
}

/** [5] 世界状态 */
export function renderWorldStateSection(worldId, sessionId, tv) {
  const text = renderWorldState(worldId, sessionId);
  return text ? `<world_state>\n${tv(text)}\n</world_state>` : null;
}

/** [6] 玩家状态 */
export function renderUserStateSection(worldId, sessionId, tv) {
  const text = renderPersonaState(worldId, sessionId);
  return text ? `<user_state>\n${tv(text)}\n</user_state>` : null;
}

/** [8] 参与动态触发的世界条目（token=0 的常驻条目已进 cached layer） */
export function selectDynamicWorldEntries(allWorldEntries) {
  return allWorldEntries.filter((entry) => !(entry.trigger_type === 'always' && entry.token === 0));
}

/** [8] 命中条目按 token ASC, sort_order ASC 稳定排序 */
export function sortTriggeredEntries(worldEntries, triggeredIds) {
  return worldEntries
    .filter((entry) => triggeredIds.has(entry.id) && entry.content)
    .sort((a, b) => {
      const diff = (a.token ?? 1) - (b.token ?? 1);
      if (diff !== 0) return diff;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
}

/** [8] 命中条目渲染 */
export function renderTriggeredEntriesSection(triggeredEntries, tv) {
  const entryTexts = triggeredEntries.map((entry) => `【${tv(entry.title)}】\n${tv(entry.content)}`);
  if (entryTexts.length === 0) return null;
  return `<world_entries>\n${entryTexts.join('\n\n')}\n</world_entries>`;
}

/** [8.5] 长期记忆（会话级 md 文件）；未启用或为空时返回 null */
export function renderLongTermMemorySection(sessionId, enabled, tv) {
  if (enabled !== true) return null;
  const ltm = readLongTermMemory(sessionId).trim();
  if (!ltm) return null;
  return { text: `<long_term_memory>\n${tv(ltm)}\n</long_term_memory>`, chars: ltm.length };
}

/**
 * [8.6] 表格记忆：结构化真源渲染成 md（主模型版不含内部 id）。
 * 未启用或为空时返回 null。
 */
export function renderTableMemorySection(sessionId, enabled) {
  if (enabled !== true) return null;
  const md = renderTablesToMarkdown(readTables(sessionId), { withId: false });
  if (!md) return null;
  return {
    text: `<table_memory hint="以下为已知状态的被动参考，均为当前状态快照。剧情以玩家本轮输入为准——这不是在场名单或行动清单，不要因某项列在表里就让它登场或被提及，也不要在无关的人/势力/线索间臆造关联；仅本轮正文确需或明确关联时才动用。">\n${md}\n</table_memory>`,
    chars: md.length,
  };
}

/** [9] 召回摘要 */
export function renderRecalledSummariesSection(recalled, tv) {
  const text = renderRecalledSummaries(recalled);
  return text ? `<recalled_memories>\n${tv(text)}\n</recalled_memories>` : null;
}

/** [10] 展开判定的候选清单（SSE 透传用） */
export function buildExpandCandidates(recalled) {
  return recalled.map((r) => ({
    ref: r.ref,
    turn_record_id: r.turn_record_id,
    session_id: r.session_id,
    session_title: r.session_title,
    round_index: r.round_index,
    created_at: r.created_at,
  }));
}

/** [10] 展开原文；expandedText 为空时 text 为 null（调用方据此决定 SSE 载荷） */
export function renderExpandedSection(expandIds, tv) {
  const expandedText = renderExpandedTurnRecords(expandIds, MEMORY_EXPAND_MAX_TOKENS);
  return {
    expandedText,
    text: expandedText ? `<expanded_dialogues>\n${tv(expandedText)}\n</expanded_dialogues>` : null,
  };
}

/** [11] 日记注入（一次性，仅本轮生效） */
export function renderDiarySection(diaryInjection) {
  if (!diaryInjection || typeof diaryInjection !== 'string') return null;
  return `<diary>\n${diaryInjection}\n</diary>`;
}

/** [1-11] 合并为单条 system message：cached 前缀 + dynamic 后缀 */
export function composeSystemContent(cachedSystemParts, dynamicSystemParts) {
  const cachedContent = cachedSystemParts.filter(Boolean).join('\n\n');
  const dynamicContent = dynamicSystemParts.filter(Boolean).join('\n\n');
  return {
    cachedContent,
    systemContent: [cachedContent, dynamicContent].filter(Boolean).join('\n\n'),
  };
}

/** 本轮激活的非常驻条目（trigger_type !== 'always'），供 SSE 透传给前端展示 */
export function selectActivatedEntries(triggeredEntries) {
  return triggeredEntries
    .filter((e) => e.trigger_type !== 'always')
    .map((e) => ({ id: e.id, title: e.title, trigger_type: e.trigger_type }));
}

/** 开启补选项时为选项块预留 token */
export function resolveMaxTokens(baseMaxTokens, suggestionEnabled) {
  return suggestionEnabled
    ? Math.max(baseMaxTokens - SUGGESTION_TOKEN_RESERVE, 500)
    : baseMaxTokens;
}
