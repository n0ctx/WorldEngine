/**
 * 提示词组装器 — 此文件一旦完成即锁定，顺序不得修改
 *
 * 组装顺序（硬编码，不得调整）：
 *   [system 消息，[1]–[12] 合并为单个 role:system]
 *   [1]  全局 System Prompt
 *   [2]  世界状态
 *   [3]  玩家 System Prompt（均为空则跳过）
 *   [4]  玩家状态
 *   [5]  角色 System Prompt
 *   [6]  角色状态
 *   [7]  世界 State 条目（description 仅供 preflight；命中→content 注入）
 *   [8]  触发器 inject_prompt（consumed 模式递减 rounds_remaining）
 *   [9]  召回摘要（向量搜索历史 turn summaries，排除当前上下文窗口内的轮次）
 *   [10] 展开原文（AI preflight 决策后的 turn record 原文）
 *   [11] 日记注入（一次性，仅本轮生效）
 *   [12] 后置提示词（全局→角色 + world post 条目，均空跳过）
 *   [历史消息：role:user/assistant 交替]
 *   [13] 历史消息（稳定使用原始 messages 窗口）
 *   [14] 当前用户消息（唯一的尾部 user 消息）
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
import { getActiveInjectPromptActions, updateActionParams } from '../db/queries/triggers.js';
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
  const systemParts = [];

  // [3] 玩家 System Prompt（均为空则跳过）
  const persona = getOrCreatePersona(world.id);
  const personaName = persona?.name || '';
  const personaPrompt = persona?.system_prompt || '';

  // 模板变量上下文（{{user}} / {{char}} / {{world}}）
  const ctx = { user: personaName, char: character.name, world: world.name };
  const tv = (t) => applyTemplateVars(t, ctx);

  // [1] 全局 System Prompt
  if (config.global_system_prompt) {
    systemParts.push(tv(config.global_system_prompt));
  }

  // [2] 世界状态
  const worldStateText = renderWorldState(world.id, sessionId);
  if (worldStateText) systemParts.push(tv(worldStateText));

  if (personaName || personaPrompt) {
    const lines = ['[{{user}}人设]'];
    if (personaName) lines.push(`名字：${personaName}`);
    if (personaPrompt) lines.push(tv(personaPrompt));
    systemParts.push(tv(lines.join('\n')));
  }

  // [4] 玩家状态
  const personaStateText = renderPersonaState(world.id, sessionId);
  if (personaStateText) systemParts.push(tv(personaStateText));

  // [5] 角色 System Prompt
  if (character.system_prompt) {
    systemParts.push(tv(`[{{char}}人设]\n${character.system_prompt}`));
  }

  // [6] 角色状态
  const characterStateText = renderCharacterState(character.id, sessionId);
  if (characterStateText) systemParts.push(tv(characterStateText));

  // [7] 世界 State 条目（常驻 / 关键词 / AI 召回）
  const worldEntries = getAllWorldEntries(world.id);
  const triggeredIds = await matchEntries(sessionId, worldEntries);
  log.debug(`│  [7] entries  world=${worldEntries.length}  triggered=${triggeredIds.size}/${worldEntries.length}`);

  const systemEntryTexts = [];
  const postEntryTexts = [];

  // description 只供 preflight 判断是否命中，不进入最终主 prompt。
  // position='system' → systemParts；position='post'（或无 position）→ postParts
  for (const entry of worldEntries) {
    if (triggeredIds.has(entry.id) && entry.content) {
      const text = `【${tv(entry.title)}】\n${tv(entry.content)}`;
      if (entry.position === 'system') {
        systemEntryTexts.push(text);
      } else {
        postEntryTexts.push(text);
      }
    }
  }

  if (systemEntryTexts.length > 0) {
    systemParts.push(systemEntryTexts.join('\n\n'));
  }

  // [8] 触发器 inject_prompt 注入（consumed 模式递减 rounds_remaining）
  const injectActions = getActiveInjectPromptActions(world.id);
  const injectTexts = [];
  for (const action of injectActions) {
    const p = action.params || {};
    if (p.text) {
      injectTexts.push(`[触发注入]\n${p.text}`);
      if (p.mode === 'consumed' && typeof p.rounds_remaining === 'number') {
        updateActionParams(action.id, { rounds_remaining: p.rounds_remaining - 1 });
      }
    }
  }
  if (injectTexts.length > 0) {
    systemParts.push(injectTexts.join('\n\n'));
    log.debug(`│  [8] inject  count=${injectTexts.length}`);
  }

  // [9] 召回摘要（向量搜索历史 turn summaries，排除当前上下文窗口内的轮次）
  const { recalled } = await searchRecalledSummaries(world.id, sessionId);
  const recalledSummariesText = renderRecalledSummaries(recalled);
  const recallHitCount = recalled.length;
  if (recalledSummariesText) systemParts.push(tv(recalledSummariesText));
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
        systemParts.push(tv(expandedText));
        log.debug(`│  [10] expand  ids=${expandIds.length}`);
      }
      onRecallEvent?.('memory_expand_done', { expanded: expandedText ? expandIds : [] });
    } else {
      onRecallEvent?.('memory_expand_done', { expanded: [] });
    }
  }

  // [11] 日记注入（一次性，仅本轮生效）
  if (diaryInjection && typeof diaryInjection === 'string') {
    systemParts.push(`[日记注入]\n${diaryInjection}`);
    log.debug('│  [11] diary injection applied');
  }

  // [12] 后置提示词 → 注入 system 末尾
  const postParts = [
    config.global_post_prompt,
    character.post_prompt,
  ].filter(Boolean).map(tv);

  if (postEntryTexts.length > 0) {
    postParts.push(postEntryTexts.join('\n\n'));
  }

  if (postParts.length > 0) {
    systemParts.push(postParts.join('\n\n'));
  }

  const messages = [];

  // system parts 合并为 1 条 system 消息
  const systemContent = systemParts.filter(Boolean).join('\n\n');
  if (systemContent) messages.push({ role: 'system', content: systemContent });

  // [13] 历史消息：稳定使用原始消息窗口。
  const uncompressedMessages = getUncompressedMessagesBySessionId(sessionId);
  const history = sliceCompletedHistoryByRounds(uncompressedMessages, config.context_history_rounds ?? 12);
  for (const msg of history) {
    const content = applyRules(msg.content, 'prompt_only', world.id, 'chat');
    messages.push(formatMessageForLLM({ ...msg, content }));
  }
  log.debug(`│  [13] history  raw_messages=${history.length}`);

  // [14] 当前用户消息（最新 1 条 user）
  // suggestion_enabled 时追加选项指令到末尾，确保指令位于 LLM 生成前的最后位置
  const currentUserMsg = getCurrentUserMessage(uncompressedMessages);
  if (currentUserMsg?.role === 'user') {
    let content = applyRules(currentUserMsg.content, 'prompt_only', world.id, 'chat');
    if (config.suggestion_enabled) content += '\n\n' + tv(SUGGESTION_PROMPT);
    messages.push(formatMessageForLLM({ ...currentUserMsg, content }));
  }

  const temperature = world.temperature ?? config.llm.temperature;
  const maxTokens = world.max_tokens ?? config.llm.max_tokens;
  const systemLen = systemContent.length;

  log.info(`└─ buildPrompt DONE  session=${sid}  msgs=${messages.length}  system=${fmtK(systemLen)}  +${Date.now() - t0}ms  temp=${temperature}  max=${maxTokens}`);
  return { messages, temperature, maxTokens, recallHitCount };
}

/**
 * 写作空间版本：支持多个激活角色，[9-10] 向量召回与记忆展开同 buildPrompt。
 * 组装顺序与 buildPrompt 对齐，但 [5-6] 针对所有激活角色展开。
 *
 * @param {string} sessionId
 * @param {object} [options]
 * @param {Function} [options.onRecallEvent]  (name: string, payload: object) => void
 * @returns {Promise<{ messages: Array, temperature: number, maxTokens: number, model: string|null, recallHitCount: number }>}
 */
export async function buildWritingPrompt(sessionId, options = {}) {
  const { onRecallEvent, diaryInjection } = options;
  const session = getSessionById(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  const world = getWorldById(session.world_id);
  if (!world) throw new Error(`World not found: ${session.world_id}`);

  const activeCharacters = getWritingSessionCharacters(sessionId).filter(Boolean);

  const config = getConfig();
  const writing = config.writing || {};
  const systemParts = [];
  const sid = sessionId.slice(0, 8);
  const t0 = Date.now();

  // [3] 玩家 System Prompt
  const persona = getOrCreatePersona(world.id);
  const personaName = persona?.name || '';
  const personaPrompt = persona?.system_prompt || '';

  // [5-6] 激活角色 System Prompt + 角色状态（每个角色一段）
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

  // [1] 全局 System Prompt（使用写作空间专属配置）
  if (writing.global_system_prompt) {
    systemParts.push(tv(writing.global_system_prompt));
  }

  // [2] 世界状态
  const worldStateText = renderWorldState(world.id, sessionId);
  if (worldStateText) systemParts.push(tv(worldStateText));

  if (personaName || personaPrompt) {
    const lines = ['[{{user}}人设]'];
    if (personaName) lines.push(`名字：${personaName}`);
    if (personaPrompt) lines.push(tv(personaPrompt));
    systemParts.push(tv(lines.join('\n')));
  }

  // [4] 玩家状态
  const personaStateText = renderPersonaState(world.id, sessionId);
  if (personaStateText) systemParts.push(tv(personaStateText));

  for (const character of activeCharacters) {
    if (character.system_prompt) {
      systemParts.push(tvChar(`[{{char}}人设]\n${character.system_prompt}`, character));
    }
    const charStateText = renderCharacterState(character.id, sessionId);
    if (charStateText) systemParts.push(tvChar(charStateText, character));
  }

  // [7] 世界 State 条目（常驻 / 关键词 / AI 召回）
  const worldEntries = getAllWorldEntries(world.id);
  const triggeredIds = await matchEntries(sessionId, worldEntries);
  const systemEntryTexts = [];
  const postEntryTexts = [];

  // description 只供 preflight 判断是否命中，不进入最终主 prompt。
  // position='system' → systemParts；position='post'（或无 position）→ postParts
  for (const entry of worldEntries) {
    if (triggeredIds.has(entry.id) && entry.content) {
      const text = `【${tv(entry.title)}】\n${tv(entry.content)}`;
      if (entry.position === 'system') {
        systemEntryTexts.push(text);
      } else {
        postEntryTexts.push(text);
      }
    }
  }
  if (systemEntryTexts.length > 0) systemParts.push(systemEntryTexts.join('\n\n'));

  // [8] 触发器 inject_prompt 注入（consumed 模式递减 rounds_remaining）
  const injectActions = getActiveInjectPromptActions(world.id);
  const injectTexts = [];
  for (const action of injectActions) {
    const p = action.params || {};
    if (p.text) {
      injectTexts.push(`[触发注入]\n${p.text}`);
      if (p.mode === 'consumed' && typeof p.rounds_remaining === 'number') {
        updateActionParams(action.id, { rounds_remaining: p.rounds_remaining - 1 });
      }
    }
  }
  if (injectTexts.length > 0) {
    systemParts.push(injectTexts.join('\n\n'));
    log.debug(`│  [8] inject  count=${injectTexts.length}`);
  }

  // [9] 召回摘要（向量搜索历史 turn summaries，排除当前上下文窗口内的轮次）
  const { recalled } = await searchRecalledSummaries(world.id, sessionId);
  const recalledSummariesText = renderRecalledSummaries(recalled);
  const recallHitCount = recalled.length;
  if (recalledSummariesText) systemParts.push(tv(recalledSummariesText));
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
        systemParts.push(tv(expandedText));
        log.debug(`│  [10] expand  ids=${expandIds.length}`);
      }
      onRecallEvent?.('memory_expand_done', { expanded: expandedText ? expandIds : [] });
    } else {
      onRecallEvent?.('memory_expand_done', { expanded: [] });
    }
  }

  // [11] 日记注入（一次性，仅本轮生效）
  if (diaryInjection && typeof diaryInjection === 'string') {
    systemParts.push(`[日记注入]\n${diaryInjection}`);
    log.debug('│  [11] diary injection applied (writing)');
  }

  // [12] 后置提示词 → 注入 system 末尾（写作模式无角色后置提示词）
  const postParts = [writing.global_post_prompt].filter(Boolean).map(tv);

  if (postEntryTexts.length > 0) {
    postParts.push(postEntryTexts.join('\n\n'));
  }

  if (postParts.length > 0) {
    systemParts.push(postParts.join('\n\n'));
  }

  const messages = [];
  const systemContent = systemParts.filter(Boolean).join('\n\n');
  if (systemContent) messages.push({ role: 'system', content: systemContent });

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

  // [14] 当前用户消息
  // suggestion_enabled 时追加选项指令到末尾，确保指令位于 LLM 生成前的最后位置
  const currentUserMsg = getCurrentUserMessage(uncompressedMessages);
  if (currentUserMsg?.role === 'user') {
    let content = applyRules(currentUserMsg.content, 'prompt_only', world.id, 'writing');
    if (writing.suggestion_enabled) content += '\n\n' + tv(SUGGESTION_PROMPT);
    messages.push(formatMessageForLLM({ ...currentUserMsg, content }));
  }

  const temperature = world.temperature ?? writing.temperature ?? config.llm.temperature;
  const maxTokens = world.max_tokens ?? writing.max_tokens ?? config.llm.max_tokens;
  const model = writing.model || null;
  const systemLen = systemContent.length;

  log.info(`└─ buildWritingPrompt DONE  session=${sid}  msgs=${messages.length}  system=${fmtK(systemLen)}  +${Date.now() - t0}ms  temp=${temperature}  max=${maxTokens}`);
  return { messages, temperature, maxTokens, model, recallHitCount };
}
