/**
 * 提示词组装器 — 此文件一旦完成即锁定，顺序不得修改
 *
 * 组装顺序（硬编码，不得调整）：
 *   [system 消息，[1]–[13] 合并为单个 role:system]
 *   [1]  全局 System Prompt
 *   [2]  世界 System Prompt
 *   [3]  世界状态
 *   [4]  玩家 System Prompt（均为空则跳过）
 *   [5]  玩家状态
 *   [6]  角色 System Prompt
 *   [7]  角色状态
 *   [8]  全局 Prompt 条目（命中→content，未命中→summary）
 *   [9]  世界 Prompt 条目
 *   [10] 角色 Prompt 条目
 *   [11] 世界时间线
 *   [12] 召回摘要（向量搜索历史 turn summaries）
 *   [13] 展开原文（AI preflight 决策后的 turn record 原文）
 *   [历史消息：role:user/assistant 交替]
 *   [14] 历史消息（turn records 新路径；无 turn records 时降级为 uncompressed messages）
 *   [尾部 user 消息]
 *   [15] 后置提示词（全局→世界→角色，均空跳过）
 *   [16] 当前用户消息
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
import { getTurnRecordsBySessionId } from '../db/queries/turn-records.js';
import {
  getAllGlobalEntries,
  getAllWorldEntries,
  getAllCharacterEntries,
} from '../db/queries/prompt-entries.js';
import { getConfig } from '../services/config.js';
import { matchEntries } from './entry-matcher.js';
import {
  renderPersonaState,
  renderWorldState,
  renderCharacterState,
  renderTimeline,
  searchRecalledSummaries,
  renderRecalledSummaries,
} from '../memory/recall.js';
import { decideExpansion, renderExpandedTurnRecords } from '../memory/summary-expander.js';
import { MEMORY_EXPAND_MAX_TOKENS } from '../utils/constants.js';
import { getOrCreatePersona } from '../services/personas.js';
import { applyRules } from '../utils/regex-runner.js';
import { applyTemplateVars } from '../utils/template-vars.js';
import { stripAsstContext, stripUserContext } from '../utils/turn-dialogue.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('assembler', 'magenta');

/** 将字符数格式化为可读单位，如 3241 → '3.2k' */
function fmtK(n) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`; }

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.resolve(__dirname, '..', '..', 'data', 'uploads');

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
  const { onRecallEvent } = options;
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

  // [4] 玩家 System Prompt（均为空则跳过）
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

  // [2] 世界 System Prompt
  if (world.system_prompt) {
    systemParts.push(tv(world.system_prompt));
  }

  // [3] 世界状态
  const worldStateText = renderWorldState(world.id);
  if (worldStateText) systemParts.push(tv(worldStateText));

  if (personaName || personaPrompt) {
    const lines = ['[{{user}}人设]'];
    if (personaName) lines.push(`名字：${personaName}`);
    if (personaPrompt) lines.push(tv(personaPrompt));
    systemParts.push(tv(lines.join('\n')));
  }

  // [5] 玩家状态
  const personaStateText = renderPersonaState(world.id);
  if (personaStateText) systemParts.push(tv(personaStateText));

  // [6] 角色 System Prompt
  if (character.system_prompt) {
    systemParts.push(tv(`[{{char}}人设]\n${character.system_prompt}`));
  }

  // [7] 角色状态
  const characterStateText = renderCharacterState(character.id);
  if (characterStateText) systemParts.push(tv(characterStateText));

  // [8-10] Prompt 条目（全局→世界→角色顺序）
  const globalEntries = getAllGlobalEntries('chat');
  const worldEntries = getAllWorldEntries(world.id);
  const characterEntries = getAllCharacterEntries(character.id);
  const allEntries = [...globalEntries, ...worldEntries, ...characterEntries];

  const triggeredIds = await matchEntries(sessionId, allEntries);
  log.debug(`│  [8-10] entries  global=${globalEntries.length}  world=${worldEntries.length}  char=${characterEntries.length}  triggered=${triggeredIds.size}/${allEntries.length}`);

  const entryTexts = [];
  for (const entry of allEntries) {
    if (triggeredIds.has(entry.id)) {
      if (entry.content) entryTexts.push(tv(entry.content));
    } else {
      if (entry.summary) entryTexts.push(tv(entry.summary));
    }
  }
  if (entryTexts.length > 0) {
    systemParts.push(entryTexts.join('\n\n'));
  }

  // [11] 世界时间线
  const timelineText = renderTimeline(world.id);
  if (timelineText) systemParts.push(tv(timelineText));

  // [12] 召回摘要（向量搜索历史 turn summaries）
  const { recalled, recentMessagesText } = await searchRecalledSummaries(world.id, sessionId);
  const recalledSummariesText = renderRecalledSummaries(recalled);
  const recallHitCount = recalled.length;
  if (recalledSummariesText) systemParts.push(tv(recalledSummariesText));
  log.info(`│  [12]   recall   hits=${recallHitCount}`);

  // [13] 展开原文（AI preflight 决策）
  if (recalled.length > 0 && config.memory_expansion_enabled !== false) {
    onRecallEvent?.('memory_expand_start', {
      candidates: recalled.map((r) => ({ ref: r.ref, title: r.session_title })),
    });

    const toExpand = await decideExpansion({ sessionId, recalled, recentMessagesText });
    log.debug(`│  [13]   expand   candidates=${recalled.length}  chosen=${toExpand.length}`);
    const expandedText = toExpand.length
      ? renderExpandedTurnRecords(toExpand, MEMORY_EXPAND_MAX_TOKENS)
      : '';

    onRecallEvent?.('memory_expand_done', { expanded: toExpand });

    if (expandedText) systemParts.push(tv(expandedText));
  }

  // [1–13] 合并为单个 role:system 消息
  const messages = [];
  if (systemParts.length > 0) {
    messages.push({ role: 'system', content: systemParts.join('\n\n') });
  }

  // [14] 历史消息
  const K = config.context_history_rounds ?? 10;
  const turnRecords = getTurnRecordsBySessionId(sessionId, K);

  if (turnRecords.length > 0) {
    // 新路径：turn records，每条渲染为 user/assistant 对
    log.debug(`│  [14]   history  turn-records ×${turnRecords.length}`);
    for (const record of turnRecords) {
      messages.push({ role: 'user',      content: applyRules(stripUserContext(record.user_context), 'prompt_only', world.id, 'chat') });
      messages.push({ role: 'assistant', content: applyRules(stripAsstContext(record.asst_context), 'prompt_only', world.id, 'chat') });
    }
  } else {
    // 降级路径：session 尚无任何 turn record，用旧的 uncompressed messages
    // 去掉最新一条 user 消息（将在 [16] 单独追加）；若当前还没有 user，保留 assistant 开场白
    const history = getUncompressedMessagesBySessionId(sessionId);
    const withoutLastUser = omitLatestUserMessage(history);
    log.debug(`│  [14]   history  uncompressed ×${withoutLastUser.length}`);
    for (const msg of withoutLastUser) {
      const content = applyRules(msg.content, 'prompt_only', world.id, 'chat');
      messages.push(formatMessageForLLM({ ...msg, content }));
    }
  }

  // [15] 后置提示词（全局→世界→角色，合并为单条 role:user 消息）
  const postParts = [
    config.global_post_prompt,
    world.post_prompt,
    character.post_prompt,
  ].filter(Boolean).map(tv);
  if (postParts.length > 0) {
    messages.push({ role: 'user', content: postParts.join('\n\n') });
  }

  // [16] 当前用户消息（取 DB 中最新的 user 消息）
  const allHistory = getUncompressedMessagesBySessionId(sessionId);
  const currentUserMsg = [...allHistory].reverse().find((m) => m.role === 'user');
  if (currentUserMsg) {
    const content = applyRules(currentUserMsg.content, 'prompt_only', world.id, 'chat');
    messages.push(formatMessageForLLM({ ...currentUserMsg, content }));
  }

  // 生成参数：世界级 > 全局
  const temperature = world.temperature ?? config.llm.temperature;
  const maxTokens = world.max_tokens ?? config.llm.max_tokens;

  const systemLen = messages[0]?.content?.length ?? 0;
  log.info(`└─ buildPrompt DONE  session=${sid}  msgs=${messages.length}  system=${fmtK(systemLen)}  +${Date.now() - t0}ms  temp=${temperature}  max=${maxTokens}`);

  return { messages, temperature, maxTokens, recallHitCount };
}

/**
 * 写作空间提示词组装器
 *
 * 写作模式下没有单一绑定角色，而是一个世界 + 多个激活角色。
 * 组装顺序与 buildPrompt 对齐，但 [6-10] 针对所有激活角色展开。
 * 写作模式无 turn records，使用降级路径（uncompressed messages）。
 *
 * @param {string} sessionId
 * @param {object} [options]
 * @returns {Promise<{ messages: Array, temperature: number, maxTokens: number }>}
 */
export async function buildWritingPrompt(sessionId, options = {}) {
  const session = getSessionById(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  const world = getWorldById(session.world_id);
  if (!world) throw new Error(`World not found: ${session.world_id}`);

  const config = getConfig();
  const systemParts = [];

  // [4] 玩家 System Prompt
  const persona = getOrCreatePersona(world.id);
  const personaName = persona?.name || '';
  const personaPrompt = persona?.system_prompt || '';

  // [6-7] 激活角色 System Prompt + 角色状态（每个角色一段）
  const activeCharacters = getWritingSessionCharacters(sessionId);

  const t0  = Date.now();
  const sid = sessionId.slice(0, 8);
  const charNames = activeCharacters.map((c) => c.name).join(', ');
  log.info(`┌─ buildWritingPrompt  session=${sid}  world="${world.name}"  chars=${activeCharacters.length}${charNames ? `  [${charNames}]` : ''}`);

  // 模板变量上下文：共享段用首个激活角色名作为 {{char}} fallback
  const firstCharName = activeCharacters[0]?.name || '';
  const ctx = { user: personaName, char: firstCharName, world: world.name };
  const tv = (t) => applyTemplateVars(t, ctx);

  const writing = config.writing ?? {};
  const writingLlm = writing.llm ?? {};

  // [1] 全局 System Prompt（使用写作空间专属配置）
  if (writing.global_system_prompt) {
    systemParts.push(tv(writing.global_system_prompt));
  }

  // [2] 世界 System Prompt
  if (world.system_prompt) {
    systemParts.push(tv(world.system_prompt));
  }

  // [3] 世界状态
  const worldStateText = renderWorldState(world.id);
  if (worldStateText) systemParts.push(tv(worldStateText));

  if (personaName || personaPrompt) {
    const lines = ['[{{user}}人设]'];
    if (personaName) lines.push(`名字：${personaName}`);
    if (personaPrompt) lines.push(tv(personaPrompt));
    systemParts.push(tv(lines.join('\n')));
  }

  // [5] 玩家状态
  const personaStateText = renderPersonaState(world.id);
  if (personaStateText) systemParts.push(tv(personaStateText));

  for (const character of activeCharacters) {
    // per-character 段使用该角色自身的名字替换 {{char}}
    const tvChar = (t) => applyTemplateVars(t, { ...ctx, char: character.name });
    if (character.system_prompt) {
      systemParts.push(tvChar(`[{{char}}人设]\n${character.system_prompt}`));
    }
    const charStateText = renderCharacterState(character.id);
    if (charStateText) systemParts.push(tvChar(charStateText));
  }

  // [8-10] Prompt 条目（全局写作条目→世界→各激活角色）
  const globalEntries = getAllGlobalEntries('writing');
  const worldEntries = getAllWorldEntries(world.id);
  const allCharacterEntries = [];
  for (const character of activeCharacters) {
    const entries = getAllCharacterEntries(character.id);
    allCharacterEntries.push(...entries);
  }
  const allEntries = [...globalEntries, ...worldEntries, ...allCharacterEntries];

  const triggeredIds = await matchEntries(sessionId, allEntries);
  log.debug(`│  [8-10] entries  global=${globalEntries.length}  world=${worldEntries.length}  chars=${allCharacterEntries.length}  triggered=${triggeredIds.size}/${allEntries.length}`);

  const entryTexts = [];
  for (const entry of allEntries) {
    if (triggeredIds.has(entry.id)) {
      if (entry.content) entryTexts.push(tv(entry.content));
    } else {
      if (entry.summary) entryTexts.push(tv(entry.summary));
    }
  }
  if (entryTexts.length > 0) {
    systemParts.push(entryTexts.join('\n\n'));
  }

  // [11] 世界时间线
  const timelineText = renderTimeline(world.id);
  if (timelineText) systemParts.push(tv(timelineText));

  // [12-13] 写作模式无向量召回和展开原文

  // [1-13] 合并为单个 role:system 消息
  const messages = [];
  if (systemParts.length > 0) {
    messages.push({ role: 'system', content: systemParts.join('\n\n') });
  }

  // [14] 历史消息（有 turn records 时用新路径，否则降级）
  const K = writing.context_history_rounds ?? config.context_history_rounds ?? 10;
  const turnRecords = getTurnRecordsBySessionId(sessionId, K);
  const allHistory = getUncompressedMessagesBySessionId(sessionId);

  if (turnRecords.length > 0) {
    log.debug(`│  [14]   history  turn-records ×${turnRecords.length}`);
    for (const record of turnRecords) {
      messages.push({ role: 'user',      content: applyRules(record.user_context, 'prompt_only', world.id, 'writing') });
      messages.push({ role: 'assistant', content: applyRules(stripAsstContext(record.asst_context), 'prompt_only', world.id, 'writing') });
    }
  } else {
    // 降级路径：session 尚无任何 turn record
    const withoutLastUser = omitLatestUserMessage(allHistory);
    log.debug(`│  [14]   history  uncompressed ×${withoutLastUser.length}`);
    for (const msg of withoutLastUser) {
      const content = applyRules(msg.content, 'prompt_only', world.id, 'writing');
      messages.push(formatMessageForLLM({ ...msg, content }));
    }
  }

  // [15] 后置提示词（全局写作后置→世界，写作模式无角色后置提示词）
  const postParts = [writing.global_post_prompt, world.post_prompt].filter(Boolean).map(tv);
  if (postParts.length > 0) {
    messages.push({ role: 'user', content: postParts.join('\n\n') });
  }

  // [16] 当前用户消息
  const currentUserMsg = [...allHistory].reverse().find((m) => m.role === 'user');
  if (currentUserMsg) {
    const content = applyRules(currentUserMsg.content, 'prompt_only', world.id, 'writing');
    messages.push(formatMessageForLLM({ ...currentUserMsg, content }));
  }

  const temperature = world.temperature ?? (writingLlm.temperature ?? config.llm.temperature);
  const maxTokens = world.max_tokens ?? (writingLlm.max_tokens ?? config.llm.max_tokens);
  const model = writingLlm.model || config.llm.model;

  const systemLen = messages[0]?.content?.length ?? 0;
  log.info(`└─ buildWritingPrompt DONE  session=${sid}  msgs=${messages.length}  system=${fmtK(systemLen)}  +${Date.now() - t0}ms  temp=${temperature}  max=${maxTokens}`);

  return { messages, temperature, maxTokens, model };
}
