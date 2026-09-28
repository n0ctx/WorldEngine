/**
 * 提示词组装器 — 此文件一旦完成即锁定，顺序不得修改
 *
 *   [SYSTEM MERGED: 单条 system message，前缀稳定 + 后缀动态]
 *   [1]  全局 System Prompt          ┐
 *   [2]  常驻 cached 条目（trigger_type=always 且 token=0）│ 稳定前缀
 *   [3]  玩家 System Prompt           │ （cached 部分）
 *   [4]  角色 System Prompt           ┘
 *   [5]  世界状态                    ┐
 *   [6]  玩家状态                     │
 *   [7]  角色状态                     │
 *   [7.5] 状态记忆（<story_state>）   │ 动态后缀
 *   [8]  世界 State 条目              │ （每轮变化）
 *   [8.5] 剧情摘要（中期摘要非空时）  │
 *   [10] 长期召回原文                 │
 *   [11] 日记注入                    ┘
 *
 *   [历史消息：role:user/assistant 交替]
 *   [12] 历史消息（稳定使用原始 messages 窗口）
 *
 *   [BOTTOM: 历史之后]
 *   [13+14] 后置提示词 + 当前用户消息（合并为一条 user message；后置提示词追加在用户消息之后）
 *
 *
 * 段渲染实现见 prompts/segments.js；本文件只负责「按锁定顺序调度」。
 * segments.js 内任何函数的输出字节变化都等价于修改本锁定顺序，需同步确认
 * tests/prompts/__snapshots__/assembler-golden.snap。
 *
 * 对外暴露：
 *   buildPrompt(sessionId, options?) → Promise<{ messages, temperature, maxTokens, recallHitCount }>
 *   options.onRecallEvent?: (name, payload) => void  — SSE 回调
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSessionById } from '../db/queries/sessions.js';
import { getCharacterById } from '../db/queries/characters.js';
import { getWorldById } from '../db/queries/worlds.js';
import { getMessagesBySessionId } from '../db/queries/messages.js';
import { getLatestTurnRecord } from '../db/queries/turn-records.js';
import {
  getAllWorldEntries,
} from '../db/queries/prompt-entries.js';
import { getConfig } from '../services/config.js';
import { matchEntries } from './entry-matcher.js';
import { renderCharacterState } from '../memory/recall.js';
import { recallTurns } from '../memory/long-term-recall.js';
import { listCurrentEntities } from '../db/queries/state-memory.js';

import { getOrCreatePersona } from '../services/personas.js';
import { applyRules } from '../utils/regex-runner.js';
import { applyTemplateVars } from '../utils/template-vars.js';
import { createLogger } from '../utils/logger.js';
import { loadBackendPrompt } from './prompt-loader.js';
import { splitRounds, roundTokens } from '../utils/session-rounds.js';
import {
  composeSystemContent,
  renderCachedEntriesSection,
  renderDiarySection,
  renderExpandedSection,
  renderStorySummarySection,
  renderStoryStateSection,
  renderTriggeredEntriesSection,
  renderUserInfoSection,
  renderUserStateSection,
  renderWorldStateSection,
  resolveMaxTokens,
  selectActivatedEntries,
  selectDynamicWorldEntries,
  sortTriggeredEntries,
} from './segments.js';

const log = createLogger('assembler', 'magenta');
const SUGGESTION_PROMPT = loadBackendPrompt('shared-suggestion.md');

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

/** 对话模式的主角色在状态记忆里对应的实体 id；不存在则返回 null（供 [7.5] story_state 判定主角色视角） */
function resolveMainCharacterEntityId(sessionId, characterId) {
  const match = listCurrentEntities(sessionId).find(
    (e) => e.type === 'character' && e.status === 'active' && e.card_id === characterId,
  );
  return match ? match.entity_id : null;
}

// keepLatestUser：续写模式不摘除最后一条 user。普通生成时最后一条 user 是"本轮新输入"，
// 由 getCurrentUserMessage 单独重贴到末尾，故历史里要先摘掉它；续写没有新输入，最后一条是
// assistant，强行摘除其前的 user 会破坏轮次交替并让待续写 assistant 错位，故保留全窗口原序。
//
// 短期窗口边界由中期覆盖范围决定：
// - coveredTo 有值：严格保留 round_index > coveredTo 的完整轮次，窗口大小随会话推进自然
//   收窄/扩张，不在这里重算「滑出」（滑出计算在轮后任务里做）。
// - coveredTo 缺失（旧会话过渡期：会话尚无 turn record，或最新记录的 middle_covered_to
//   为 null）：从最新往最旧取完整轮次，累计 token 不超过 budget，但至少保留最近一个完整
//   轮次；更早的轮次本轮不进短期窗口。
function sliceHistoryAfterRound(messages, coveredTo, { keepLatestUser = false, budget = Infinity } = {}) {
  const history = keepLatestUser ? messages : omitLatestUserMessage(messages);
  const rounds = splitRounds(history);
  if (rounds.length === 0) return history;

  if (Number.isInteger(coveredTo)) {
    return rounds.filter((round) => round.roundIndex > coveredTo).flatMap((round) => round.messages);
  }

  const keptRounds = [];
  let usedTokens = 0;
  for (let i = rounds.length - 1; i >= 0; i--) {
    const tokens = roundTokens(rounds[i]);
    if (keptRounds.length > 0 && usedTokens + tokens > budget) break;
    keptRounds.unshift(rounds[i]);
    usedTokens += tokens;
  }
  return keptRounds.flatMap((round) => round.messages);
}

export const __testables = {
  readAttachmentAsDataUrl,
  formatMessageForLLM,
  omitLatestUserMessage,
  getCurrentUserMessage,
  sliceHistoryAfterRound,
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
function pushSharedStateSections(worldId, sessionId, tv, dynamicSystemParts) {
  const worldStateSection = renderWorldStateSection(worldId, sessionId, tv);
  if (worldStateSection) dynamicSystemParts.push(worldStateSection);
  const personaStateSection = renderUserStateSection(worldId, sessionId, tv);
  if (personaStateSection) dynamicSystemParts.push(personaStateSection);
}

/** [8] 匹配动态条目并注入触发的条目，返回按注入顺序排好的触发条目 */
async function pushTriggeredEntries(sessionId, worldId, allWorldEntries, tv, dynamicSystemParts) {
  const worldEntries = selectDynamicWorldEntries(allWorldEntries);
  const triggeredIds = await matchEntries(sessionId, worldEntries, worldId);
  log.debug(`│  [8] entries  world=${worldEntries.length}  triggered=${triggeredIds.size}/${worldEntries.length}`);
  const triggeredEntries = sortTriggeredEntries(worldEntries, triggeredIds);
  const entriesSection = renderTriggeredEntriesSection(triggeredEntries, tv);
  if (entriesSection) dynamicSystemParts.push(entriesSection);
  return triggeredEntries;
}

/** [8] 触发条目 → [8.5] 剧情摘要（中期摘要），chat / writing 共用这一段 */
async function pushEntriesAndMemorySections(sessionId, worldId, allWorldEntries, storySummary, tv, dynamicSystemParts) {
  const triggeredEntries = await pushTriggeredEntries(sessionId, worldId, allWorldEntries, tv, dynamicSystemParts);

  const storySummarySection = renderStorySummarySection(storySummary, tv);
  if (storySummarySection) {
    dynamicSystemParts.push(storySummarySection);
    log.debug(`│  [8.5] story summary injected  chars=${storySummary.length}`);
  }

  return triggeredEntries;
}

/**
 * [10] 渲染长期召回选中的原文并通知前端召回结束。
 * recall 为 recallTurns() 的结果（chat、writing 均直接 await 得到）。
 * 返回本轮实际注入原文的轮数（SSE `hit` 字段，也是外部返回的 recallHitCount）。
 */
function renderLongTermRecallSection(recall, tv, dynamicSystemParts, onRecallEvent) {
  const { recordIds, candidateCount, skippedBeforeRound } = recall;
  const expanded = renderExpandedSection(recordIds, tv);
  if (expanded.text) {
    dynamicSystemParts.push(expanded.text);
    log.debug(`│  [10] recall  hits=${expanded.hitIds.length}/${candidateCount}`);
  }
  onRecallEvent?.('memory_recall_done', { hit: expanded.hitIds.length, candidates: candidateCount, skippedBeforeRound });
  return expanded.hitIds.length;
}

/** [13+14] 当前用户消息 + 后置提示词合并为一条 user message；没有当前用户消息时单独发后置提示词 */
function pushCurrentUserTurn(messages, uncompressedMessages, postParts, worldId, mode) {
  const currentUserMsg = getCurrentUserMessage(uncompressedMessages);
  if (currentUserMsg?.role === 'user') {
    const content = applyRules(currentUserMsg.content, 'prompt_only', worldId, mode);
    const formatted = formatMessageForLLM({ ...currentUserMsg, content });
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

async function buildChatSystemPrompt(sessionId, character, world, config, options) {
  const { diaryInjection, onRecallEvent, continuation, coveredTo, storySummary, uncompressedMessages } = options;
  const persona = getOrCreatePersona(world.id);
  const personaName = persona?.name || '';
  const personaPrompt = persona?.system_prompt || '';
  const ctx = { user: personaName, char: character.name, world: world.name };
  const tv = (text) => applyTemplateVars(text, ctx);
  const cachedSystemParts = [];
  const dynamicSystemParts = [];
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

  // ─── DYNAMIC LAYER (5-11) ───
  // [5] 世界状态 / [6] 玩家状态
  pushSharedStateSections(world.id, sessionId, tv, dynamicSystemParts);

  // [7] 角色状态
  const characterStateText = renderCharacterState(character.id, sessionId);
  if (characterStateText) dynamicSystemParts.push(`<char_state>\n${tv(characterStateText)}\n</char_state>`);

  // [7.5] 状态记忆（相关实体的既定设定与现状）
  const { userMessage, lastAssistant } = resolveRecentTurnContext(uncompressedMessages);
  const storyStateSection = renderStoryStateSection(sessionId, {
    worldId: world.id,
    mainCharacterEntityId: resolveMainCharacterEntityId(sessionId, character.id),
    userMessage,
    lastAssistant,
    budget: config.state_injection_token_budget,
  }, tv);
  if (storyStateSection) dynamicSystemParts.push(storyStateSection);

  // [8] 世界 State 条目（常驻 / 关键词 / AI 召回；token=0 的常驻条目已进 cached layer）
  // [8.5] 剧情摘要
  const triggeredEntries = await pushEntriesAndMemorySections(
    sessionId, world.id, allWorldEntries, storySummary, tv, dynamicSystemParts,
  );

  // [10] 长期召回（AI 从历史轮次目录里挑选需要回看原文的轮次）
  const recall = await recallTurns({ sessionId, coveredTo, mode: 'chat' });
  const recallHitCount = renderLongTermRecallSection(recall, tv, dynamicSystemParts, onRecallEvent);

  // [11] 日记注入（一次性，仅本轮生效）
  const diarySection = renderDiarySection(diaryInjection);
  if (diarySection) {
    dynamicSystemParts.push(diarySection);
    log.debug('│  [11] diary injection applied');
  }

  const { cachedContent, systemContent } = composeSystemContent(cachedSystemParts, dynamicSystemParts);
  // 本轮激活的非常驻条目（trigger_type !== 'always'），供 SSE 透传给前端展示
  const activatedEntries = selectActivatedEntries(triggeredEntries);
  const suggestionText = config.suggestion_enabled ? tv(SUGGESTION_PROMPT) : null;
  const postParts = continuation ? [] : [config.global_post_prompt, character.post_prompt].filter(Boolean).map(tv);
  if (!continuation && !character.post_prompt) {
    postParts.push(tv('（你正在扮演{{char}}，请严格保持角色名字和设定。）'));
  }
  if (!continuation && config.suggestion_enabled) postParts.push(tv(SUGGESTION_PROMPT));
  return { cachedContent, systemContent, recallHitCount, activatedEntries, suggestionText, postParts };
}

/**
 * 构建发送给 LLM 的完整 messages 数组
 *
 * 新的 prompt 组装顺序（为支持 Prompt Cache 分层）：
 *   Cached system [1, 2, 3, 4]：全局 + 常驻 cached 条目 + 玩家 + 角色
 *   Dynamic system [5-11]：世界状态 + 玩家状态 + 角色状态 + 状态记忆（story_state）+ State 条目 + 剧情摘要 + 长期召回原文 + 日记
 *   History [12]：历史 user/assistant 交替
 *   Bottom: [13] 后置提示词（system）→ [14] 当前用户消息（尾部 user）
 *
 * @param {string} sessionId
 * @param {object} [options]
 * @param {Function} [options.onRecallEvent]  (name: string, payload: object) => void
 * @returns {Promise<{ messages: Array, temperature: number, maxTokens: number, recallHitCount: number }>}
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
  const latestRecord = getLatestTurnRecord(sessionId);
  const coveredTo = latestRecord?.middle_covered_to ?? null;
  const storySummary = latestRecord?.middle_summary ?? '';
  const uncompressedMessages = getMessagesBySessionId(sessionId, null, 0);

  const { cachedContent, systemContent, recallHitCount, activatedEntries, suggestionText, postParts } = await buildChatSystemPrompt(
    sessionId, character, world, config, { ...options, coveredTo, storySummary, uncompressedMessages },
  );

  // ─── CONSTRUCT MESSAGES ───
  const messages = [];

  // [1-11] 合并为单条 system message：cached 前缀 + dynamic 后缀
  if (systemContent) messages.push({ role: 'system', content: systemContent });

  // [12] 历史消息：短期窗口边界由中期覆盖范围决定。
  const shortTermBudget = config.short_term_token_budget ?? 8000;
  const history = sliceHistoryAfterRound(uncompressedMessages, coveredTo, { keepLatestUser: continuation, budget: shortTermBudget });
  // 历史里不回灌旧的 <next_prompt> 选项块：它们会变成同格式的 few-shot 示范，
  // 把新一轮选项拽回"延续上文"的老路，且新选项存回历史后自我强化。
  for (const msg of history) {
    const content = applyRules(msg.content, 'prompt_only', world.id, 'chat');
    messages.push(formatMessageForLLM({ ...msg, content }));
  }
  log.debug(`│  [12] history  raw_messages=${history.length}`);

  // [13+14] 后置提示词 + 当前用户消息：合并为一条 user message，后置提示词追加在用户消息之后。
  // 续写模式无"本轮新输入"，且后置提示词/suggestion 由 buildContinuationMessages 在续写指令里统一拼一次，
  // 这里整体跳过，避免重复注入与轮次错乱（prompt 自然以待续写的 assistant 收尾）。
  if (!continuation) {
    pushCurrentUserTurn(messages, uncompressedMessages, postParts, world.id, 'chat');
  }

  const temperature = world.temperature ?? config.llm.temperature;
  const baseMaxTokens = world.max_tokens ?? config.llm.max_tokens;
  const maxTokens = resolveMaxTokens(baseMaxTokens, config.suggestion_enabled);


  log.info(`└─ buildPrompt DONE  session=${sid}  msgs=${messages.length}  cached=${fmtK(cachedContent.length)}  +${Date.now() - t0}ms  temp=${temperature}  max=${maxTokens}`);
  return { messages, temperature, maxTokens, recallHitCount, cacheableSystem: cachedContent, suggestionText, activatedEntries };
}

async function buildWritingCoreSystemParts(sessionId, world, writing, persona, options) {
  const { skipWritingInstructions, storySummary, uncompressedMessages, stateInjectionBudget } = options;
  const personaName = persona?.name || '';
  const personaPrompt = persona?.system_prompt || '';
  const tv = writingTemplateVars(world, persona);
  const cachedSystemParts = [];
  const dynamicSystemParts = [];
  // ─── CACHED LAYER (1, 2, 3) ───
  // [1] 全局 System Prompt（使用写作专属配置；impersonate 时跳过）
  if (writing.global_system_prompt && !skipWritingInstructions) {
    cachedSystemParts.push(tv(writing.global_system_prompt));
  }

  // [2] 常驻 cached 条目（trigger_type=always 且 token=0）
  // 写作模式下 cached layer 含 [1][2][3]，cached 条目拼到其后；按 sort_order ASC, created_at ASC 稳定。
  // [3] 玩家 System Prompt（写作模式下仅作背景参考，不是 AI 身份设定）
  const allWorldEntries = pushCachedEntriesAndUserInfo(world.id, personaName, personaPrompt, tv, cachedSystemParts);

  // ─── DYNAMIC LAYER (5-11；写作模式下 [4] 角色 system prompt 不注入) ───
  // [5] 世界状态 / [6] 玩家状态
  pushSharedStateSections(world.id, sessionId, tv, dynamicSystemParts);

  // [7] 状态记忆（写作模式下没有单一主角色，mainCharacterEntityId 传 null）
  const { userMessage, lastAssistant } = resolveRecentTurnContext(uncompressedMessages);
  const storyStateSection = renderStoryStateSection(sessionId, {
    worldId: world.id,
    mainCharacterEntityId: null,
    userMessage,
    lastAssistant,
    budget: stateInjectionBudget,
  }, tv);
  if (storyStateSection) {
    dynamicSystemParts.push(storyStateSection);
    dynamicSystemParts.push(tv('叙述中若涉及以上人物，必须沿用其既定名字，不要另起新名。'));
  }

  // [8] 世界 State 条目（常驻 / 关键词 / AI 召回；token=0 的常驻条目已进 cached layer）
  // [8.5] 剧情摘要
  const triggeredEntries = await pushEntriesAndMemorySections(
    sessionId, world.id, allWorldEntries, storySummary, tv, dynamicSystemParts,
  );

  const activatedEntries = selectActivatedEntries(triggeredEntries);
  const suggestionText = writing.suggestion_enabled ? tv(SUGGESTION_PROMPT) : null;
  return { cachedSystemParts, dynamicSystemParts, activatedEntries, suggestionText };
}

async function buildWritingMemorySections(sessionId, world, persona, options) {
  const { diaryInjection, onRecallEvent, coveredTo } = options;
  const tv = writingTemplateVars(world, persona);
  const dynamicSections = [];
  // [10] 长期召回
  const recall = await recallTurns({ sessionId, coveredTo, mode: 'writing' });
  const recallHitCount = renderLongTermRecallSection(recall, tv, dynamicSections, onRecallEvent);

  // [11] 日记注入（一次性，仅本轮生效）
  const diarySection = renderDiarySection(diaryInjection);
  if (diarySection) {
    dynamicSections.push(diarySection);
    log.debug('│  [11] diary injection applied (writing)');
  }
  return { dynamicSections, recallHitCount };
}

async function buildWritingSystemPrompt(sessionId, world, writing, persona, options) {
  const core = await buildWritingCoreSystemParts(sessionId, world, writing, persona, options);
  const { dynamicSections, recallHitCount } = await buildWritingMemorySections(sessionId, world, persona, {
    diaryInjection: options.diaryInjection,
    onRecallEvent: options.onRecallEvent,
    coveredTo: options.coveredTo,
  });
  const dynamicSystemParts = core.dynamicSystemParts.concat(dynamicSections);
  const { cachedContent, systemContent } = composeSystemContent(core.cachedSystemParts, dynamicSystemParts);
  return {
    cachedContent,
    systemContent,
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
 * Cached layer: [1] 全局、[2] 常驻 cached 条目、[3] 玩家
 * Dynamic layer: [5] 世界状态 / [6] 玩家状态 / [7] 状态记忆（story_state）
 *                / [8] 世界条目 / [8.5] 剧情摘要
 *                / [10] 长期召回原文 / [11] 日记
 * Bottom: [12] 历史消息，[13+14] 后置提示词 + 当前消息（合并为一条 user message）
 *
 * @param {string} sessionId
 * @param {object} [options]
 * @param {Function} [options.onRecallEvent]  (name: string, payload: object) => void
 * @returns {Promise<{ messages: Array, temperature: number, maxTokens: number, model: string|null, recallHitCount: number }>}
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

  const latestRecord = getLatestTurnRecord(sessionId);
  const coveredTo = latestRecord?.middle_covered_to ?? null;
  const storySummary = latestRecord?.middle_summary ?? '';
  const uncompressedMessages = getMessagesBySessionId(sessionId, null, 0);

  log.info(`┌─ buildWritingPrompt  session=${sid}  world="${world.name}"`);

  const { cachedContent, systemContent, recallHitCount, activatedEntries, suggestionText } = await buildWritingSystemPrompt(
    sessionId, world, writing, persona,
    { ...options, coveredTo, storySummary, uncompressedMessages, stateInjectionBudget: config.state_injection_token_budget },
  );

  // ─── CONSTRUCT MESSAGES ───
  const messages = [];

  // [1-11] 合并为单条 system message：cached 前缀 + dynamic 后缀
  if (systemContent) messages.push({ role: 'system', content: systemContent });

  // [12] 历史消息：短期窗口边界由中期覆盖范围决定；turn records 仅用于摘要/时间线。
  const shortTermBudget = writing.short_term_token_budget ?? config.short_term_token_budget ?? 8000;
  const history = sliceHistoryAfterRound(
    uncompressedMessages,
    coveredTo,
    { keepLatestUser: continuation, budget: shortTermBudget },
  );
  // 同 chat 版：历史里不回灌旧的 <next_prompt> 选项块，避免变成延续型选项的 few-shot 示范。
  for (const msg of history) {
    const content = applyRules(msg.content, 'prompt_only', world.id, 'writing');
    messages.push(formatMessageForLLM({ ...msg, content }));
  }

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
      if (writing.suggestion_enabled) postParts.push(tv(SUGGESTION_PROMPT));
    }

    pushCurrentUserTurn(messages, uncompressedMessages, postParts, world.id, 'writing');
  }

  const temperature = world.temperature ?? writing.temperature ?? config.llm.temperature;
  const baseMaxTokens = world.max_tokens ?? writing.max_tokens ?? config.llm.max_tokens;
  const maxTokens = resolveMaxTokens(baseMaxTokens, writing.suggestion_enabled);
  const model = writing.model || null;

  log.info(`└─ buildWritingPrompt DONE  session=${sid}  msgs=${messages.length}  cached=${fmtK(cachedContent.length)}  +${Date.now() - t0}ms  temp=${temperature}  max=${maxTokens}`);
  return { messages, temperature, maxTokens, model, recallHitCount, cacheableSystem: cachedContent, suggestionText, activatedEntries };
}
