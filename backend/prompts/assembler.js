/**
 * 提示词组装器 — 此文件一旦完成即锁定，顺序不得修改
 *
 *   [SYSTEM MERGED: 单条 system message，前缀稳定 + 后缀动态]
 *   [1]  全局 System Prompt          ┐
 *   [2]  玩家 System Prompt           │ 稳定前缀
 *   [3]  角色 System Prompt           │ （cached 部分）
 *   [4]  常驻 cached 条目（trigger_type=always 且 token=0）┘
 *   [5]  世界状态                    ┐
 *   [6]  玩家状态                     │
 *   [7]  角色状态                     │
 *   [8]  世界 State 条目              │ 动态后缀
 *   [8.5] 长期记忆（开关启用时）      │ （每轮变化）
 *   [9]  召回摘要                     │
 *   [10] 展开原文                     │
 *   [11] 日记注入                    ┘
 *
 *   [历史消息：role:user/assistant 交替]
 *   [12] 历史消息（稳定使用原始 messages 窗口）
 *
 *   [BOTTOM: 历史之后，当前 user 之前]
 *   [13] 后置提示词（独立 system message；全局+角色，均空跳过）
 *   [14] 当前用户消息（唯一的尾部 user 消息）
 *
 *
 * 对外暴露：
 *   buildPrompt(sessionId, options?) → Promise<{ messages, temperature, maxTokens, recallHitCount }>
 *   options.onRecallEvent?: (name, payload) => void  — SSE 回调
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSessionById } from '../db/queries/sessions.js';
import { getWritingSessionCharacters } from '../db/queries/writing-sessions.js';
import { getCharacterById } from '../db/queries/characters.js';
import { getWorldById } from '../db/queries/worlds.js';
import { getUncompressedMessagesBySessionId } from '../db/queries/messages.js';
import {
  getAllWorldEntries,
} from '../db/queries/prompt-entries.js';
import { getConfig } from '../services/config.js';
import { matchEntries } from './entry-matcher.js';
import {
  renderPersonaState,
  renderWorldState,
  renderCharacterState,
  searchRecalledSummaries,
  renderRecalledSummaries,
} from '../memory/recall.js';
import { decideExpansion, renderExpandedTurnRecords } from '../memory/summary-expander.js';
import { readMemoryFile as readLongTermMemory } from '../services/long-term-memory.js';
import { MEMORY_EXPAND_MAX_TOKENS, SUGGESTION_TOKEN_RESERVE } from '../utils/constants.js';
import { getOrCreatePersona } from '../services/personas.js';
import { applyRules } from '../utils/regex-runner.js';
import { applyTemplateVars } from '../utils/template-vars.js';
import { createLogger } from '../utils/logger.js';
import { loadBackendPrompt } from './prompt-loader.js';

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

function sliceCompletedHistoryByRounds(messages, rounds) {
  const history = omitLatestUserMessage(messages);
  const userIndexes = history
    .map((msg, index) => (msg.role === 'user' ? index : -1))
    .filter((index) => index >= 0);

  if (!Number.isInteger(rounds) || rounds <= 0 || userIndexes.length <= rounds) {
    return history;
  }

  const startIndex = userIndexes[userIndexes.length - rounds];
  return history.slice(startIndex);
}

export const __testables = {
  readAttachmentAsDataUrl,
  formatMessageForLLM,
  omitLatestUserMessage,
  getCurrentUserMessage,
  sliceCompletedHistoryByRounds,
};

// ─── 核心函数 ─────────────────────────────────────────────────────

/**
 * 构建发送给 LLM 的完整 messages 数组
 *
 * 新的 prompt 组装顺序（为支持 Prompt Cache 分层）：
 *   Cached system [1, 2, 3, 4]：全局 + 玩家 + 角色 + 常驻 cached 条目
 *   Dynamic system [5-11]：世界状态 + 玩家状态 + 角色状态 + State 条目 + 召回摘要 + 展开原文 + 日记
 *   History [12]：历史 user/assistant 交替
 *   Bottom: [13] 后置提示词（system）→ [14] 当前用户消息（尾部 user）
 *
 * @param {string} sessionId
 * @param {object} [options]
 * @param {Function} [options.onRecallEvent]  (name: string, payload: object) => void
 * @returns {Promise<{ messages: Array, temperature: number, maxTokens: number, recallHitCount: number }>}
 */
export async function buildPrompt(sessionId, options = {}) {
  const { onRecallEvent, diaryInjection } = options;
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
  const cachedSystemParts = [];
  const dynamicSystemParts = [];

  const persona = getOrCreatePersona(world.id);
  const personaName = persona?.name || '';
  const personaPrompt = persona?.system_prompt || '';

  const ctx = { user: personaName, char: character.name, world: world.name };
  const tv = (t) => applyTemplateVars(t, ctx);

  // ─── CACHED LAYER (1, 2, 3) ───
  // [1] 全局 System Prompt
  if (config.global_system_prompt) {
    cachedSystemParts.push(tv(config.global_system_prompt));
  }

  // [2] 玩家 System Prompt
  if (personaName || personaPrompt) {
    const lines = ['[{{user}}人设]'];
    if (personaName) lines.push(`名字：${personaName}`);
    if (personaPrompt) lines.push(tv(personaPrompt));
    cachedSystemParts.push(tv(lines.join('\n')));
  }

  // [3] 角色 System Prompt
  if (character.system_prompt) {
    cachedSystemParts.push(tv(`[{{char}}人设]\n${character.system_prompt}`));
  }

  // [4] 常驻 cached 条目（trigger_type=always 且 token=0）
  // 拼到 cachedSystemParts 末尾，按 sort_order ASC, created_at ASC 稳定排序，保证 prompt cache 命中。
  const allWorldEntries = getAllWorldEntries(world.id);
  const cachedEntries = allWorldEntries
    .filter((entry) => entry.trigger_type === 'always' && entry.token === 0 && entry.content);
  if (cachedEntries.length > 0) {
    const cachedTexts = cachedEntries.map((entry) => `【${tv(entry.title)}】\n${tv(entry.content)}`);
    cachedSystemParts.push(cachedTexts.join('\n\n'));
    log.debug(`│  [4] cached entries  count=${cachedEntries.length}`);
  }

  // ─── DYNAMIC LAYER (5-11) ───
  // [5] 世界状态
  const worldStateText = renderWorldState(world.id, sessionId);
  if (worldStateText) dynamicSystemParts.push(tv(worldStateText));

  // [6] 玩家状态
  const personaStateText = renderPersonaState(world.id, sessionId);
  if (personaStateText) dynamicSystemParts.push(tv(personaStateText));

  // [7] 角色状态
  const characterStateText = renderCharacterState(character.id, sessionId);
  if (characterStateText) dynamicSystemParts.push(tv(characterStateText));

  // [8] 世界 State 条目（常驻 / 关键词 / AI 召回；token=0 的常驻条目已进 cached layer）
  const worldEntries = allWorldEntries.filter((entry) => !(entry.trigger_type === 'always' && entry.token === 0));
  const triggeredIds = await matchEntries(sessionId, worldEntries, world.id);
  log.debug(`│  [8] entries  world=${worldEntries.length}  triggered=${triggeredIds.size}/${worldEntries.length}`);

  const triggeredEntries = worldEntries
    .filter((entry) => triggeredIds.has(entry.id) && entry.content)
    .sort((a, b) => {
      const diff = (a.token ?? 1) - (b.token ?? 1);
      if (diff !== 0) return diff;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
  const entryTexts = triggeredEntries.map((entry) => `【${tv(entry.title)}】\n${tv(entry.content)}`);

  if (entryTexts.length > 0) {
    dynamicSystemParts.push(entryTexts.join('\n\n'));
  }

  // [8.5] 长期记忆（会话级 md 文件，开关启用时注入）
  if (config.long_term_memory_enabled === true) {
    const ltm = readLongTermMemory(sessionId).trim();
    if (ltm) {
      dynamicSystemParts.push(`[长期记忆]\n${tv(ltm)}`);
      log.debug(`│  [8.5] long-term memory injected  chars=${ltm.length}`);
    }
  }

  // [9] 召回摘要（向量搜索历史 turn summaries，排除当前上下文窗口内的轮次）
  const { recalled } = await searchRecalledSummaries(world.id, sessionId);
  const recalledSummariesText = renderRecalledSummaries(recalled);
  const recallHitCount = recalled.length;
  if (recalledSummariesText) dynamicSystemParts.push(tv(recalledSummariesText));
  if (recallHitCount > 0) log.debug(`│  [9] recall  hits=${recallHitCount}`);
  onRecallEvent?.('memory_recall_done', { hit: recallHitCount });

  // [10] 记忆展开（由 AI 决定需要展开哪些原文）
  let expandedText = '';
  if (recallHitCount > 0 && config.memory_expansion_enabled !== false) {
    onRecallEvent?.('memory_expand_start', { candidates: recalled.map((r) => ({
      ref: r.ref,
      turn_record_id: r.turn_record_id,
      session_id: r.session_id,
      session_title: r.session_title,
      round_index: r.round_index,
      created_at: r.created_at,
    })) });
    const expandIds = await decideExpansion({ sessionId, recalled });
    if (expandIds.length > 0) {
      expandedText = renderExpandedTurnRecords(expandIds, MEMORY_EXPAND_MAX_TOKENS);
      if (expandedText) {
        dynamicSystemParts.push(tv(expandedText));
        log.debug(`│  [10] expand  ids=${expandIds.length}`);
      }
      onRecallEvent?.('memory_expand_done', { expanded: expandedText ? expandIds : [] });
    } else {
      onRecallEvent?.('memory_expand_done', { expanded: [] });
    }
  }

  // [11] 日记注入（一次性，仅本轮生效）
  if (diaryInjection && typeof diaryInjection === 'string') {
    dynamicSystemParts.push(`[日记注入]\n${diaryInjection}`);
    log.debug('│  [11] diary injection applied');
  }

  // ─── CONSTRUCT MESSAGES ───
  const messages = [];

  // [1-11] 合并为单条 system message：cached 前缀 + dynamic 后缀
  const cachedContent = cachedSystemParts.filter(Boolean).join('\n\n');
  const dynamicContent = dynamicSystemParts.filter(Boolean).join('\n\n');
  const systemContent = [cachedContent, dynamicContent].filter(Boolean).join('\n\n');
  if (systemContent) messages.push({ role: 'system', content: systemContent });

  // [12] 历史消息：稳定使用原始消息窗口。
  const uncompressedMessages = getUncompressedMessagesBySessionId(sessionId);
  const history = sliceCompletedHistoryByRounds(uncompressedMessages, config.context_history_rounds ?? 12);
  for (const msg of history) {
    const content = applyRules(msg.content, 'prompt_only', world.id, 'chat');
    messages.push(formatMessageForLLM({ ...msg, content }));
  }
  log.debug(`│  [12] history  raw_messages=${history.length}`);

  // [13] 后置提示词：历史消息之后、当前 user 之前的独立 system message
  const postParts = [
    config.global_post_prompt,
    character.post_prompt,
  ].filter(Boolean).map(tv);
  if (postParts.length > 0) {
    messages.push({ role: 'system', content: postParts.join('\n\n') });
  }

  // [14] 当前用户消息（最新 1 条 user）；suggestion 仍保持贴在最后一个 user message
  const currentUserMsg = getCurrentUserMessage(uncompressedMessages);
  if (currentUserMsg?.role === 'user') {
    let content = applyRules(currentUserMsg.content, 'prompt_only', world.id, 'chat');
    if (config.suggestion_enabled) content += '\n\n' + tv(SUGGESTION_PROMPT);

    messages.push(formatMessageForLLM({ ...currentUserMsg, content }));
  }

  const temperature = world.temperature ?? config.llm.temperature;
  const baseMaxTokens = world.max_tokens ?? config.llm.max_tokens;
  const maxTokens = config.suggestion_enabled
    ? Math.max(baseMaxTokens - SUGGESTION_TOKEN_RESERVE, 500)
    : baseMaxTokens;

  const suggestionText = config.suggestion_enabled ? tv(SUGGESTION_PROMPT) : null;

  // 本轮激活的非常驻条目（trigger_type !== 'always'），供 SSE 透传给前端展示
  const activatedEntries = triggeredEntries
    .filter((e) => e.trigger_type !== 'always')
    .map((e) => ({ id: e.id, title: e.title, trigger_type: e.trigger_type }));

  log.info(`└─ buildPrompt DONE  session=${sid}  msgs=${messages.length}  cached=${fmtK(cachedContent.length)}  +${Date.now() - t0}ms  temp=${temperature}  max=${maxTokens}`);
  return { messages, temperature, maxTokens, recallHitCount, cacheableSystem: cachedContent, suggestionText, activatedEntries };
}

/**
 * 写作版本：支持多个激活角色，[8-10] 向量召回与记忆展开同 buildPrompt。
 * 组装顺序与 buildPrompt 不同：为避免多角色切换导致 cache miss，[3] 角色 system prompt 移到 dynamic 层。
 *
 * Cached layer: [1] 全局、[2] 玩家、[4] 常驻 cached 条目（保持稳定）
 * Dynamic layer: [3] 所有激活角色 system prompt + [5-11] 上下文
 * Bottom: [12] 历史消息，[13] 后置提示词（system），[14] 当前消息
 *
 * [3] 和 [7] 针对所有激活角色展开；无后置提示词对角色分别应用。
 *
 * @param {string} sessionId
 * @param {object} [options]
 * @param {Function} [options.onRecallEvent]  (name: string, payload: object) => void
 * @returns {Promise<{ messages: Array, temperature: number, maxTokens: number, model: string|null, recallHitCount: number }>}
 */
export async function buildWritingPrompt(sessionId, options = {}) {
  const { onRecallEvent, diaryInjection, skipWritingInstructions } = options;
  const session = getSessionById(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  const world = getWorldById(session.world_id);
  if (!world) throw new Error(`World not found: ${session.world_id}`);

  const activeCharacters = getWritingSessionCharacters(sessionId).filter(Boolean);

  const config = getConfig();
  const writing = config.writing || {};
  const cachedSystemParts = [];
  const dynamicSystemParts = [];
  const sid = sessionId.slice(0, 8);
  const t0 = Date.now();

  const persona = getOrCreatePersona(world.id);
  const personaName = persona?.name || '';
  const personaPrompt = persona?.system_prompt || '';

  const charNames = activeCharacters.map((c) => c.name).join(', ');
  log.info(`┌─ buildWritingPrompt  session=${sid}  world="${world.name}"  chars=${activeCharacters.length}${charNames ? `  [${charNames}]` : ''}`);

  const primaryCharacterName = activeCharacters[0]?.name || '';
  const tv = (t) => applyTemplateVars(t, {
    user: personaName,
    char: primaryCharacterName,
    world: world.name,
  });
  const tvChar = (t, character) => applyTemplateVars(t, {
    user: personaName,
    char: character.name,
    world: world.name,
  });

  // ─── CACHED LAYER (1, 2, 4) ───
  // [1] 全局 System Prompt（使用写作专属配置；impersonate 时跳过）
  if (writing.global_system_prompt && !skipWritingInstructions) {
    cachedSystemParts.push(tv(writing.global_system_prompt));
  }

  // [2] 玩家 System Prompt
  if (personaName || personaPrompt) {
    const lines = ['[{{user}}人设]'];
    if (personaName) lines.push(`名字：${personaName}`);
    if (personaPrompt) lines.push(tv(personaPrompt));
    cachedSystemParts.push(tv(lines.join('\n')));
  }

  // [4] 常驻 cached 条目（trigger_type=always 且 token=0）
  // 写作模式下 cached layer 含 [1][2][4]，cached 条目拼到其后；按 sort_order ASC, created_at ASC 稳定。
  const allWorldEntries = getAllWorldEntries(world.id);
  const cachedEntries = allWorldEntries
    .filter((entry) => entry.trigger_type === 'always' && entry.token === 0 && entry.content);
  if (cachedEntries.length > 0) {
    const cachedTexts = cachedEntries.map((entry) => `【${tv(entry.title)}】\n${tv(entry.content)}`);
    cachedSystemParts.push(cachedTexts.join('\n\n'));
    log.debug(`│  [4] cached entries  count=${cachedEntries.length}`);
  }

  // ─── DYNAMIC LAYER (3, 5-11；写作模式下[3]也在dynamic以支持多角色切换) ───
  // [3] 所有激活角色 System Prompt（移到 dynamic 避免多角色组合变化导致 cache miss）
  for (const character of activeCharacters) {
    if (character.system_prompt) {
      dynamicSystemParts.push(tvChar(`[{{char}}人设]\n${character.system_prompt}`, character));
    }
  }

  // [5] 世界状态
  const worldStateText = renderWorldState(world.id, sessionId);
  if (worldStateText) dynamicSystemParts.push(tv(worldStateText));

  // [6] 玩家状态
  const personaStateText = renderPersonaState(world.id, sessionId);
  if (personaStateText) dynamicSystemParts.push(tv(personaStateText));

  // [7] 所有激活角色的角色状态
  for (const character of activeCharacters) {
    const charStateText = renderCharacterState(character.id, sessionId);
    if (charStateText) dynamicSystemParts.push(tvChar(charStateText, character));
  }

  // [8] 世界 State 条目（常驻 / 关键词 / AI 召回；token=0 的常驻条目已进 cached layer）
  const worldEntries = allWorldEntries.filter((entry) => !(entry.trigger_type === 'always' && entry.token === 0));
  const triggeredIds = await matchEntries(sessionId, worldEntries, world.id);
  const triggeredEntries2 = worldEntries
    .filter((entry) => triggeredIds.has(entry.id) && entry.content)
    .sort((a, b) => {
      const diff = (a.token ?? 1) - (b.token ?? 1);
      if (diff !== 0) return diff;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
  const entryTexts = triggeredEntries2.map((entry) => `【${tv(entry.title)}】\n${tv(entry.content)}`);
  if (entryTexts.length > 0) dynamicSystemParts.push(entryTexts.join('\n\n'));

  // [8.5] 长期记忆（会话级 md 文件，开关启用时注入）
  if (writing.long_term_memory_enabled === true) {
    const ltm = readLongTermMemory(sessionId).trim();
    if (ltm) {
      dynamicSystemParts.push(`[长期记忆]\n${tv(ltm)}`);
      log.debug(`│  [8.5] long-term memory injected (writing)  chars=${ltm.length}`);
    }
  }

  // [9] 召回摘要（向量搜索历史 turn summaries，排除当前上下文窗口内的轮次）
  const { recalled } = await searchRecalledSummaries(world.id, sessionId);
  const recalledSummariesText = renderRecalledSummaries(recalled);
  const recallHitCount = recalled.length;
  if (recalledSummariesText) dynamicSystemParts.push(tv(recalledSummariesText));
  if (recallHitCount > 0) log.debug(`│  [9] recall  hits=${recallHitCount}`);
  onRecallEvent?.('memory_recall_done', { hit: recallHitCount });

  // [10] 记忆展开（由 AI 决定需要展开哪些原文）
  if (recallHitCount > 0 && writing.memory_expansion_enabled !== false) {
    onRecallEvent?.('memory_expand_start', { candidates: recalled.map((r) => ({
      ref: r.ref,
      turn_record_id: r.turn_record_id,
      session_id: r.session_id,
      session_title: r.session_title,
      round_index: r.round_index,
      created_at: r.created_at,
    })) });
    const expandIds = await decideExpansion({ sessionId, recalled });
    if (expandIds.length > 0) {
      const expandedText = renderExpandedTurnRecords(expandIds, MEMORY_EXPAND_MAX_TOKENS);
      if (expandedText) {
        dynamicSystemParts.push(tv(expandedText));
        log.debug(`│  [10] expand  ids=${expandIds.length}`);
      }
      onRecallEvent?.('memory_expand_done', { expanded: expandedText ? expandIds : [] });
    } else {
      onRecallEvent?.('memory_expand_done', { expanded: [] });
    }
  }

  // [11] 日记注入（一次性，仅本轮生效）
  if (diaryInjection && typeof diaryInjection === 'string') {
    dynamicSystemParts.push(`[日记注入]\n${diaryInjection}`);
    log.debug('│  [11] diary injection applied (writing)');
  }

  // ─── CONSTRUCT MESSAGES ───
  const messages = [];

  // [1-11] 合并为单条 system message：cached 前缀 + dynamic 后缀
  const cachedContent = cachedSystemParts.filter(Boolean).join('\n\n');
  const dynamicContent = dynamicSystemParts.filter(Boolean).join('\n\n');
  const systemContent = [cachedContent, dynamicContent].filter(Boolean).join('\n\n');
  if (systemContent) messages.push({ role: 'system', content: systemContent });

  // [12] 历史消息：稳定使用原始消息窗口；turn records 仅用于摘要/时间线。
  const uncompressedMessages = getUncompressedMessagesBySessionId(sessionId);
  const history = sliceCompletedHistoryByRounds(
    uncompressedMessages,
    writing.context_history_rounds ?? config.context_history_rounds ?? 12,
  );
  for (const msg of history) {
    const content = applyRules(msg.content, 'prompt_only', world.id, 'writing');
    messages.push(formatMessageForLLM({ ...msg, content }));
  }

  // [13] 后置提示词：历史消息之后、当前 user 之前的独立 system message
  if (!skipWritingInstructions) {
    const postParts = [writing.global_post_prompt].filter(Boolean).map(tv);
    if (postParts.length > 0) {
      messages.push({ role: 'system', content: postParts.join('\n\n') });
    }
  }

  // [14] 当前用户消息（写作模式无角色后置提示词；impersonate 时 suggestion 逻辑保持不变）
  const currentUserMsg = getCurrentUserMessage(uncompressedMessages);
  if (currentUserMsg?.role === 'user') {
    let content = applyRules(currentUserMsg.content, 'prompt_only', world.id, 'writing');
    if (writing.suggestion_enabled) content += '\n\n' + tv(SUGGESTION_PROMPT);

    messages.push(formatMessageForLLM({ ...currentUserMsg, content }));
  }

  const temperature = world.temperature ?? writing.temperature ?? config.llm.temperature;
  const baseMaxTokens = world.max_tokens ?? writing.max_tokens ?? config.llm.max_tokens;
  const maxTokens = writing.suggestion_enabled
    ? Math.max(baseMaxTokens - SUGGESTION_TOKEN_RESERVE, 500)
    : baseMaxTokens;
  const model = writing.model || null;

  const suggestionText = writing.suggestion_enabled ? tv(SUGGESTION_PROMPT) : null;

  const activatedEntries = triggeredEntries2
    .filter((e) => e.trigger_type !== 'always')
    .map((e) => ({ id: e.id, title: e.title, trigger_type: e.trigger_type }));

  log.info(`└─ buildWritingPrompt DONE  session=${sid}  msgs=${messages.length}  cached=${fmtK(cachedContent.length)}  +${Date.now() - t0}ms  temp=${temperature}  max=${maxTokens}`);
  return { messages, temperature, maxTokens, model, recallHitCount, cacheableSystem: cachedContent, suggestionText, activatedEntries };
}
