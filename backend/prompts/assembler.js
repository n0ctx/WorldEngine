/**
 * 提示词组装器 — 此文件一旦完成即锁定，顺序不得修改
 *
 *   [CACHED LAYER: system role, 可复用]
 *   [1]  全局 System Prompt
 *   [2]  玩家 System Prompt（均为空则跳过）
 *   [3]  角色 System Prompt
 *   [3.5] 常驻 cached 条目（trigger_type=always 且 token=0，按 sort_order ASC, created_at ASC）
 *
 *   [DYNAMIC LAYER: user role, 每轮变化]
 *   [4]  世界状态
 *   [5]  玩家状态
 *   [6]  角色状态
 *   [7]  世界 State 条目（description 仅供 preflight；命中→content 注入）
 *   [8]  召回摘要（向量搜索历史 turn summaries，排除当前上下文窗口内的轮次）
 *   [9]  展开原文（AI preflight 决策后的 turn record 原文）
 *   [10] 日记注入（一次性，仅本轮生效）
 *
 *   [历史消息：role:user/assistant 交替]
 *   [12] 历史消息（稳定使用原始 messages 窗口）
 *
 *   [BOTTOM: 当前消息末尾，最高优先级]
 *   [11] 后置提示词（全局→角色 + world post 条目，均空跳过）
 *   [13] 当前用户消息（唯一的尾部 user 消息）
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
import { MEMORY_EXPAND_MAX_TOKENS } from '../utils/constants.js';
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
 *   Cached system [1, 3, 5]：全局 + 玩家 + 角色
 *   Dynamic messages [2, 4, 6-10]：世界状态 + 玩家状态 + 角色状态 + State条目 + 召回摘要 + 展开原文 + 日记
 *   Bottom (last user msg) [11]：后置提示词
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

  // [3.5] 常驻 cached 条目（trigger_type=always 且 token=0）
  // 拼到 cachedSystemParts 末尾，按 sort_order ASC, created_at ASC 稳定排序，保证 prompt cache 命中。
  const allWorldEntries = getAllWorldEntries(world.id);
  const cachedEntries = allWorldEntries
    .filter((entry) => entry.trigger_type === 'always' && entry.token === 0 && entry.content);
  if (cachedEntries.length > 0) {
    const cachedTexts = cachedEntries.map((entry) => `【${tv(entry.title)}】\n${tv(entry.content)}`);
    cachedSystemParts.push(cachedTexts.join('\n\n'));
    log.debug(`│  [3.5] cached entries  count=${cachedEntries.length}`);
  }

  // ─── DYNAMIC LAYER (4, 5, 6-10) ───
  // [4] 世界状态
  const worldStateText = renderWorldState(world.id, sessionId);
  if (worldStateText) dynamicSystemParts.push(tv(worldStateText));

  // [5] 玩家状态
  const personaStateText = renderPersonaState(world.id, sessionId);
  if (personaStateText) dynamicSystemParts.push(tv(personaStateText));

  // [6] 角色状态
  const characterStateText = renderCharacterState(character.id, sessionId);
  if (characterStateText) dynamicSystemParts.push(tv(characterStateText));

  // [7] 世界 State 条目（常驻 / 关键词 / AI 召回；token=0 的常驻条目已进 cached layer）
  const worldEntries = allWorldEntries.filter((entry) => !(entry.trigger_type === 'always' && entry.token === 0));
  const triggeredIds = await matchEntries(sessionId, worldEntries, world.id);
  log.debug(`│  [7] entries  world=${worldEntries.length}  triggered=${triggeredIds.size}/${worldEntries.length}`);

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

  // [8] 召回摘要（向量搜索历史 turn summaries，排除当前上下文窗口内的轮次）
  const { recalled } = await searchRecalledSummaries(world.id, sessionId);
  const recalledSummariesText = renderRecalledSummaries(recalled);
  const recallHitCount = recalled.length;
  if (recalledSummariesText) dynamicSystemParts.push(tv(recalledSummariesText));
  if (recallHitCount > 0) log.debug(`│  [8] recall  hits=${recallHitCount}`);
  onRecallEvent?.('memory_recall_done', { hit: recallHitCount });

  // [9] 记忆展开（由 AI 决定需要展开哪些原文）
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
        log.debug(`│  [9] expand  ids=${expandIds.length}`);
      }
      onRecallEvent?.('memory_expand_done', { expanded: expandedText ? expandIds : [] });
    } else {
      onRecallEvent?.('memory_expand_done', { expanded: [] });
    }
  }

  // [10] 日记注入（一次性，仅本轮生效）
  if (diaryInjection && typeof diaryInjection === 'string') {
    dynamicSystemParts.push(`[日记注入]\n${diaryInjection}`);
    log.debug('│  [10] diary injection applied');
  }

  // ─── CONSTRUCT MESSAGES ───
  const messages = [];

  // cached system → marked for Prompt Caching
  const cachedContent = cachedSystemParts.filter(Boolean).join('\n\n');
  if (cachedContent) messages.push({ role: 'system', content: cachedContent });

  // dynamic context → as separate user message before history
  const dynamicContent = dynamicSystemParts.filter(Boolean).join('\n\n');
  if (dynamicContent) {
    messages.push({ role: 'user', content: dynamicContent });
  }

  // [13] 历史消息：稳定使用原始消息窗口。
  const uncompressedMessages = getUncompressedMessagesBySessionId(sessionId);
  const history = sliceCompletedHistoryByRounds(uncompressedMessages, config.context_history_rounds ?? 12);
  for (const msg of history) {
    const content = applyRules(msg.content, 'prompt_only', world.id, 'chat');
    messages.push(formatMessageForLLM({ ...msg, content }));
  }
  log.debug(`│  [13] history  raw_messages=${history.length}`);

  // [11 + 14] 当前用户消息（最新 1 条 user）+ 后置提示词
  // [11] 后置提示词追加在末尾，确保最高优先级
  const currentUserMsg = getCurrentUserMessage(uncompressedMessages);
  if (currentUserMsg?.role === 'user') {
    let content = applyRules(currentUserMsg.content, 'prompt_only', world.id, 'chat');
    if (config.suggestion_enabled) content += '\n\n' + tv(SUGGESTION_PROMPT);

    const postParts = [
      config.global_post_prompt,
      character.post_prompt,
    ].filter(Boolean).map(tv);
    if (postParts.length > 0) {
      content += '\n\n' + postParts.join('\n\n');
    }

    messages.push(formatMessageForLLM({ ...currentUserMsg, content }));
  }

  const temperature = world.temperature ?? config.llm.temperature;
  const maxTokens = world.max_tokens ?? config.llm.max_tokens;

  log.info(`└─ buildPrompt DONE  session=${sid}  msgs=${messages.length}  cached=${fmtK(cachedContent.length)}  +${Date.now() - t0}ms  temp=${temperature}  max=${maxTokens}`);
  return { messages, temperature, maxTokens, recallHitCount };
}

/**
 * 写作版本：支持多个激活角色，[8-10] 向量召回与记忆展开同 buildPrompt。
 * 组装顺序与 buildPrompt 不同：为避免多角色切换导致 cache miss，[3] 角色 system prompt 移到 dynamic 层。
 *
 * Cached layer: [1] 全局、[2] 玩家（保持稳定）
 * Dynamic layer: [3] 所有激活角色 system prompt + [4-10] 上下文
 * Bottom: [11] 后置提示词 + [13] 当前消息
 *
 * [3] 和 [6] 针对所有激活角色展开；无后置提示词对角色分别应用。
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

  // ─── CACHED LAYER (1, 2) ───
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

  // [3.5] 常驻 cached 条目（trigger_type=always 且 token=0）
  // 写作模式下 cached layer 仅含 [1][2]，cached 条目拼到其后；按 sort_order ASC, created_at ASC 稳定。
  const allWorldEntries = getAllWorldEntries(world.id);
  const cachedEntries = allWorldEntries
    .filter((entry) => entry.trigger_type === 'always' && entry.token === 0 && entry.content);
  if (cachedEntries.length > 0) {
    const cachedTexts = cachedEntries.map((entry) => `【${tv(entry.title)}】\n${tv(entry.content)}`);
    cachedSystemParts.push(cachedTexts.join('\n\n'));
    log.debug(`│  [3.5] cached entries  count=${cachedEntries.length}`);
  }

  // ─── DYNAMIC LAYER (3-10，写作模式下[3]也在dynamic以支持多角色切换) ───
  // [3] 所有激活角色 System Prompt（移到 dynamic 避免多角色组合变化导致 cache miss）
  for (const character of activeCharacters) {
    if (character.system_prompt) {
      dynamicSystemParts.push(tvChar(`[{{char}}人设]\n${character.system_prompt}`, character));
    }
  }

  // [4] 世界状态
  const worldStateText = renderWorldState(world.id, sessionId);
  if (worldStateText) dynamicSystemParts.push(tv(worldStateText));

  // [5] 玩家状态
  const personaStateText = renderPersonaState(world.id, sessionId);
  if (personaStateText) dynamicSystemParts.push(tv(personaStateText));

  // [6] 所有激活角色的角色状态
  for (const character of activeCharacters) {
    const charStateText = renderCharacterState(character.id, sessionId);
    if (charStateText) dynamicSystemParts.push(tvChar(charStateText, character));
  }

  // [7] 世界 State 条目（常驻 / 关键词 / AI 召回；token=0 的常驻条目已进 cached layer）
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

  // [8] 召回摘要（向量搜索历史 turn summaries，排除当前上下文窗口内的轮次）
  const { recalled } = await searchRecalledSummaries(world.id, sessionId);
  const recalledSummariesText = renderRecalledSummaries(recalled);
  const recallHitCount = recalled.length;
  if (recalledSummariesText) dynamicSystemParts.push(tv(recalledSummariesText));
  if (recallHitCount > 0) log.debug(`│  [8] recall  hits=${recallHitCount}`);
  onRecallEvent?.('memory_recall_done', { hit: recallHitCount });

  // [9] 记忆展开（由 AI 决定需要展开哪些原文）
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
        log.debug(`│  [9] expand  ids=${expandIds.length}`);
      }
      onRecallEvent?.('memory_expand_done', { expanded: expandedText ? expandIds : [] });
    } else {
      onRecallEvent?.('memory_expand_done', { expanded: [] });
    }
  }

  // [10] 日记注入（一次性，仅本轮生效）
  if (diaryInjection && typeof diaryInjection === 'string') {
    dynamicSystemParts.push(`[日记注入]\n${diaryInjection}`);
    log.debug('│  [10] diary injection applied (writing)');
  }

  // ─── CONSTRUCT MESSAGES ───
  const messages = [];

  // cached system
  const cachedContent = cachedSystemParts.filter(Boolean).join('\n\n');
  if (cachedContent) messages.push({ role: 'system', content: cachedContent });

  // dynamic context
  const dynamicContent = dynamicSystemParts.filter(Boolean).join('\n\n');
  if (dynamicContent) {
    messages.push({ role: 'user', content: dynamicContent });
  }

  // [13] 历史消息：稳定使用原始消息窗口；turn records 仅用于摘要/时间线。
  const uncompressedMessages = getUncompressedMessagesBySessionId(sessionId);
  const history = sliceCompletedHistoryByRounds(
    uncompressedMessages,
    writing.context_history_rounds ?? config.context_history_rounds ?? 12,
  );
  for (const msg of history) {
    const content = applyRules(msg.content, 'prompt_only', world.id, 'writing');
    messages.push(formatMessageForLLM({ ...msg, content }));
  }

  // [11 + 14] 当前用户消息 + 后置提示词（写作模式无角色后置提示词；impersonate 时跳过）
  const currentUserMsg = getCurrentUserMessage(uncompressedMessages);
  if (currentUserMsg?.role === 'user') {
    let content = applyRules(currentUserMsg.content, 'prompt_only', world.id, 'writing');
    if (writing.suggestion_enabled) content += '\n\n' + tv(SUGGESTION_PROMPT);

    if (!skipWritingInstructions) {
      const postParts = [writing.global_post_prompt].filter(Boolean).map(tv);
      if (postParts.length > 0) {
        content += '\n\n' + postParts.join('\n\n');
      }
    }

    messages.push(formatMessageForLLM({ ...currentUserMsg, content }));
  }

  const temperature = world.temperature ?? writing.temperature ?? config.llm.temperature;
  const maxTokens = world.max_tokens ?? writing.max_tokens ?? config.llm.max_tokens;
  const model = writing.model || null;

  log.info(`└─ buildWritingPrompt DONE  session=${sid}  msgs=${messages.length}  cached=${fmtK(cachedContent.length)}  +${Date.now() - t0}ms  temp=${temperature}  max=${maxTokens}`);
  return { messages, temperature, maxTokens, model, recallHitCount };
}
