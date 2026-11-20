/**
 * 提示词组装器 — 顺序同时服务 prompt cache 前缀复用与指令遵循，不得随意调整
 *
 *   [SYSTEM: 单条 system message]
 *   [1]  全局 System Prompt          ┐
 *   [2]  常驻 cached 条目（trigger_type=always 且 token=0）│ 稳定前缀
 *   [3]  玩家 System Prompt           │ （cacheableSystem）
 *   [4]  角色 System Prompt           │
 *   [4.5] 标签说明（context-guide-*.md）┘
 *   [8.5] 剧情摘要（在用的压缩块；只在压缩、块失效或兜底移出时变化）
 *
 *   [12] 历史消息（role:user/assistant 交替，没被压缩的原文轮次）
 *
 *   [本轮 user message：每轮变化的上下文 + 用户消息 + 后置提示词]
 *   [8]  世界 State 条目              ┐
 *   [10] 长期召回原文                 │ 参考资料
 *   [11] 日记注入                    ┘
 *   [5]  世界状态                    ┐
 *   [6]  玩家状态                     │ 当前状态（紧贴玩家发言）
 *   [7]  角色状态                     │
 *   [7.5] 状态记忆（<story_state>）   ┘
 *   [13] 当前用户消息（<user_input>）
 *   [14] 后置提示词
 *
 * 每轮变化的内容全部放在历史之后，「system + 历史」整段可跨轮复用 prompt cache；
 * 本轮内越权威、越新的内容越靠近玩家发言，资料、发言、指令三段由标签隔开。
 * 续写模式没有本轮新输入，本轮上下文加在被续写那轮的 user 消息开头。
 *
 * 段渲染实现见 prompts/segments.js；本文件只负责「按上述顺序调度」。
 * segments.js 内任何函数的输出字节变化都等价于修改本顺序，需同步确认
 * tests/prompts/__snapshots__/assembler-golden.snap。
 *
 * 对外暴露：
 *   buildPrompt(sessionId, options?) → Promise<{ messages, temperature, maxTokens, recallHitCount, turnContext, ... }>
 *   options.onRecallEvent?: (name, payload) => void  — SSE 回调
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSessionById } from '../db/queries/sessions.js';
import { getCharacterById } from '../db/queries/characters.js';
import { getWorldById } from '../db/queries/worlds.js';
import {
  getAllWorldEntries,
} from '../db/queries/prompt-entries.js';
import { getConfig } from '../services/config.js';
import { matchEntries } from './entry-matcher.js';
import { renderCharacterState } from '../memory/recall.js';
import { recallTurns } from '../memory/long-term-recall.js';
import { loadHistoryBase, recordPromptUsage, visibleHistory } from '../memory/context/assembly.js';
import { resolveContextLimit } from '../services/model-context-limit.js';
import { enforcePromptBudget } from '../utils/prompt-budget.js';

import { getOrCreatePersona } from '../services/personas.js';
import { applyRules } from '../utils/regex-runner.js';
import { applyTemplateVars } from '../utils/template-vars.js';
import { createLogger } from '../utils/logger.js';
import { loadBackendPrompt } from './prompt-loader.js';
import { parseSamplingOverrides } from '../utils/constants.js';
import {
  CONTEXT_GUIDES,
  composeSystemContent,
  renderCachedEntriesSection,
  renderDiarySection,
  renderExpandedSection,
  renderStorySummarySection,
  renderStoryStateSection,
  renderTriggeredEntriesSection,
  renderUserInfoSection,
  renderUserInputSection,
  renderUserStateSection,
  renderWorldStateSection,
  resolveMaxTokens,
  selectActivatedEntries,
  selectDynamicWorldEntries,
  sortTriggeredEntries,
} from './segments.js';

const log = createLogger('assembler', 'magenta');
const CHAT_SUGGESTION_PROMPT = loadBackendPrompt('chat-suggestion.md');
const WRITING_SUGGESTION_PROMPT = loadBackendPrompt('writing-suggestion.md');

/** 将字符数格式化为可读单位，如 3241 → '3.2k' */
function fmtK(n) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`; }

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = process.env.WE_UPLOADS_DIR
  ? path.resolve(process.env.WE_UPLOADS_DIR)
  : path.resolve(__dirname, '..', '..', 'data', 'uploads');

// ─── 附件读取 ─────────────────────────────────────────────────────

const MIME_MAP = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', pdf: 'application/pdf',
};

function readAttachmentAsDataUrl(relativePath) {
  const absPath = path.resolve(UPLOADS_DIR, relativePath);
  if (!fs.existsSync(absPath)) return null;
  const buf = fs.readFileSync(absPath);
  const ext = path.extname(absPath).slice(1).toLowerCase();
  const mime = MIME_MAP[ext] || 'application/octet-stream';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/**
 * 将 DB 消息行转换为 LLM messages 数组格式。
 * 含附件的消息 content 转换为 vision 数组格式。
 */
function formatMessageForLLM(msg) {
  if (!msg.attachments || msg.attachments.length === 0) {
    return { role: msg.role, content: msg.content };
  }
  const contentParts = [{ type: 'text', text: msg.content }];
  for (const relPath of msg.attachments) {
    const dataUrl = readAttachmentAsDataUrl(relPath);
    if (dataUrl) {
      contentParts.push({ type: 'image_url', image_url: { url: dataUrl } });
    }
  }
  return { role: msg.role, content: contentParts };
}

function omitLatestUserMessage(history) {
  const lastUserIndex = history.findLastIndex((msg) => msg.role === 'user');
  if (lastUserIndex === -1) return history;
  return history.filter((_, index) => index !== lastUserIndex);
}

function getCurrentUserMessage(messages) {
  const lastUserIndex = messages.findLastIndex((msg) => msg.role === 'user');
  return lastUserIndex === -1 ? null : messages[lastUserIndex];
}

/** [7.5] story_state 判定视角所需的最近一轮上下文：本轮用户消息 + 历史中最后一条 assistant 消息 */
function resolveRecentTurnContext(uncompressedMessages) {
  return {
    userMessage: getCurrentUserMessage(uncompressedMessages)?.content ?? '',
    lastAssistant: uncompressedMessages.findLast((msg) => msg.role === 'assistant')?.content ?? '',
  };
}

export const __testables = {
  readAttachmentAsDataUrl,
  formatMessageForLLM,
  omitLatestUserMessage,
  getCurrentUserMessage,
};

// ─── 核心函数 ─────────────────────────────────────────────────────

/** 写作模式没有单一角色，保留 {{char}} 交由上下文判断，避免统一替换成“叙述者”。 */
function writingTemplateVars(world, persona) {
  return (text) => applyTemplateVars(text, { user: persona?.name || '', char: null, world: world.name });
}

/** [2] 常驻 cached 条目 + [3] 玩家 System Prompt 追加到 cached 层；返回本世界启用的条目供 [8] 复用 */
function pushCachedEntriesAndUserInfo(worldId, personaName, personaPrompt, tv, cachedSystemParts) {
  const allWorldEntries = getAllWorldEntries(worldId).filter((e) => e.enabled !== 0);
  const cachedEntries = renderCachedEntriesSection(allWorldEntries, tv);
  if (cachedEntries.text) {
    cachedSystemParts.push(cachedEntries.text);
    log.debug(`│  [2] cached entries  count=${cachedEntries.count}`);
  }
  const userInfoSection = renderUserInfoSection(personaName, personaPrompt, tv);
  if (userInfoSection) cachedSystemParts.push(userInfoSection);
  return allWorldEntries;
}

/** [5] 世界状态 + [6] 玩家状态 */
function pushSharedStateSections(worldId, sessionId, tv, turnContextParts) {
  const worldStateSection = renderWorldStateSection(worldId, sessionId, tv);
  if (worldStateSection) turnContextParts.push(worldStateSection);
  const personaStateSection = renderUserStateSection(worldId, sessionId, tv);
  if (personaStateSection) turnContextParts.push(personaStateSection);
}

/** [8] 匹配动态条目并注入触发的条目，返回按注入顺序排好的触发条目 */
async function pushTriggeredEntries(sessionId, worldId, allWorldEntries, tv, turnContextParts) {
  const worldEntries = selectDynamicWorldEntries(allWorldEntries);
  const triggeredIds = await matchEntries(sessionId, worldEntries, worldId);
  log.debug(`│  [8] entries  world=${worldEntries.length}  triggered=${triggeredIds.size}/${worldEntries.length}`);
  const triggeredEntries = sortTriggeredEntries(worldEntries, triggeredIds);
  const entriesSection = renderTriggeredEntriesSection(triggeredEntries, tv);
  if (entriesSection) turnContextParts.push(entriesSection);
  return triggeredEntries;
}

/** [8.5] 剧情摘要：只在短期窗口滑动时变化，放 system 尾部，与历史一起留在可复用前缀里 */
function buildSummarySystemParts(storySummary, tv) {
  const storySummarySection = renderStorySummarySection(storySummary, tv);
  if (!storySummarySection) return [];
  log.debug(`│  [8.5] story summary injected  chars=${storySummary.length}`);
  return [storySummarySection];
}

/**
 * [10] 长期召回：从不在历史里的轮次挑选并渲染原文，通知前端召回结束。
 * 返回本轮实际注入原文的轮数（SSE `hit` 字段，也是外部返回的 recallHitCount）。
 */
async function pushLongTermRecall(sessionId, mode, recallScope, tv, turnContextParts, onRecallEvent) {
  const { rounds, candidateCount, droppedCount } = await recallTurns({ sessionId, mode, scope: recallScope });
  const expanded = renderExpandedSection(rounds, recallScope.units, tv);
  if (expanded.text) {
    turnContextParts.push(expanded.text);
    log.debug(`│  [10] recall  hits=${expanded.hitRounds.length}/${candidateCount}`);
  }
  onRecallEvent?.('memory_recall_done', { hit: expanded.hitRounds.length, candidates: candidateCount, dropped: droppedCount });
  return expanded.hitRounds.length;
}

/** 历史选项是本轮参考资料，不是 assistant 回复示例。 */
function renderPastOptions(msg, allMessages, { worldId, mode }) {
  const next = allMessages[allMessages.indexOf(msg) + 1];
  // 玩家点选项时原文发出，与某条选项完全一致就算选了那条
  const chosen = next?.role === 'user' ? next.content.trim() : null;
  const lines = chosen === null
    ? msg.next_options
    : msg.next_options.map((option) => `${option === chosen ? '（已选）' : '（未选）'}${option}`);
  const optionsText = applyRules(lines.join('\n'), 'prompt_only', worldId, mode);
  return `<past_options>\n${optionsText}\n</past_options>`;
}

function recentPastOptions(history, allMessages, ctx, continuation) {
  if (!ctx.withOptions) return '';
  const earlier = continuation ? history.slice(0, -1) : history;
  return earlier.filter((msg) => msg.role === 'assistant' && msg.next_options?.length)
    .slice(-3)
    .map((msg) => renderPastOptions(msg, allMessages, ctx))
    .join('\n\n');
}

/**
 * [SYSTEM] 单条 system message，后接 [12] 历史：没被压缩块覆盖、也没被兜底移出的原文轮次。
 * 续写模式不摘除最后一条 user：普通生成时最后一条 user 是"本轮新输入"，由 getCurrentUserMessage 单独重贴到末尾，
 * 故历史里要先摘掉它；续写没有新输入，最后一条是 assistant，强行摘除其前的 user 会破坏轮次交替并让待续写 assistant 错位。
 */
function buildBaseMessages(systemContent, uncompressedMessages, visibleRounds, historyCtx, continuation) {
  const messages = [];
  if (systemContent) messages.push({ role: 'system', content: systemContent });
  const history = visibleHistory(continuation ? uncompressedMessages : omitLatestUserMessage(uncompressedMessages), visibleRounds);
  const { worldId, mode } = historyCtx;
  for (const msg of history) {
    const content = applyRules(msg.content, 'prompt_only', worldId, mode);
    messages.push(formatMessageForLLM({ ...msg, content }));
  }
  return { messages, history, pastOptions: recentPastOptions(history, uncompressedMessages, historyCtx, continuation) };
}

/** [13+14] 当前用户消息 + 后置提示词合并为一条 user message；没有当前用户消息时单独发后置提示词 */
function pushCurrentUserTurn(messages, uncompressedMessages, postParts, ctx) {
  const currentUserMsg = getCurrentUserMessage(uncompressedMessages);
  if (currentUserMsg?.role === 'user') {
    const text = applyRules(currentUserMsg.content, 'prompt_only', ctx.worldId, ctx.mode);
    const formatted = formatMessageForLLM({ ...currentUserMsg, content: text ? renderUserInputSection(text) : text });
    if (postParts.length > 0) {
      const postContent = postParts.join('\n\n');
      if (Array.isArray(formatted.content)) {
        formatted.content.push({ type: 'text', text: postContent });
      } else {
        formatted.content = [formatted.content, postContent].filter(Boolean).join('\n\n');
      }
    }
    messages.push(formatted);
  } else if (postParts.length > 0) {
    messages.push({ role: 'user', content: postParts.join('\n\n') });
  }
}

/**
 * [5-11] 本轮上下文加在最后一条 user 消息开头：普通生成时是本轮用户消息，续写时是被续写那轮的 user。
 * 没有任何 user 消息时紧跟 system 单独成条。
 */
function budgetTurn(messages, { turnContext, cachedContent, maxTokens, contextLimit, mode }) {
  const base = messages.map((msg) => ({ ...msg, content: Array.isArray(msg.content) ? [...msg.content] : msg.content }));
  prependTurnContext(messages, turnContext);
  return enforcePromptBudget(messages, { contextLimit, maxTokens, mode, withoutOptional: () => {
    if (base[0]?.role === 'system') {
      if (cachedContent) base[0].content = cachedContent;
      else base.shift();
    }
    return base;
  } });
}

function prependTurnContext(messages, turnContext) {
  if (!turnContext) return;
  const target = messages.findLast((msg) => msg.role === 'user');
  if (!target) {
    messages.splice(messages[0]?.role === 'system' ? 1 : 0, 0, { role: 'user', content: turnContext });
    return;
  }
  if (Array.isArray(target.content)) {
    target.content.unshift({ type: 'text', text: turnContext });
  } else {
    target.content = [turnContext, target.content].filter(Boolean).join('\n\n');
  }
}

async function buildChatSystemPrompt(sessionId, character, world, config, options) {
  const { diaryInjection, onRecallEvent, continuation, recallScope, storySummary, uncompressedMessages } = options;
  const persona = getOrCreatePersona(world.id);
  const personaName = persona?.name || '';
  const personaPrompt = persona?.system_prompt || '';
  const ctx = { user: personaName, char: character.name, world: world.name };
  const tv = (text) => applyTemplateVars(text, ctx);
  const cachedSystemParts = [];
  // 本轮上下文分两组：参考资料（条目/召回/日记）在前，当前状态在后、紧贴玩家发言
  const materialParts = [];
  const stateParts = [];
  // ─── CACHED LAYER (1, 2, 3, 4) ───
  // [1] 全局 System Prompt
  if (config.global_system_prompt) {
    cachedSystemParts.push(tv(config.global_system_prompt));
  }

  // [2] 常驻 cached 条目（trigger_type=always 且 token=0）
  // 拼到 cachedSystemParts 末尾，按 sort_order ASC, created_at ASC 稳定排序，保证 prompt cache 命中。
  // [3] 玩家 System Prompt
  const allWorldEntries = pushCachedEntriesAndUserInfo(world.id, personaName, personaPrompt, tv, cachedSystemParts);

  // [4] 角色 System Prompt
  if (character.system_prompt) {
    cachedSystemParts.push(tv(`<char_info>\n${character.system_prompt}\n</char_info>`));
  }

  // [4.5] 标签说明
  cachedSystemParts.push(CONTEXT_GUIDES.chat);

  // ─── TURN CONTEXT (5-11，放进本轮 user 消息) ───
  // [5] 世界状态 / [6] 玩家状态
  pushSharedStateSections(world.id, sessionId, tv, stateParts);

  // [7] 角色状态
  const characterStateText = renderCharacterState(character.id, sessionId);
  if (characterStateText) stateParts.push(`<char_state>\n${tv(characterStateText)}\n</char_state>`);

  // [7.5] 状态记忆（相关实体的既定设定与现状）
  const { userMessage, lastAssistant } = resolveRecentTurnContext(uncompressedMessages);
  const storyStateSection = renderStoryStateSection(sessionId, {
    worldId: world.id,
    userMessage,
    lastAssistant,
    budget: config.state_injection_token_budget,
  }, tv);
  if (storyStateSection) stateParts.push(storyStateSection);

  // [8] 世界 State 条目（常驻 / 关键词 / AI 召回；token=0 的常驻条目已进 cached layer）
  const triggeredEntries = await pushTriggeredEntries(sessionId, world.id, allWorldEntries, tv, materialParts);

  // [10] 长期召回（AI 从历史轮次目录里挑选需要回看原文的轮次）
  const recallHitCount = await pushLongTermRecall(sessionId, 'chat', recallScope, tv, materialParts, onRecallEvent);

  // [11] 日记注入（一次性，仅本轮生效）
  const diarySection = renderDiarySection(diaryInjection);
  if (diarySection) {
    materialParts.push(diarySection);
    log.debug('│  [11] diary injection applied');
  }

  // [8.5] 剧情摘要进 system 尾部
  const { cachedContent, systemContent } = composeSystemContent(cachedSystemParts, buildSummarySystemParts(storySummary, tv));
  const turnContext = [...materialParts, ...stateParts].join('\n\n');
  // 本轮激活的非常驻条目（trigger_type !== 'always'），供 SSE 透传给前端展示
  const activatedEntries = selectActivatedEntries(triggeredEntries);
  const suggestionText = config.suggestion_enabled ? tv(CHAT_SUGGESTION_PROMPT) : null;
  const postParts = continuation ? [] : [config.global_post_prompt, character.post_prompt].filter(Boolean).map(tv);
  if (!continuation && !character.post_prompt) {
    postParts.push(tv('（你正在扮演{{char}}，请严格保持角色名字和设定。）'));
  }
  if (!continuation && config.suggestion_enabled) postParts.push(tv(CHAT_SUGGESTION_PROMPT));
  return { cachedContent, systemContent, turnContext, recallHitCount, activatedEntries, suggestionText, postParts };
}

/**
 * 构建发送给 LLM 的完整 messages 数组
 *
 * 组装顺序（为跨轮复用 Prompt Cache）：
 *   System：[1-4.5] 全局 + 常驻 cached 条目 + 玩家 + 角色 + 标签说明（cacheableSystem）→ [8.5] 剧情摘要
 *   History [12]：历史 user/assistant 交替
 *   本轮 user：[8-11] State 条目 + 长期召回原文 + 日记 → [5-7.5] 世界状态 + 玩家状态 + 角色状态 + 状态记忆
 *              → [13] <user_input> 当前用户消息 → [14] 后置提示词
 *
 * @param {string} sessionId
 * @param {object} [options]
 * @param {Function} [options.onRecallEvent]  (name: string, payload: object) => void
 * @returns {Promise<{ messages: Array, temperature: number, maxTokens: number, sampling: object, recallHitCount: number, turnContext: string }>}
 */
export async function buildPrompt(sessionId, options = {}) {
  const { continuation = false } = options;
  const session = getSessionById(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  const character = getCharacterById(session.character_id);
  if (!character) throw new Error(`Character not found: ${session.character_id}`);

  const world = getWorldById(character.world_id);
  if (!world) throw new Error(`World not found: ${character.world_id}`);

  const t0  = Date.now();
  const sid = sessionId.slice(0, 8);
  log.info(`┌─ buildPrompt  session=${sid}  char="${character.name}"  world="${world.name}"`);

  const config = getConfig();
  const { promptContext, recallScope, storySummary, uncompressedMessages } = await loadHistoryBase(sessionId);

  const {
    cachedContent, systemContent, turnContext, recallHitCount, activatedEntries, suggestionText, postParts,
  } = await buildChatSystemPrompt(
    sessionId, character, world, config, { ...options, recallScope, storySummary, uncompressedMessages },
  );

  // ─── CONSTRUCT MESSAGES ───
  // [1-4] + [8.5] 合并为单条 system message，[12] 历史消息
  const historyCtx = { withOptions: !!config.suggestion_enabled, worldId: world.id, mode: 'chat' };
  const { messages, history, pastOptions } = buildBaseMessages(systemContent, uncompressedMessages, promptContext.visibleRounds, historyCtx, continuation);
  log.debug(`│  [12] history  raw_messages=${history.length}`);

  // [13+14] 后置提示词 + 当前用户消息：合并为一条 user message，后置提示词追加在用户消息之后。
  // 续写模式无"本轮新输入"，且后置提示词/suggestion 由 buildContinuationMessages 在续写指令里统一拼一次，
  // 这里整体跳过，避免重复注入与轮次错乱（prompt 自然以待续写的 assistant 收尾）。
  if (!continuation) {
    pushCurrentUserTurn(messages, uncompressedMessages, postParts, historyCtx);
  }
  const temperature = world.temperature ?? config.llm.temperature;
  const baseMaxTokens = world.max_tokens ?? config.llm.max_tokens;
  const maxTokens = resolveMaxTokens(baseMaxTokens, config.suggestion_enabled);
  const contextLimit = await resolveContextLimit('main');
  const budget = budgetTurn(messages, { turnContext: [turnContext, pastOptions].filter(Boolean).join('\n\n'), cachedContent, contextLimit, maxTokens, mode: 'chat' });
  messages.splice(0, messages.length, ...budget.messages);
  recordPromptUsage(sessionId, messages, promptContext);
  // 世界卡只覆盖设置过的采样参数，与全局设置逐项合并见 llm/index.js 的 buildLLMConfig
  const sampling = parseSamplingOverrides(world.sampling_json);

  log.info(`└─ buildPrompt DONE  session=${sid}  msgs=${messages.length}  cached=${fmtK(cachedContent.length)}  +${Date.now() - t0}ms  temp=${temperature}  max=${maxTokens}`);
  return { messages, temperature, maxTokens, sampling, recallHitCount, cacheableSystem: cachedContent, turnContext, suggestionText, activatedEntries };
}

async function buildWritingCoreSystemParts(sessionId, world, writing, persona, options) {
  const { skipWritingInstructions, storySummary, uncompressedMessages, stateInjectionBudget } = options;
  const personaName = persona?.name || '';
  const personaPrompt = persona?.system_prompt || '';
  const tv = writingTemplateVars(world, persona);
  const cachedSystemParts = [];
  const entryParts = [];
  const stateParts = [];
  // ─── CACHED LAYER (1, 2, 3) ───
  // [1] 全局 System Prompt（使用写作专属配置；impersonate 时跳过）
  if (writing.global_system_prompt && !skipWritingInstructions) {
    cachedSystemParts.push(tv(writing.global_system_prompt));
  }

  // [2] 常驻 cached 条目（trigger_type=always 且 token=0）
  // 写作模式下 cached layer 含 [1][2][3]，cached 条目拼到其后；按 sort_order ASC, created_at ASC 稳定。
  // [3] 玩家 System Prompt（写作模式下仅作背景参考，不是 AI 身份设定）
  const allWorldEntries = pushCachedEntriesAndUserInfo(world.id, personaName, personaPrompt, tv, cachedSystemParts);

  // [4.5] 标签说明
  cachedSystemParts.push(CONTEXT_GUIDES.writing);

  // ─── TURN CONTEXT (5-11，放进本轮 user 消息；写作模式下 [4] 角色 system prompt 不注入) ───
  // [5] 世界状态 / [6] 玩家状态
  pushSharedStateSections(world.id, sessionId, tv, stateParts);

  // [7] 状态记忆（沿用既定名字的要求在 context-guide-writing.md 里）
  const { userMessage, lastAssistant } = resolveRecentTurnContext(uncompressedMessages);
  const storyStateSection = renderStoryStateSection(sessionId, {
    worldId: world.id,
    userMessage,
    lastAssistant,
    budget: stateInjectionBudget,
  }, tv);
  if (storyStateSection) stateParts.push(storyStateSection);

  // [8] 世界 State 条目（常驻 / 关键词 / AI 召回；token=0 的常驻条目已进 cached layer）
  const triggeredEntries = await pushTriggeredEntries(sessionId, world.id, allWorldEntries, tv, entryParts);

  // [8.5] 剧情摘要进 system 尾部
  const summarySystemParts = buildSummarySystemParts(storySummary, tv);
  const activatedEntries = selectActivatedEntries(triggeredEntries);
  const suggestionText = writing.suggestion_enabled ? tv(WRITING_SUGGESTION_PROMPT) : null;
  return { cachedSystemParts, summarySystemParts, entryParts, stateParts, activatedEntries, suggestionText };
}

async function buildWritingMemorySections(sessionId, world, persona, options) {
  const { diaryInjection, onRecallEvent, recallScope } = options;
  const tv = writingTemplateVars(world, persona);
  const memorySections = [];
  // [10] 长期召回
  const recallHitCount = await pushLongTermRecall(sessionId, 'writing', recallScope, tv, memorySections, onRecallEvent);

  // [11] 日记注入（一次性，仅本轮生效）
  const diarySection = renderDiarySection(diaryInjection);
  if (diarySection) {
    memorySections.push(diarySection);
    log.debug('│  [11] diary injection applied (writing)');
  }
  return { memorySections, recallHitCount };
}

async function buildWritingSystemPrompt(sessionId, world, writing, persona, options) {
  const core = await buildWritingCoreSystemParts(sessionId, world, writing, persona, options);
  const { memorySections, recallHitCount } = await buildWritingMemorySections(sessionId, world, persona, {
    diaryInjection: options.diaryInjection,
    onRecallEvent: options.onRecallEvent,
    recallScope: options.recallScope,
  });
  const { cachedContent, systemContent } = composeSystemContent(core.cachedSystemParts, core.summarySystemParts);
  return {
    cachedContent,
    systemContent,
    // 参考资料（条目/召回/日记）在前，当前状态在后、紧贴玩家发言
    turnContext: [...core.entryParts, ...memorySections, ...core.stateParts].join('\n\n'),
    recallHitCount,
    activatedEntries: core.activatedEntries,
    suggestionText: core.suggestionText,
  };
}

/**
 * 写作版本：写作模式没有固定角色身份，[4] 角色 System Prompt 不注入；
 * 角色出场由叙事文本自行驱动，[7] 角色状态段由状态记忆（story_state）替代，
 * 相关实体的既定设定与现状由状态记忆模块按规则选取并渲染。
 *
 * System: [1] 全局、[2] 常驻 cached 条目、[3] 玩家、[4.5] 标签说明（cacheableSystem）→ [8.5] 剧情摘要
 * History: [12] 历史消息
 * 本轮 user: [8] 世界条目 / [10] 长期召回原文 / [11] 日记 → [5] 世界状态 / [6] 玩家状态 / [7] 状态记忆（story_state）
 *            → [13] <user_input> 当前消息 → [14] 后置提示词
 *
 * @param {string} sessionId
 * @param {object} [options]
 * @param {Function} [options.onRecallEvent]  (name: string, payload: object) => void
 * @returns {Promise<{ messages: Array, temperature: number, maxTokens: number, sampling: object, model: string|null, recallHitCount: number }>}
 */
export async function buildWritingPrompt(sessionId, options = {}) {
  const { skipWritingInstructions, continuation = false } = options;
  const session = getSessionById(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  const world = getWorldById(session.world_id);
  if (!world) throw new Error(`World not found: ${session.world_id}`);

  const config = getConfig();
  const writing = config.writing || {};
  const sid = sessionId.slice(0, 8);
  const t0 = Date.now();

  const persona = getOrCreatePersona(world.id);
  const personaName = persona?.name || '';
  const tv = writingTemplateVars(world, persona);

  const { promptContext, recallScope, storySummary, uncompressedMessages } = await loadHistoryBase(sessionId);

  log.info(`┌─ buildWritingPrompt  session=${sid}  world="${world.name}"`);

  const { cachedContent, systemContent, turnContext, recallHitCount, activatedEntries, suggestionText } = await buildWritingSystemPrompt(
    sessionId, world, writing, persona,
    { ...options, recallScope, storySummary, uncompressedMessages, stateInjectionBudget: config.state_injection_token_budget },
  );

  // ─── CONSTRUCT MESSAGES ───
  // [1-3] + [8.5] 合并为单条 system message，[12] 历史消息；代拟不带写作指令也不要选项，历史里同样不接选项
  const historyCtx = { withOptions: !!writing.suggestion_enabled && !skipWritingInstructions, worldId: world.id, mode: 'writing' };
  const { messages, pastOptions } = buildBaseMessages(systemContent, uncompressedMessages, promptContext.visibleRounds, historyCtx, continuation);

  // [13+14] 后置提示词 + 当前用户消息：合并为一条 user message，后置提示词追加在用户消息之后。
  // 续写模式无"本轮新输入"，后置提示词/suggestion 由 buildContinuationMessages 在续写指令里统一拼一次，
  // 这里整体跳过，避免重复注入与轮次错乱（prompt 自然以待续写的 assistant 收尾）。
  if (!continuation) {
    const postParts = [];
    if (!skipWritingInstructions) {
      if (writing.global_post_prompt) postParts.push(tv(writing.global_post_prompt));
      // 有玩家名时自动注入提醒，防止长对话后叙述者捏造或混淆玩家名
      if (personaName) {
        postParts.push(tv('（玩家角色名为{{user}}，请在叙述中严格使用此名字，不可捏造或替换。）'));
      }
      if (writing.suggestion_enabled) postParts.push(tv(WRITING_SUGGESTION_PROMPT));
    }

    pushCurrentUserTurn(messages, uncompressedMessages, postParts, historyCtx);
  }
  const temperature = world.temperature ?? writing.temperature ?? config.llm.temperature;
  const baseMaxTokens = world.max_tokens ?? writing.max_tokens ?? config.llm.max_tokens;
  const maxTokens = resolveMaxTokens(baseMaxTokens, writing.suggestion_enabled);
  const contextLimit = await resolveContextLimit('writing');
  const budget = budgetTurn(messages, { turnContext: [turnContext, pastOptions].filter(Boolean).join('\n\n'), cachedContent, contextLimit, maxTokens, mode: 'writing' });
  messages.splice(0, messages.length, ...budget.messages);
  recordPromptUsage(sessionId, messages, promptContext);
  const sampling = parseSamplingOverrides(world.sampling_json);
  const model = writing.model || null;

  log.info(`└─ buildWritingPrompt DONE  session=${sid}  msgs=${messages.length}  cached=${fmtK(cachedContent.length)}  +${Date.now() - t0}ms  temp=${temperature}  max=${maxTokens}`);
  return { messages, temperature, maxTokens, sampling, model, recallHitCount, cacheableSystem: cachedContent, turnContext, suggestionText, activatedEntries };
}
