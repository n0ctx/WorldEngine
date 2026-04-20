import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { updateMessageAttachments } from '../db/queries/messages.js';
import { MAX_ATTACHMENTS_PER_MESSAGE, MAX_ATTACHMENT_SIZE_MB } from '../utils/constants.js';
import { buildPrompt } from '../prompts/assembler.js';
import { logPrompt } from '../utils/logger.js';
import { getConfig } from './config.js';
import { createMessage, touchSession } from './sessions.js';
import { applyRules } from '../utils/regex-runner.js';
import { stripAsstContext, extractNextPromptOptions } from '../utils/turn-dialogue.js';

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
 * 构建上下文 messages 数组，调用 assembler.js 组装完整提示词
 *
 * @param {string} sessionId
 * @param {object} [options]  透传给 buildPrompt，支持 onRecallEvent 回调（T28）
 * @returns {Promise<{ messages: Array, overrides: { temperature: number, maxTokens: number }, recallHitCount: number }>}
 */
export async function buildContext(sessionId, options = {}) {
  const { messages, temperature, maxTokens, recallHitCount } = await buildPrompt(sessionId, options);
  if (getConfig().log_prompt) logPrompt(sessionId, messages);
  return { messages, overrides: { temperature, maxTokens }, recallHitCount: recallHitCount ?? 0 };
}

/**
 * 处理流式 LLM 输出的后处理管道（纯同步，无 SSE 依赖）
 * @param {string} rawContent
 * @param {boolean} aborted
 * @param {string|null} worldId
 * @param {string} sessionId
 * @returns {{ savedContent: string, options: string[], savedAssistant: object|null }}
 */
export function processStreamOutput(rawContent, aborted, worldId, sessionId) {
  let content = rawContent;

  if (content) content = stripAsstContext(content);

  let options = [];
  if (!aborted && content) {
    const extracted = extractNextPromptOptions(content);
    content = extracted.content;
    options = extracted.options;
  }

  if (aborted && content) content += '\n\n[已中断]';

  let savedAssistant = null;
  if (content) {
    const savedContent = aborted ? content : applyRules(content, 'ai_output', worldId);
    savedAssistant = createMessage({ session_id: sessionId, role: 'assistant', content: savedContent });
    content = savedContent;
    touchSession(sessionId);
  }

  return { savedContent: content, options, savedAssistant };
}
