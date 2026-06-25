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
 *   [8]  世界 State 条目              │ 动态后缀
 *   [8.5] 长期记忆（开关启用时）      │ （每轮变化）
 *   [9]  召回摘要                     │
 *   [10] 展开原文                     │
 *   [11] 日记注入                    ┘
 *
 *   [历史消息：role:user/assistant 交替]
 *   [12] 历史消息（稳定使用原始 messages 窗口）
 *
 *   [BOTTOM: 历史之后]
 *   [13+14] 后置提示词 + 当前用户消息（合并为一条 user message；后置提示词追加在用户消息之后）
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
  renderTransientNearby,
  renderSavedNearbyIndex,
  renderRecalledSavedNearby,
  searchRecalledSummaries,
  renderRecalledSummaries,
} from '../memory/recall.js';
import { decideExpansion, renderExpandedTurnRecords } from '../memory/summary-expander.js';
import { decideSavedNearbyRecall } from '../memory/saved-nearby-recall.js';
import { listNearbyBySessionId } from '../db/queries/session-nearby-characters.js';
import { getCharacterStateFieldsByWorldId } from '../db/queries/character-state-fields.js';
import { readMemoryFile as readLongTermMemory } from '../services/long-term-memory.js';
import { readTables } from '../services/table-memory.js';
import { renderTablesToMarkdown } from '../services/table-memory-ops.js';
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

// [8.6] 表格记忆注入：结构化真源渲染成 md（主模型版不含内部 id），开关启用时追加到 system。
// 聊天 / 写作两条装配链共用，避免重复。
function injectTableMemory(dynamicSystemParts, sessionId, enabled) {
  if (enabled !== true) return;
  const md = renderTablesToMarkdown(readTables(sessionId), { withId: false });
  if (!md) return;
  dynamicSystemParts.push(`<table_memory hint="以下为当前已知状态，供保持连贯参考；剧情走向以玩家本轮输入为准。其中「定局表」为已成定局、不可自相矛盾的红线（别写穿帮），其余为当前状态快照">\n${md}\n</table_memory>`);
  log.debug(`│  [8.6] table memory injected  chars=${md.length}`);
}

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

// keepLatestUser：续写模式不摘除最后一条 user。普通生成时最后一条 user 是"本轮新输入"，
// 由 getCurrentUserMessage 单独重贴到末尾，故历史里要先摘掉它；续写没有新输入，最后一条是
// assistant，强行摘除其前的 user 会破坏轮次交替并让待续写 assistant 错位，故保留全窗口原序。
function sliceCompletedHistoryByRounds(messages, rounds, { keepLatestUser = false } = {}) {
  const history = keepLatestUser ? messages : omitLatestUserMessage(messages);
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
 *   Cached system [1, 2, 3, 4]：全局 + 常驻 cached 条目 + 玩家 + 角色
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
  const { onRecallEvent, diaryInjection, continuation = false } = options;
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

  // ─── CACHED LAYER (1, 2, 3, 4) ───
  // [1] 全局 System Prompt
  if (config.global_system_prompt) {
    cachedSystemParts.push(tv(config.global_system_prompt));
  }

  // [2] 常驻 cached 条目（trigger_type=always 且 token=0）
  // 拼到 cachedSystemParts 末尾，按 sort_order ASC, created_at ASC 稳定排序，保证 prompt cache 命中。
  const allWorldEntries = getAllWorldEntries(world.id).filter((e) => e.enabled !== 0);
  const cachedEntries = allWorldEntries
    .filter((entry) => entry.trigger_type === 'always' && entry.token === 0 && entry.content);
  if (cachedEntries.length > 0) {
    const cachedTexts = cachedEntries.map((entry) => `【${tv(entry.title)}】\n${tv(entry.content)}`);
    cachedSystemParts.push(`<world_entries>\n${cachedTexts.join('\n\n')}\n</world_entries>`);
    log.debug(`│  [2] cached entries  count=${cachedEntries.length}`);
  }

  // [3] 玩家 System Prompt
  if (personaName || personaPrompt) {
    const lines = [];
    if (personaName) lines.push(`名字：${personaName}`);
    if (personaPrompt) lines.push(tv(personaPrompt));
    cachedSystemParts.push(tv(`<user_info>\n${lines.join('\n')}\n</user_info>`));
  }

  // [4] 角色 System Prompt
  if (character.system_prompt) {
    cachedSystemParts.push(tv(`<char_info>\n${character.system_prompt}\n</char_info>`));
  }

  // ─── DYNAMIC LAYER (5-11) ───
  // [5] 世界状态
  const worldStateText = renderWorldState(world.id, sessionId);
  if (worldStateText) dynamicSystemParts.push(`<world_state>\n${tv(worldStateText)}\n</world_state>`);

  // [6] 玩家状态
  const personaStateText = renderPersonaState(world.id, sessionId);
  if (personaStateText) dynamicSystemParts.push(`<user_state>\n${tv(personaStateText)}\n</user_state>`);

  // [7] 角色状态
  const characterStateText = renderCharacterState(character.id, sessionId);
  if (characterStateText) dynamicSystemParts.push(`<char_state>\n${tv(characterStateText)}\n</char_state>`);

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
    dynamicSystemParts.push(`<world_entries>\n${entryTexts.join('\n\n')}\n</world_entries>`);
  }

  // [8.5] 长期记忆（会话级 md 文件，开关启用时注入）
  if (config.long_term_memory_enabled === true) {
    const ltm = readLongTermMemory(sessionId).trim();
    if (ltm) {
      dynamicSystemParts.push(`<long_term_memory>\n${tv(ltm)}\n</long_term_memory>`);
      log.debug(`│  [8.5] long-term memory injected  chars=${ltm.length}`);
    }
  }

  // [8.6] 表格记忆
  injectTableMemory(dynamicSystemParts, sessionId, config.table_memory_enabled);

  // [9] 召回摘要（向量搜索历史 turn summaries，排除当前上下文窗口内的轮次）
  const { recalled } = await searchRecalledSummaries(world.id, sessionId);
  const recalledSummariesText = renderRecalledSummaries(recalled);
  const recallHitCount = recalled.length;
  if (recalledSummariesText) dynamicSystemParts.push(`<recalled_memories>\n${tv(recalledSummariesText)}\n</recalled_memories>`);
  if (recallHitCount > 0) log.debug(`│  [9] recall  hits=${recallHitCount}`);
  onRecallEvent?.('memory_recall_done', { hit: recallHitCount });

  // [10] 记忆展开（由 AI 决定需要展开哪些原文）
  let expandedText;
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
        dynamicSystemParts.push(`<expanded_dialogues>\n${tv(expandedText)}\n</expanded_dialogues>`);
        log.debug(`│  [10] expand  ids=${expandIds.length}`);
      }
      onRecallEvent?.('memory_expand_done', { expanded: expandedText ? expandIds : [] });
    } else {
      onRecallEvent?.('memory_expand_done', { expanded: [] });
    }
  }

  // [11] 日记注入（一次性，仅本轮生效）
  if (diaryInjection && typeof diaryInjection === 'string') {
    dynamicSystemParts.push(`<diary>\n${diaryInjection}\n</diary>`);
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
  const history = sliceCompletedHistoryByRounds(uncompressedMessages, config.context_history_rounds ?? 12, { keepLatestUser: continuation });
  for (const msg of history) {
    let content = applyRules(msg.content, 'prompt_only', world.id, 'chat');
    if (config.suggestion_enabled && msg.role === 'assistant' && msg.next_options?.length > 0) {
      const optionsText = applyRules(msg.next_options.join('\n'), 'prompt_only', world.id, 'chat');
      content += `\n\n<next_prompt>\n${optionsText}\n</next_prompt>`;
    }
    messages.push(formatMessageForLLM({ ...msg, content }));
  }
  log.debug(`│  [12] history  raw_messages=${history.length}`);

  // [13+14] 后置提示词 + 当前用户消息：合并为一条 user message，后置提示词追加在用户消息之后。
  // 续写模式无"本轮新输入"，且后置提示词/suggestion 由 buildContinuationMessages 在续写指令里统一拼一次，
  // 这里整体跳过，避免重复注入与轮次错乱（prompt 自然以待续写的 assistant 收尾）。
  if (!continuation) {
    const postParts = [
      config.global_post_prompt,
      character.post_prompt,
    ].filter(Boolean).map(tv);
    // character.post_prompt 为空时自动注入角色名兜底，防止长对话后身份漂移
    if (!character.post_prompt) {
      postParts.push(tv('（你正在扮演{{char}}，请严格保持角色名字和设定。）'));
    }
    if (config.suggestion_enabled) postParts.push(tv(SUGGESTION_PROMPT));

    const currentUserMsg = getCurrentUserMessage(uncompressedMessages);
    if (currentUserMsg?.role === 'user') {
      const content = applyRules(currentUserMsg.content, 'prompt_only', world.id, 'chat');
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
 * 写作版本：写作模式没有固定角色身份，[4] 角色 System Prompt 不注入；
 * 角色出场由叙事文本自行驱动，[7] 角色状态段由"附近角色池（nearby）"替代，
 * nearby 由副 LLM 维护状态，主写作模型据此沿用既定名字与状态。
 *
 * Cached layer: [1] 全局、[2] 常驻 cached 条目、[3] 玩家
 * Dynamic layer: [5] 世界状态 / [6] 玩家状态 / [7] 附近角色（nearby_characters）
 *                / [8] 世界条目 / [8.5] 长期记忆
 *                / [9] 召回摘要 / [10] 记忆展开 / [11] 日记
 * Bottom: [12] 历史消息，[13+14] 后置提示词 + 当前消息（合并为一条 user message）
 *
 * @param {string} sessionId
 * @param {object} [options]
 * @param {Function} [options.onRecallEvent]  (name: string, payload: object) => void
 * @returns {Promise<{ messages: Array, temperature: number, maxTokens: number, model: string|null, recallHitCount: number }>}
 */
export async function buildWritingPrompt(sessionId, options = {}) {
  const { onRecallEvent, diaryInjection, skipWritingInstructions, continuation = false } = options;
  const session = getSessionById(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  const world = getWorldById(session.world_id);
  if (!world) throw new Error(`World not found: ${session.world_id}`);

  const config = getConfig();
  const writing = config.writing || {};
  const cachedSystemParts = [];
  const dynamicSystemParts = [];
  const sid = sessionId.slice(0, 8);
  const t0 = Date.now();

  const persona = getOrCreatePersona(world.id);
  const personaName = persona?.name || '';
  const personaPrompt = persona?.system_prompt || '';

  log.info(`┌─ buildWritingPrompt  session=${sid}  world="${world.name}"`);

  // 写作模式没有单一"主角色"概念（writing_session_characters 表已废弃），
  // 全局 / 世界条目 / 历史摘要里的 {{char}} 没有合适的统一替换值：
  // 替换成"叙述者"会让所有 {{char}} 都被同化成同一标签（之前的 bug）；
  // 这里改为保留 {{char}} 字面量交给 LLM 按上下文判断，nearby_characters 渲染
  // 时另在 renderTransientNearby / renderSavedNearbyIndex / renderRecalledSavedNearby 内部按每个 nearby 名字单独替换。
  const tv = (t) => applyTemplateVars(t, {
    user: personaName,
    char: null,
    world: world.name,
  });

  // ─── CACHED LAYER (1, 2, 3) ───
  // [1] 全局 System Prompt（使用写作专属配置；impersonate 时跳过）
  if (writing.global_system_prompt && !skipWritingInstructions) {
    cachedSystemParts.push(tv(writing.global_system_prompt));
  }

  // [2] 常驻 cached 条目（trigger_type=always 且 token=0）
  // 写作模式下 cached layer 含 [1][2][3]，cached 条目拼到其后；按 sort_order ASC, created_at ASC 稳定。
  const allWorldEntries = getAllWorldEntries(world.id).filter((e) => e.enabled !== 0);
  const cachedEntries = allWorldEntries
    .filter((entry) => entry.trigger_type === 'always' && entry.token === 0 && entry.content);
  if (cachedEntries.length > 0) {
    const cachedTexts = cachedEntries.map((entry) => `【${tv(entry.title)}】\n${tv(entry.content)}`);
    cachedSystemParts.push(`<world_entries>\n${cachedTexts.join('\n\n')}\n</world_entries>`);
    log.debug(`│  [2] cached entries  count=${cachedEntries.length}`);
  }

  // [3] 玩家 System Prompt（写作模式下仅作背景参考，不是 AI 身份设定）
  if (personaName || personaPrompt) {
    const lines = [];
    if (personaName) lines.push(`名字：${personaName}`);
    if (personaPrompt) lines.push(tv(personaPrompt));
    cachedSystemParts.push(tv(`<user_info>\n${lines.join('\n')}\n</user_info>`));
  }

  // ─── DYNAMIC LAYER (5-11；写作模式下 [4] 角色 system prompt 与 [7] 角色状态段不注入) ───
  // [5] 世界状态
  const worldStateText = renderWorldState(world.id, sessionId);
  if (worldStateText) dynamicSystemParts.push(`<world_state>\n${tv(worldStateText)}\n</world_state>`);

  // [6] 玩家状态
  const personaStateText = renderPersonaState(world.id, sessionId);
  if (personaStateText) dynamicSystemParts.push(`<user_state>\n${tv(personaStateText)}\n</user_state>`);

  // [7] 附近角色（写作模式专属，替代 chat 模式的 character_state）
  // - transient（is_saved=0）：完整 name + 底层人设 + state
  // - saved（is_saved=1）：仅 name + 底层人设（线索清单）；其完整 state 由 [10.5] 按需召回
  // 一次拉取 nearby 行与 fields，[7] 与 [10.5] 共享，避免每轮重复查询
  const allNearby = listNearbyBySessionId(sessionId);
  const transientRows = allNearby.filter((r) => Number(r.is_saved) !== 1);
  const savedRows = allNearby.filter((r) => Number(r.is_saved) === 1);
  const nearbyFields = allNearby.length > 0
    ? getCharacterStateFieldsByWorldId(world.id).filter((f) => Number(f.nearby_enabled) === 1)
    : [];
  const transientText = renderTransientNearby(transientRows, nearbyFields);
  const savedIndexText = renderSavedNearbyIndex(savedRows);
  if (transientText || savedIndexText) {
    const sections = [
      '以下角色已在本会话登场。叙述中若涉及这些人物，必须沿用其既定名字，不要另起新名。',
    ];
    if (transientText) {
      sections.push(`【当前登场】\n${tv(transientText)}`);
    }
    if (savedIndexText) {
      sections.push(
        `【已保存角色（仅列底层人设，其当前状态系统会按需补充）】\n${tv(savedIndexText)}`,
      );
    }
    dynamicSystemParts.push(`<nearby_characters>\n${sections.join('\n\n')}\n</nearby_characters>`);
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
  if (entryTexts.length > 0) dynamicSystemParts.push(`<world_entries>\n${entryTexts.join('\n\n')}\n</world_entries>`);

  // [8.5] 长期记忆（会话级 md 文件，开关启用时注入）
  if (writing.long_term_memory_enabled === true) {
    const ltm = readLongTermMemory(sessionId).trim();
    if (ltm) {
      dynamicSystemParts.push(`<long_term_memory>\n${tv(ltm)}\n</long_term_memory>`);
      log.debug(`│  [8.5] long-term memory injected (writing)  chars=${ltm.length}`);
    }
  }

  // [8.6] 表格记忆
  injectTableMemory(dynamicSystemParts, sessionId, writing.table_memory_enabled);

  // [9] 召回摘要（向量搜索历史 turn summaries，排除当前上下文窗口内的轮次）
  const { recalled } = await searchRecalledSummaries(world.id, sessionId);
  const recalledSummariesText = renderRecalledSummaries(recalled);
  const recallHitCount = recalled.length;
  if (recalledSummariesText) dynamicSystemParts.push(`<recalled_memories>\n${tv(recalledSummariesText)}\n</recalled_memories>`);
  if (recallHitCount > 0) log.debug(`│  [9] recall  hits=${recallHitCount}`);
  onRecallEvent?.('memory_recall_done', { hit: recallHitCount });

  // [10] 记忆展开 / [10.5] saved nearby preflight 召回
  // 两个 preflight LLM 判定彼此独立，并发触发以节省一个 aux RTT。
  // saved 池子小（N ≤ SAVED_RECALL_PREFLIGHT_MIN-1）时，judge 固定开销摊不开，
  // 直接全量注入比走 aux LLM 更省 token 也避免漏判风险。
  const SAVED_RECALL_PREFLIGHT_MIN = 4;
  const runExpand = recallHitCount > 0 && writing.memory_expansion_enabled !== false;
  const runSavedRecall = writing.saved_nearby_recall_enabled !== false && savedRows.length > 0;
  const needSavedJudge = runSavedRecall && savedRows.length >= SAVED_RECALL_PREFLIGHT_MIN;

  if (runExpand) {
    onRecallEvent?.('memory_expand_start', { candidates: recalled.map((r) => ({
      ref: r.ref,
      turn_record_id: r.turn_record_id,
      session_id: r.session_id,
      session_title: r.session_title,
      round_index: r.round_index,
      created_at: r.created_at,
    })) });
  }

  const [expandIds, judgedSavedIds] = await Promise.all([
    runExpand ? decideExpansion({ sessionId, recalled }) : Promise.resolve([]),
    needSavedJudge ? decideSavedNearbyRecall({ sessionId, savedRows }) : Promise.resolve([]),
  ]);

  if (runExpand) {
    if (expandIds.length > 0) {
      const expandedText = renderExpandedTurnRecords(expandIds, MEMORY_EXPAND_MAX_TOKENS);
      if (expandedText) {
        dynamicSystemParts.push(`<expanded_dialogues>\n${tv(expandedText)}\n</expanded_dialogues>`);
        log.debug(`│  [10] expand  ids=${expandIds.length}`);
      }
      onRecallEvent?.('memory_expand_done', { expanded: expandedText ? expandIds : [] });
    } else {
      onRecallEvent?.('memory_expand_done', { expanded: [] });
    }
  }

  if (runSavedRecall) {
    const hitIds = needSavedJudge ? judgedSavedIds : savedRows.map((r) => r.id);
    if (hitIds.length > 0) {
      const recalledSavedText = renderRecalledSavedNearby(savedRows, nearbyFields, hitIds);
      if (recalledSavedText) {
        dynamicSystemParts.push(
          `<recalled_characters>\n以下已保存角色与本轮相关，提供其当前完整状态以供叙事使用。\n${tv(recalledSavedText)}\n</recalled_characters>`,
        );
        log.debug(`│  [10.5] saved-recall  hits=${hitIds.length} (${needSavedJudge ? 'judge' : 'all-in'})`);
      }
    }
    onRecallEvent?.('saved_recall_done', { hit: hitIds.length, ids: hitIds, mode: needSavedJudge ? 'judge' : 'all-in' });
  }

  // [11] 日记注入（一次性，仅本轮生效）
  if (diaryInjection && typeof diaryInjection === 'string') {
    dynamicSystemParts.push(`<diary>\n${diaryInjection}\n</diary>`);
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
    { keepLatestUser: continuation },
  );
  for (const msg of history) {
    let content = applyRules(msg.content, 'prompt_only', world.id, 'writing');
    if (writing.suggestion_enabled && msg.role === 'assistant' && msg.next_options?.length > 0) {
      const optionsText = applyRules(msg.next_options.join('\n'), 'prompt_only', world.id, 'writing');
      content += `\n\n<next_prompt>\n${optionsText}\n</next_prompt>`;
    }
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

    const currentUserMsg = getCurrentUserMessage(uncompressedMessages);
    if (currentUserMsg?.role === 'user') {
      const content = applyRules(currentUserMsg.content, 'prompt_only', world.id, 'writing');
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
