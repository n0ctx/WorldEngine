import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as llm from '../llm/index.js';
import { updateMessageAttachments, updateMessageNextOptions } from '../db/queries/messages.js';
import { MAX_ATTACHMENTS_PER_MESSAGE, MAX_ATTACHMENT_SIZE_MB } from '../utils/constants.js';
import { buildPrompt } from '../prompts/assembler.js';
import { logPrompt, createLogger, previewText } from '../utils/logger.js';
import { getConfig } from './config.js';
import { createMessage, touchSession } from './sessions.js';
import { applyRules } from '../utils/regex-runner.js';
import { stripAsstContext, extractNextPromptOptions, unwrapSoloThinkBlock } from '../utils/turn-dialogue.js';
import { renderBackendPrompt } from '../prompts/prompt-loader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ATTACHMENTS_DIR = process.env.WE_DATA_DIR
  ? path.resolve(process.env.WE_DATA_DIR, 'uploads', 'attachments')
  : path.resolve(__dirname, '..', '..', 'data', 'uploads', 'attachments');
const log = createLogger('chat-post');
const THINK_CLOSED_RE = /<\s*think(?:ing)?\s*>[\s\S]*?<\s*\/\s*think(?:ing)?\s*>/gi;
const THINK_OPEN_TEST_RE = /<\s*think(?:ing)?\s*>/i;
const THINK_OPEN_TAIL_RE = /<\s*think(?:ing)?\s*>[\s\S]*$/i;

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
  const uploadsDir = process.env.WE_DATA_DIR
    ? path.resolve(process.env.WE_DATA_DIR, 'uploads')
    : path.resolve(__dirname, '..', '..', 'data', 'uploads');
  const absPath = path.resolve(uploadsDir, relativePath);
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
  const { messages, temperature, maxTokens, recallHitCount, cacheableSystem, suggestionText, activatedEntries } = await buildPrompt(sessionId, options);
  if (getConfig().log_prompt) logPrompt(sessionId, messages);
  return { messages, overrides: { temperature, maxTokens, cacheableSystem }, recallHitCount: recallHitCount ?? 0, suggestionText: suggestionText ?? null, activatedEntries: activatedEntries ?? [] };
}

function stripThinkBlocksForSuggestion(text) {
  if (!text) return text ?? '';
  let cleaned = text.replace(THINK_CLOSED_RE, '');
  if (THINK_OPEN_TEST_RE.test(cleaned)) {
    cleaned = cleaned.replace(THINK_OPEN_TAIL_RE, '');
  }
  return cleaned;
}

function trimAfterLastNextPromptClose(text) {
  if (!text) return text ?? '';
  const lastCloseIdx = text.lastIndexOf('</next_prompt>');
  if (lastCloseIdx === -1) return text;
  return text.slice(0, lastCloseIdx + '</next_prompt>'.length);
}

function hasSatisfiedNextPromptBoundary(content) {
  if (!content) return false;
  const trimmed = content.trimEnd();
  if (trimmed.endsWith('</next_prompt>')) return true;

  const lastThinkClose = trimmed.lastIndexOf('</think>');
  const lastThinkingClose = trimmed.lastIndexOf('</thinking>');
  const thinkCloseIdx = Math.max(lastThinkClose, lastThinkingClose);
  if (thinkCloseIdx === -1) return false;

  const tail = trimmed.slice(thinkCloseIdx);
  return tail.includes('</next_prompt>');
}

function shouldRunSuggestionFallback({ suggestionEnabled, aborted, content }) {
  const visibleContent = stripThinkBlocksForSuggestion(content);
  return !!(suggestionEnabled && !aborted && visibleContent && !hasSatisfiedNextPromptBoundary(content));
}

async function buildSuggestionFallback({ userContent, assistantContent, configScope = 'aux' }) {
  const prompt = renderBackendPrompt('shared-suggestion-fallback.md', {
    USER_MESSAGE: userContent ?? '',
    ASSISTANT_MESSAGE: assistantContent ?? '',
  });
  const messages = [{ role: 'user', content: prompt }];
  return llm.complete(messages, {
    configScope,
    temperature: 0,
    callType: 'suggestion_fallback',
  });
}

async function resolveSuggestionOptions({
  content,
  suggestionEnabled,
  aborted,
  userContent,
  configScope = 'aux',
  sessionId,
  onSuggestionFallback,
}) {
  if (!content) return { content: content ?? '', options: [] };
  content = trimAfterLastNextPromptClose(content);
  const visibleContent = stripThinkBlocksForSuggestion(content);

  if (!shouldRunSuggestionFallback({ suggestionEnabled, aborted, content })) {
    return extractNextPromptOptions(content);
  }

  try {
    onSuggestionFallback?.();
    const fallbackRaw = await buildSuggestionFallback({
      userContent,
      assistantContent: visibleContent,
      configScope,
    });
    const extracted = extractNextPromptOptions(fallbackRaw);
    if (extracted.options.length > 0) {
      return { content, options: extracted.options };
    }
    log.warn(`SUGGESTION FALLBACK EMPTY  session=${sessionId.slice(0, 8)}  preview=${JSON.stringify(previewText(fallbackRaw))}`);
  } catch (err) {
    log.warn(`SUGGESTION FALLBACK FAIL  session=${sessionId.slice(0, 8)}  error=${err.message}`);
  }

  return { content, options: [] };
}

/**
 * 处理流式 LLM 输出的后处理管道（异步，无 SSE 依赖）
 * @param {string} rawContent
 * @param {boolean} aborted
 * @param {string|null} worldId
 * @param {string} sessionId
 * @param {object} [opts]
 * @param {string} [opts.mode='chat']               正则规则模式，'chat' 或 'writing'
 * @param {function} [opts.createMessageFn]         消息创建函数，默认使用 sessions.createMessage
 * @param {function} [opts.touchSessionFn]          会话触活函数，默认使用 sessions.touchSession
 * @param {boolean} [opts.suggestionEnabled=false]  是否启用选项区兜底
 * @param {string} [opts.currentUserContent='']     本轮 user message
 * @param {string} [opts.configScope='aux']         fallback 所用模型配置域
 * @param {function} [opts.onSuggestionFallback]    进入补选项分支时的回调
 * @returns {Promise<{ savedContent: string, options: string[], savedAssistant: object|null }>}
 */
export async function processStreamOutput(rawContent, aborted, worldId, sessionId, opts = {}) {
  const {
    mode = 'chat',
    createMessageFn = createMessage,
    touchSessionFn = touchSession,
    suggestionEnabled = false,
    currentUserContent = '',
    configScope = 'aux',
    onSuggestionFallback = undefined,
  } = opts;

  // DeepSeek 有时将正文也写入 reasoning_content，导致整体被 <think>...</think> 包裹。
  // 解包后再走正常处理流程，避免消息丢失或历史上下文为空。
  // 中断时不解包：用户中止时模型可能仍在推理阶段，应保留 think 包裹避免 CoT 泄漏。
  let content = aborted ? rawContent : unwrapSoloThinkBlock(rawContent);

  if (content) content = stripAsstContext(content);

  const resolved = await resolveSuggestionOptions({
    content,
    suggestionEnabled,
    aborted,
    userContent: currentUserContent,
    configScope,
    sessionId,
    onSuggestionFallback,
  });
  content = resolved.content;
  const options = resolved.options;

  if (aborted && content) content += '\n\n[已中断]';

  let savedAssistant = null;
  if (content) {
    const savedContent = aborted ? content : applyRules(content, 'ai_output', worldId, mode);
    savedAssistant = createMessageFn({ session_id: sessionId, role: 'assistant', content: savedContent });
    content = savedContent;
    if (savedAssistant && options.length > 0) {
      updateMessageNextOptions(savedAssistant.id, options);
      savedAssistant.next_options = options;
    }
    touchSessionFn(sessionId);
  }

  return { savedContent: content, options, savedAssistant };
}
