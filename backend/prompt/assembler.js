/**
 * 提示词组装器 — 此文件一旦完成即锁定，顺序不得修改
 *
 * 组装顺序（硬编码，不得调整）：
 *   [1] 全局 System Prompt
 *   [2] 世界 System Prompt
 *   [3] 用户 Persona（均为空则整段跳过）
 *   [4] 角色 System Prompt
 *   [1-4] 合并为单个 role:system 消息
 *   [5] Prompt 条目（命中→content，未命中→summary，追加到 system 消息末尾）
 *   [6] 状态与记忆注入：玩家状态 + 角色状态 + 世界状态 + 时间线 + 召回摘要 + 展开原文（T28）
 *   [7] 历史消息（含附件的消息转换为 vision 数组格式）
 *   [8] 当前用户消息（已包含在历史记录中）+ 后置提示词（全局→世界→角色，合并为单条 role:user 消息）
 *
 * 对外暴露：
 *   buildPrompt(sessionId, options?) → Promise<{ messages, temperature, maxTokens, recallHitCount }>
 *   options.onRecallEvent?: (name, payload) => void  — SSE 回调，T28 的 expand 事件通过此回调发出
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
  getAllGlobalEntries,
  getAllWorldEntries,
  getAllCharacterEntries,
} from '../db/queries/prompt-entries.js';
import { getConfig } from '../services/config.js';
import { matchEntries } from './entry-matcher.js';
import { renderPersonaState, renderWorldState, renderCharacterState, renderTimeline, searchRecalledSummaries, renderRecalledSummaries } from '../memory/recall.js';
import { decideExpansion, renderExpandedSessions } from '../memory/summary-expander.js';
import { MEMORY_EXPAND_MAX_TOKENS } from '../utils/constants.js';
import { getOrCreatePersona } from '../services/personas.js';
import { applyRules } from '../utils/regex-runner.js';

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

// ─── 核心函数 ─────────────────────────────────────────────────────

/**
 * 构建发送给 LLM 的完整 messages 数组
 *
 * 注意：[8] 当前用户消息由调用方传入，不在此函数内读取
 *
 * @param {string} sessionId
 * @param {object} [options]
 * @param {Function} [options.onRecallEvent]  (name: string, payload: object) => void  SSE 事件回调
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

  // [1] 全局 System Prompt
  if (config.global_system_prompt) {
    systemParts.push(config.global_system_prompt);
  }

  // [2] 世界 System Prompt
  if (world.system_prompt) {
    systemParts.push(world.system_prompt);
  }

  // [3] 用户 Persona（两者均为空则跳过整段）
  const persona = getOrCreatePersona(world.id);
  const personaName = persona?.name || '';
  const personaPrompt = persona?.system_prompt || '';
  if (personaName || personaPrompt) {
    const lines = ['[用户人设]'];
    if (personaName) lines.push(`名字：${personaName}`);
    if (personaPrompt) lines.push(personaPrompt);
    systemParts.push(lines.join('\n'));
  }

  // [4] 角色 System Prompt
  if (character.system_prompt) {
    systemParts.push(character.system_prompt);
  }

  // [5] Prompt 条目（全局→世界→角色顺序）
  const globalEntries = getAllGlobalEntries();
  const worldEntries = getAllWorldEntries(world.id);
  const characterEntries = getAllCharacterEntries(character.id);
  const allEntries = [...globalEntries, ...worldEntries, ...characterEntries];

  const triggeredIds = await matchEntries(sessionId, allEntries);

  const entryTexts = [];
  for (const entry of allEntries) {
    if (triggeredIds.has(entry.id)) {
      if (entry.content) entryTexts.push(entry.content);
    } else {
      if (entry.summary) entryTexts.push(entry.summary);
    }
  }
  if (entryTexts.length > 0) {
    systemParts.push(entryTexts.join('\n\n'));
  }

  // [6] 状态与记忆注入（玩家状态 + 角色状态 + 世界状态 + 世界时间线 + 召回摘要 + 展开原文）
  const personaStateText = renderPersonaState(world.id);
  const characterStateText = renderCharacterState(character.id);
  const worldStateText = renderWorldState(world.id);
  const timelineText = renderTimeline(world.id);

  // T27：向量搜索召回摘要
  const { recalled, recentMessagesText } = await searchRecalledSummaries(world.id, sessionId);
  const recalledSummariesText = renderRecalledSummaries(recalled);
  const recallHitCount = recalled.length;

  // T28：AI preflight 决策展开原文
  let expandedText = '';
  if (recalled.length > 0 && config.memory_expansion_enabled !== false) {
    onRecallEvent?.('memory_expand_start', {
      candidates: recalled.map((r) => ({ ref: r.ref, title: r.session_title })),
    });

    const toExpand = await decideExpansion({ sessionId, recalled, recentMessagesText });
    expandedText = toExpand.length ? renderExpandedSessions(toExpand, MEMORY_EXPAND_MAX_TOKENS) : '';

    onRecallEvent?.('memory_expand_done', { expanded: toExpand });
  }

  // [早期对话摘要] 压缩历史（若存在），注入在状态记忆之前
  if (session.compressed_context) {
    systemParts.push(`[早期对话摘要]\n${session.compressed_context}`);
  }

  const recallParts = [personaStateText, characterStateText, worldStateText, timelineText, recalledSummariesText, expandedText].filter(Boolean);
  if (recallParts.length > 0) {
    systemParts.push(recallParts.join('\n\n'));
  }

  // [1-6] 合并为单个 role:system 消息
  const messages = [];
  if (systemParts.length > 0) {
    messages.push({ role: 'system', content: systemParts.join('\n\n') });
  }

  // [7] 历史消息（仅未压缩消息；prompt_only scope：对每条消息的 content 字段应用正则替换，仅影响送入 LLM 的副本）
  const history = getUncompressedMessagesBySessionId(sessionId);
  for (const msg of history) {
    const content = applyRules(msg.content, 'prompt_only', world.id);
    messages.push(formatMessageForLLM({ ...msg, content }));
  }

  // [8] 后置提示词（全局→世界→角色，合并为单条 role:user 消息，插入在历史消息之后）
  const postParts = [
    config.global_post_prompt,
    world.post_prompt,
    character.post_prompt,
  ].filter(Boolean);
  if (postParts.length > 0) {
    messages.push({ role: 'user', content: postParts.join('\n\n') });
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
 * 组装顺序与 buildPrompt 对齐，但 [4][5][6] 针对所有激活角色展开。
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

  // [1] 全局 System Prompt
  if (config.global_system_prompt) {
    systemParts.push(config.global_system_prompt);
  }

  // [2] 世界 System Prompt
  if (world.system_prompt) {
    systemParts.push(world.system_prompt);
  }

  // [3] 用户 Persona
  const persona = getOrCreatePersona(world.id);
  const personaName = persona?.name || '';
  const personaPrompt = persona?.system_prompt || '';
  if (personaName || personaPrompt) {
    const lines = ['[用户人设]'];
    if (personaName) lines.push(`名字：${personaName}`);
    if (personaPrompt) lines.push(personaPrompt);
    systemParts.push(lines.join('\n'));
  }

  // [4] 激活角色 System Prompt（每个角色一段）
  const activeCharacters = getWritingSessionCharacters(sessionId);

  for (const character of activeCharacters) {
    if (character.system_prompt) {
      systemParts.push(`[角色：${character.name}]\n${character.system_prompt}`);
    }
  }

  // [5] Prompt 条目（全局→世界→各激活角色）
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
      if (entry.content) entryTexts.push(entry.content);
    } else {
      if (entry.summary) entryTexts.push(entry.summary);
    }
  }
  if (entryTexts.length > 0) {
    systemParts.push(entryTexts.join('\n\n'));
  }

  // [6] 状态与记忆注入
  const personaStateText = renderPersonaState(world.id);
  const worldStateText = renderWorldState(world.id);
  const timelineText = renderTimeline(world.id);

  // 各激活角色状态
  const charStateTexts = [];
  for (const character of activeCharacters) {
    const t = renderCharacterState(character.id);
    if (t) charStateTexts.push(t);
  }

  // 压缩历史摘要
  if (session.compressed_context) {
    systemParts.push(`[早期对话摘要]\n${session.compressed_context}`);
  }

  const recallParts = [personaStateText, ...charStateTexts, worldStateText, timelineText].filter(Boolean);
  if (recallParts.length > 0) {
    systemParts.push(recallParts.join('\n\n'));
  }

  // [1-6] 合并为单个 role:system 消息
  const messages = [];
  if (systemParts.length > 0) {
    messages.push({ role: 'system', content: systemParts.join('\n\n') });
  }

  // [7] 历史消息
  const history = getUncompressedMessagesBySessionId(sessionId);
  for (const msg of history) {
    const content = applyRules(msg.content, 'prompt_only', world.id);
    messages.push(formatMessageForLLM({ ...msg, content }));
  }

  // [8] 后置提示词（全局→世界，写作模式无角色后置提示词）
  const postParts = [config.global_post_prompt, world.post_prompt].filter(Boolean);
  if (postParts.length > 0) {
    messages.push({ role: 'user', content: postParts.join('\n\n') });
  }

  const temperature = world.temperature ?? config.llm.temperature;
  const maxTokens = world.max_tokens ?? config.llm.max_tokens;

  return { messages, temperature, maxTokens };
}
