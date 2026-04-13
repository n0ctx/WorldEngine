/**
 * 提示词组装器 — 此文件一旦完成即锁定，顺序不得修改
 *
 * 组装顺序（硬编码，不得调整）：
 *   [1] 全局 System Prompt
 *   [2] 用户 Persona（均为空则整段跳过）
 *   [3] 世界 System Prompt
 *   [4] 角色 System Prompt
 *   [1-4] 合并为单个 role:system 消息
 *   [5] Prompt 条目（命中→content，未命中→summary，追加到 system 消息末尾）
 *   [6] 记忆召回内容（占位，T21 填入）
 *   [7] 历史消息（含附件的消息转换为 vision 数组格式）
 *   [8] 当前用户消息 — 由调用方传入，不在此函数内添加
 *
 * 对外暴露：
 *   buildPrompt(sessionId) → Promise<{ messages, temperature, maxTokens }>
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getSessionById } from '../db/queries/sessions.js';
import { getCharacterById } from '../db/queries/characters.js';
import { getWorldById } from '../db/queries/worlds.js';
import { getMessagesBySessionId } from '../db/queries/messages.js';
import {
  getAllGlobalEntries,
  getAllWorldEntries,
  getAllCharacterEntries,
} from '../db/queries/prompt-entries.js';
import { getConfig } from '../services/config.js';
import { matchEntries } from './entry-matcher.js';
import { renderWorldState, renderCharacterState, renderTimeline } from '../memory/recall.js';

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
 * @returns {Promise<{ messages: Array, temperature: number, maxTokens: number }>}
 */
export async function buildPrompt(sessionId) {
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

  // [2] 用户 Persona（两者均为空则跳过整段）
  const personaName = world.persona_name || '';
  const personaPrompt = world.persona_prompt || '';
  if (personaName || personaPrompt) {
    const lines = ['[用户人设]'];
    if (personaName) lines.push(`名字：${personaName}`);
    if (personaPrompt) lines.push(personaPrompt);
    systemParts.push(lines.join('\n'));
  }

  // [3] 世界 System Prompt
  if (world.system_prompt) {
    systemParts.push(world.system_prompt);
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

  // [6] 状态与记忆注入（世界状态 + 角色状态 + 世界时间线）
  const worldStateText = renderWorldState(world.id);
  const characterStateText = renderCharacterState(character.id);
  const timelineText = renderTimeline(world.id);
  const recallParts = [worldStateText, characterStateText, timelineText].filter(Boolean);
  if (recallParts.length > 0) {
    systemParts.push(recallParts.join('\n\n'));
  }
  // TODO 未来：embedding 搜索历史 session summary，渐进式展开原文

  // [1-6] 合并为单个 role:system 消息
  const messages = [];
  if (systemParts.length > 0) {
    messages.push({ role: 'system', content: systemParts.join('\n\n') });
  }

  // [7] 历史消息
  const history = getMessagesBySessionId(sessionId, 9999, 0);
  for (const msg of history) {
    messages.push(formatMessageForLLM(msg));
  }

  // [8] 当前用户消息 — 由调用方传入，不在此处添加

  // 生成参数：世界级 > 全局
  const temperature = world.temperature ?? config.llm.temperature;
  const maxTokens = world.max_tokens ?? config.llm.max_tokens;

  return { messages, temperature, maxTokens };
}
