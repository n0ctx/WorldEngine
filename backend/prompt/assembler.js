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

// ─── asst_context 清洗：剥除 "AI：" 前缀和末尾状态块，防止 LLM 模仿格式 ──

function stripAsstContext(raw) {
  const segments = raw.split('\n\n');
  if (segments[0].startsWith('AI：')) segments[0] = segments[0].slice(3);
  // 末尾若有状态块（形如 "[…状态]\n…"），逐一去除
  while (segments.length > 1) {
    const last = segments[segments.length - 1];
    if (last.startsWith('[') && last.includes('状态]')) {
      segments.pop();
    } else {
      break;
    }
  }
  return segments.join('\n\n');
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
  const globalEntries = getAllGlobalEntries();
  const worldEntries = getAllWorldEntries(world.id);
  const characterEntries = getAllCharacterEntries(character.id);
  const allEntries = [...globalEntries, ...worldEntries, ...characterEntries];

  const triggeredIds = await matchEntries(sessionId, allEntries);

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

  // [13] 展开原文（AI preflight 决策）
  if (recalled.length > 0 && config.memory_expansion_enabled !== false) {
    onRecallEvent?.('memory_expand_start', {
      candidates: recalled.map((r) => ({ ref: r.ref, title: r.session_title })),
    });

    const toExpand = await decideExpansion({ sessionId, recalled, recentMessagesText });
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
    // asst_context 去除 "AI：" 前缀和状态块，防止 LLM 模仿格式输出状态
    for (const record of turnRecords) {
      messages.push({ role: 'user',      content: applyRules(record.user_context, 'prompt_only', world.id) });
      messages.push({ role: 'assistant', content: applyRules(stripAsstContext(record.asst_context), 'prompt_only', world.id) });
    }
  } else {
    // 降级路径：session 尚无任何 turn record，用旧的 uncompressed messages
    // 去掉最后一条 user 消息（将在 [16] 单独追加）
    const history = getUncompressedMessagesBySessionId(sessionId);
    const withoutLastUser = history.slice(0, history.length - 1);
    for (const msg of withoutLastUser) {
      const content = applyRules(msg.content, 'prompt_only', world.id);
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
    const content = applyRules(currentUserMsg.content, 'prompt_only', world.id);
    messages.push(formatMessageForLLM({ ...currentUserMsg, content }));
  }

  // 生成参数：世界级 > 全局
  const temperature = world.temperature ?? config.llm.temperature;
  const maxTokens = world.max_tokens ?? config.llm.max_tokens;

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

  // 模板变量上下文：共享段用首个激活角色名作为 {{char}} fallback
  const firstCharName = activeCharacters[0]?.name || '';
  const ctx = { user: personaName, char: firstCharName, world: world.name };
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

  for (const character of activeCharacters) {
    // per-character 段使用该角色自身的名字替换 {{char}}
    const tvChar = (t) => applyTemplateVars(t, { ...ctx, char: character.name });
    if (character.system_prompt) {
      systemParts.push(tvChar(`[{{char}}人设]\n${character.system_prompt}`));
    }
    const charStateText = renderCharacterState(character.id);
    if (charStateText) systemParts.push(tvChar(charStateText));
  }

  // [8-10] Prompt 条目（全局→世界→各激活角色）
  const globalEntries = getAllGlobalEntries();
  const worldEntries = getAllWorldEntries(world.id);
  const allCharacterEntries = [];
  for (const character of activeCharacters) {
    const entries = getAllCharacterEntries(character.id);
    allCharacterEntries.push(...entries);
  }
  const allEntries = [...globalEntries, ...worldEntries, ...allCharacterEntries];

  const triggeredIds = await matchEntries(sessionId, allEntries);

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
  const K = config.context_history_rounds ?? 10;
  const turnRecords = getTurnRecordsBySessionId(sessionId, K);
  const allHistory = getUncompressedMessagesBySessionId(sessionId);

  if (turnRecords.length > 0) {
    for (const record of turnRecords) {
      messages.push({ role: 'user',      content: applyRules(record.user_context, 'prompt_only', world.id) });
      messages.push({ role: 'assistant', content: applyRules(stripAsstContext(record.asst_context), 'prompt_only', world.id) });
    }
  } else {
    // 降级路径：session 尚无任何 turn record
    const withoutLastUser = allHistory.slice(0, allHistory.length - 1);
    for (const msg of withoutLastUser) {
      const content = applyRules(msg.content, 'prompt_only', world.id);
      messages.push(formatMessageForLLM({ ...msg, content }));
    }
  }

  // [15] 后置提示词（全局→世界，写作模式无角色后置提示词）
  const postParts = [config.global_post_prompt, world.post_prompt].filter(Boolean).map(tv);
  if (postParts.length > 0) {
    messages.push({ role: 'user', content: postParts.join('\n\n') });
  }

  // [16] 当前用户消息
  const currentUserMsg = [...allHistory].reverse().find((m) => m.role === 'user');
  if (currentUserMsg) {
    const content = applyRules(currentUserMsg.content, 'prompt_only', world.id);
    messages.push(formatMessageForLLM({ ...currentUserMsg, content }));
  }

  const temperature = world.temperature ?? config.llm.temperature;
  const maxTokens = world.max_tokens ?? config.llm.max_tokens;

  return { messages, temperature, maxTokens };
}
