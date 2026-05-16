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
import {
  stripAsstContext,
  extractNextPromptOptions,
  unwrapSoloThinkBlock,
  stripThinkBlocksFromText,
  findRawNextPromptIdx,
  classifyNextPromptBoundary,
} from '../utils/turn-dialogue.js';
import { renderBackendPrompt } from '../prompts/prompt-loader.js';
import { runHook } from '../hooks/hook-registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ATTACHMENTS_DIR = process.env.WE_DATA_DIR
  ? path.resolve(process.env.WE_DATA_DIR, 'uploads', 'attachments')
  : path.resolve(__dirname, '..', '..', 'data', 'uploads', 'attachments');
const log = createLogger('chat-post');

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
 * @returns {string[]}
 */
export function saveAttachments(messageId, attachments) {
  if (!attachments || attachments.length === 0) return [];

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

  return paths;
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

function trimAfterLastNextPromptClose(text) {
  if (!text) return text ?? '';
  const lastCloseIdx = text.lastIndexOf('</next_prompt>');
  if (lastCloseIdx === -1) return text;
  return text.slice(0, lastCloseIdx + '</next_prompt>'.length);
}

/**
 * 构造 4 个 run-*.js 入口共享的"补选项 SSE 回调"。
 * mode: 'fallback' | 'continuation'；reason: 'empty' | 'error'。
 */
export function makeSuggestionFallbackCallbacks(emitSse) {
  return {
    onSuggestionFallback({ mode } = {}) {
      emitSse({ type: 'suggestion_fallback_started', mode });
    },
    onSuggestionFallbackSucceeded({ mode } = {}) {
      emitSse({ type: 'suggestion_fallback_succeeded', mode });
    },
    onSuggestionFallbackFailed({ mode, reason } = {}) {
      emitSse({ type: 'suggestion_fallback_failed', mode, reason });
    },
  };
}

const SUGGESTION_AUX_VARIANTS = {
  fallback: {
    template: 'shared-suggestion-fallback.md',
    assistantKey: 'ASSISTANT_MESSAGE',
    callType: 'suggestion_fallback',
  },
  continuation: {
    template: 'shared-suggestion-continuation.md',
    assistantKey: 'ASSISTANT_PARTIAL',
    callType: 'suggestion_continuation',
  },
};

async function buildSuggestionAux({ mode, userContent, assistantText, configScope = 'aux' }) {
  const variant = SUGGESTION_AUX_VARIANTS[mode];
  const prompt = renderBackendPrompt(variant.template, {
    USER_MESSAGE: userContent ?? '',
    [variant.assistantKey]: assistantText ?? '',
  });
  return llm.complete([{ role: 'user', content: prompt }], {
    configScope,
    temperature: 0,
    callType: variant.callType,
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
  onSuggestionFallbackSucceeded,
  onSuggestionFallbackFailed,
}) {
  if (!content) return { content: content ?? '', options: [] };
  content = trimAfterLastNextPromptClose(content);
  let visibleContent = stripThinkBlocksFromText(content) ?? '';
  let boundary = classifyNextPromptBoundary(visibleContent);

  if (suggestionEnabled && !aborted && visibleContent && boundary === 'closed') {
    const peek = extractNextPromptOptions(content);
    if (peek.options.length >= 3) return peek;
    if (peek.options.length === 0) return peek;
    // 闭合但只有 1-2 条：删掉闭标签复用 continuation 路径补齐到三条。
    // 已知此后 boundary 必为 truncated，无需重新 strip / classify。
    content = content.replace(/<\/next_prompt>\s*$/, '');
    visibleContent = visibleContent.replace(/<\/next_prompt>\s*$/, '');
    boundary = 'truncated';
  }

  if (!suggestionEnabled || aborted || !visibleContent || boundary === 'closed') {
    return extractNextPromptOptions(content);
  }

  const mode = boundary === 'truncated' ? 'continuation' : 'fallback';
  try {
    onSuggestionFallback?.({ mode });
    const raw = await buildSuggestionAux({
      mode,
      userContent,
      assistantText: visibleContent,
      configScope,
    });
    const extracted = extractNextPromptOptions(raw);
    if (extracted.options.length > 0) {
      onSuggestionFallbackSucceeded?.({ mode });
      let cleanedContent = content;
      if (mode === 'continuation') {
        // 把 partial 的 <next_prompt>...EOF 段从正文切掉，避免散文残留。
        const rawOpenIdx = findRawNextPromptIdx(content, visibleContent.indexOf('<next_prompt>'));
        if (rawOpenIdx !== -1) {
          cleanedContent = content.slice(0, rawOpenIdx).replace(/\n+$/, '');
        }
      }
      return { content: cleanedContent, options: extracted.options };
    }
    onSuggestionFallbackFailed?.({ mode, reason: 'empty' });
    log.warn(`SUGGESTION ${mode.toUpperCase()} EMPTY  session=${sessionId.slice(0, 8)}  preview=${JSON.stringify(previewText(raw))}`);
  } catch (err) {
    onSuggestionFallbackFailed?.({ mode, reason: 'error' });
    log.warn(`SUGGESTION ${mode.toUpperCase()} FAIL  session=${sessionId.slice(0, 8)}  error=${err.message}`);
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
 * @param {function} [opts.onSuggestionFallbackSucceeded] fallback 成功时的回调
 * @param {function} [opts.onSuggestionFallbackFailed]    fallback 失败时的回调
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
    onSuggestionFallbackSucceeded = undefined,
    onSuggestionFallbackFailed = undefined,
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
    onSuggestionFallbackSucceeded,
    onSuggestionFallbackFailed,
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
    await runHook('message:assistant:saved', { message: savedAssistant, sessionId, aborted: !!aborted });
    touchSessionFn(sessionId);
  }

  return { savedContent: content, options, savedAssistant };
}
