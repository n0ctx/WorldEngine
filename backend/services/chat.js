import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getSessionById } from '../db/queries/sessions.js';
import { getCharacterById } from '../db/queries/characters.js';
import { getWorldById } from '../db/queries/worlds.js';
import { getMessagesBySessionId, updateMessageAttachments } from '../db/queries/messages.js';
import { MAX_ATTACHMENTS_PER_MESSAGE, MAX_ATTACHMENT_SIZE_MB } from '../utils/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ATTACHMENTS_DIR = path.resolve(__dirname, '..', '..', 'data', 'uploads', 'attachments');

// ── 进行中的流式请求 ──
// Map<sessionId, AbortController>
export const activeStreams = new Map();

// ── MIME → 扩展名 ──
const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'application/pdf': 'pdf',
};

/**
 * 保存 base64 附件到磁盘，并更新消息的 attachments 字段
 * @param {string} messageId
 * @param {Array<{type, data, mimeType}>} attachments
 */
export function saveAttachments(messageId, attachments) {
  if (!attachments || attachments.length === 0) return;

  const paths = [];
  const limit = Math.min(attachments.length, MAX_ATTACHMENTS_PER_MESSAGE);

  for (let i = 0; i < limit; i++) {
    const att = attachments[i];
    const ext = MIME_EXT[att.mimeType] || 'bin';
    const filename = `${messageId}_${i}.${ext}`;
    const absPath = path.join(ATTACHMENTS_DIR, filename);

    const buf = Buffer.from(att.data, 'base64');
    if (buf.length > MAX_ATTACHMENT_SIZE_MB * 1024 * 1024) continue;

    fs.writeFileSync(absPath, buf);
    paths.push(`attachments/${filename}`);
  }

  if (paths.length > 0) {
    updateMessageAttachments(messageId, paths);
  }
}

/**
 * 读取附件文件并转为 base64 data URL
 */
function readAttachmentAsDataUrl(relativePath) {
  const absPath = path.resolve(__dirname, '..', '..', 'data', 'uploads', relativePath);
  if (!fs.existsSync(absPath)) return null;

  const buf = fs.readFileSync(absPath);
  const ext = path.extname(absPath).slice(1).toLowerCase();
  const mimeMap = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', pdf: 'application/pdf',
  };
  const mime = mimeMap[ext] || 'application/octet-stream';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/**
 * 将消息转换为 LLM messages 数组格式
 * 含附件的消息 content 转换为 OpenAI vision 数组格式
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

/**
 * 构建上下文 messages 数组（简化版，后续 assembler.js 接管）
 * 当前：[system_prompt, ...历史消息]
 */
export function buildContext(sessionId) {
  const session = getSessionById(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  const character = getCharacterById(session.character_id);
  if (!character) throw new Error(`Character not found: ${session.character_id}`);

  const world = getWorldById(character.world_id);

  const messages = [];

  // system prompt（世界 + 角色拼接，后续 assembler.js 接管）
  const systemParts = [];
  if (world?.system_prompt) systemParts.push(world.system_prompt);
  if (character.system_prompt) systemParts.push(character.system_prompt);
  if (systemParts.length > 0) {
    messages.push({ role: 'system', content: systemParts.join('\n\n') });
  }

  // 历史消息（全部加载，后续 token 截断处理）
  const history = getMessagesBySessionId(sessionId, 9999, 0);
  for (const msg of history) {
    messages.push(formatMessageForLLM(msg));
  }

  // 生成参数覆盖：世界级 > 全局
  const overrides = {};
  if (world?.temperature != null) overrides.temperature = world.temperature;
  if (world?.max_tokens != null) overrides.maxTokens = world.max_tokens;

  return { messages, overrides };
}
