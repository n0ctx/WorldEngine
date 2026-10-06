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
} from '../memory/recall.js';
import { renderRecalledTurns } from '../memory/long-term-recall.js';
import { renderStoryState } from '../memory/state-memory-render.js';
import { MEMORY_EXPAND_MAX_TOKENS, SUGGESTION_TOKEN_RESERVE } from '../utils/constants.js';
import { loadBackendPrompt } from './prompt-loader.js';

/** [4.5] 标签说明：固定文本，按模式各一份，留在 cached 前缀末尾 */
export const CONTEXT_GUIDES = {
  chat: loadBackendPrompt('context-guide-chat.md'),
  writing: loadBackendPrompt('context-guide-writing.md'),
};

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

/** [8.5] 剧情摘要（已结束的事件加进行中事件的逐轮记录，见 memory/middle-summary.js#renderStorySummary）；为空时返回 null */
export function renderStorySummarySection(text, tv) {
  if (!text) return null;
  return `<story_summary>\n以下是更早的剧情：先是按事件整理的摘要，最后的【进行中的事件】逐轮列出眼下这件事已滑出原文的部分，后续接着下方原文；细节以原文为准。\n${tv(text)}\n</story_summary>`;
}

/** [7.5] 状态记忆：对话模式在 char_state 之后注入；写作模式没有单一主角色，直接注入该段 */
export function renderStoryStateSection(sessionId, opts, tv) {
  const text = renderStoryState(sessionId, opts);
  return text ? tv(text) : null;
}

/** [10] 长期召回原文；recordIds 为长期召回选中的 turn_records.id 列表 */
export function renderExpandedSection(recordIds, tv) {
  const { text: expandedText, hitIds } = renderRecalledTurns(recordIds, MEMORY_EXPAND_MAX_TOKENS);
  return {
    hitIds,
    text: expandedText ? `<expanded_dialogues>\n${tv(expandedText)}\n</expanded_dialogues>` : null,
  };
}

/** [11] 日记注入（一次性，仅本轮生效） */
export function renderDiarySection(diaryInjection) {
  if (!diaryInjection || typeof diaryInjection !== 'string') return null;
  return `<diary>\n${diaryInjection}\n</diary>`;
}

/** [13] 玩家本轮发言，用标签与前面的本轮资料、后面的后置提示词隔开 */
export function renderUserInputSection(content) {
  return `<user_input>\n${content}\n</user_input>`;
}

/** 合并为单条 system message：[1-4.5] cached 前缀 + [8.5] 剧情摘要 */
export function composeSystemContent(cachedSystemParts, summarySystemParts) {
  const cachedContent = cachedSystemParts.filter(Boolean).join('\n\n');
  const summaryContent = summarySystemParts.filter(Boolean).join('\n\n');
  return {
    cachedContent,
    systemContent: [cachedContent, summaryContent].filter(Boolean).join('\n\n'),
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
