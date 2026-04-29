/**
 * LLM 接入层 — 统一入口
 *
 * 对外暴露：
 *   chat(messages, options)                  — 流式，返回 AsyncGenerator<string>
 *   complete(messages, options)              — 非流式，返回 string
 *   completeWithTools(messages, tools, opts) — 非流式 + tool-use 循环，返回 string
 *   resolveToolContext(messages, tools, opts) — 流式预检，返回富化后的 messages
 */

import { getConfig, getAuxLlmConfig, getWritingLlmConfig, getWritingAuxLlmConfig } from '../services/config.js';
import { LLM_RETRY_MAX, LLM_RETRY_DELAY_MS } from '../utils/constants.js';
import * as cloudProvider from './providers/openai.js';
import * as localProvider from './providers/ollama.js';
import * as mockProvider from './providers/mock.js';
import { getPromptCacheStrategy } from './providers/cache-usage.js';
import { createLogger, formatMeta, previewText, shouldLogRaw, summarizeMessages, spinnerAdd, spinnerRemove } from '../utils/logger.js';

const log = createLogger('llm');

// ============================================================
// Provider 路由
// ============================================================

const LOCAL_PROVIDERS = new Set(['ollama', 'lmstudio']);

function getRetryPolicy() {
  const max = Number(process.env.WE_LLM_RETRY_MAX);
  const delayMs = Number(process.env.WE_LLM_RETRY_DELAY_MS);
  return {
    max: Number.isInteger(max) ? max : LLM_RETRY_MAX,
    delayMs: Number.isInteger(delayMs) ? delayMs : LLM_RETRY_DELAY_MS,
  };
}

function getProvider(providerName) {
  if (providerName === 'mock') return mockProvider;
  return LOCAL_PROVIDERS.has(providerName) ? localProvider : cloudProvider;
}

// ============================================================
// 配置合并
// ============================================================

/**
 * 合并 config.llm / config.aux_llm / config.writing.llm / config.writing.aux_llm 与调用方 options，调用方优先
 *
 * @param {object} options - 包含 configScope('main'|'aux'|'writing'|'writing-aux') 的选项
 */
function buildLLMConfig(options = {}) {
  const config = getConfig();
  let llm;

  if (options.configScope === 'aux') {
    const auxConfig = getAuxLlmConfig();
    // aux_llm 未配置时，getAuxLlmConfig() 回落到主模型。
    // 此时 entry-matcher/摘要/状态更新等 complete 调用与 stream 调用共享同一 provider endpoint 和 prefix cache 池，
    // 可能导致主对话的 prompt cache 命中率下降。建议在设置中配置独立的 aux_llm provider。
    if (!config.aux_llm?.provider) {
      log.warn('AUX_FALLBACK  aux_llm 未配置，回落到主模型。complete 调用与 stream 共享相同 endpoint，可能影响 prompt cache 命中。');
    }
    llm = {
      provider: auxConfig.provider,
      provider_keys: { [auxConfig.provider]: auxConfig.api_key },
      base_url: auxConfig.base_url,
      model: auxConfig.model,
      // 副模型不暴露 temperature / max_tokens / thinking_level，使用主模型的值
      temperature: config.llm.temperature,
      max_tokens: config.llm.max_tokens,
      thinking_level: config.llm.thinking_level,
    };
  } else if (options.configScope === 'writing-aux') {
    // 写作副模型：未配置时按 writing.aux_llm → aux_llm → llm 顺序回退
    const writingAuxConfig = getWritingAuxLlmConfig();
    if (!config.writing?.aux_llm?.provider && !config.aux_llm?.provider) {
      log.warn('WRITING_AUX_FALLBACK  writing.aux_llm 与 aux_llm 均未配置，回落到对话主模型。');
    }
    llm = {
      provider: writingAuxConfig.provider,
      provider_keys: { [writingAuxConfig.provider]: writingAuxConfig.api_key },
      base_url: writingAuxConfig.base_url,
      model: writingAuxConfig.model,
      temperature: config.llm.temperature,
      max_tokens: config.llm.max_tokens,
      thinking_level: config.llm.thinking_level,
    };
  } else if (options.configScope === 'writing') {
    const writingConfig = getWritingLlmConfig();
    const writingLlm = config.writing?.llm ?? {};
    llm = {
      provider: writingConfig.provider,
      provider_keys: { [writingConfig.provider]: writingConfig.api_key },
      base_url: writingConfig.base_url,
      model: writingConfig.model,
      // 写作模型保留独立的 temperature / max_tokens（null 时回退主模型），thinking_level 跟随主模型
      temperature: writingLlm.temperature ?? config.llm.temperature,
      max_tokens: writingLlm.max_tokens ?? config.llm.max_tokens,
      thinking_level: config.llm.thinking_level,
    };
  } else {
    llm = config.llm;
  }

  const api_key = llm.provider_keys?.[llm.provider] || '';

  return {
    provider: llm.provider,
    api_key,
    base_url: llm.base_url,
    model: options.model || llm.model,
    temperature: options.temperature ?? llm.temperature,
    max_tokens: options.maxTokens ?? llm.max_tokens,
    // 调用方可传 thinking_level: null 显式禁用 thinking（覆盖全局配置）；
    // 未传时回退全局配置。使用 hasOwnProperty 区分"明确传 null"与"未传"。
    thinking_level: Object.prototype.hasOwnProperty.call(options, 'thinking_level')
      ? (options.thinking_level ?? null)
      : (llm.thinking_level ?? null),
    signal: options.signal || undefined,
    usageRef: options.usageRef || undefined,
    callType: options.callType || undefined,
    // 稳定会话 id：用于 xAI 的 x-grok-conv-id header 路由，最大化 prompt cache 命中。
    // 其他 provider 忽略该字段。同一会话内必须保持稳定，禁止用 requestId/timestamp。
    conversationId: options.conversationId || undefined,
  };
}

// ============================================================
// 错误处理
// ============================================================

class LLMError extends Error {
  constructor(message, { provider, status, code } = {}) {
    super(message);
    this.name = 'LLMError';
    this.provider = provider;
    this.status = status;
    this.code = code;
  }
}

function wrapError(err, provider) {
  if (err instanceof LLMError) return err;
  return new LLMError(err.message, {
    provider,
    status: err.status,
    code: err.code,
  });
}

/** 判断是否不可重试的客户端错误（4xx 且非 429） */
function isNonRetryable(err) {
  const s = err.status;
  return s && s >= 400 && s < 500 && s !== 429;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ============================================================
// 对外接口
// ============================================================

/**
 * 流式对话生成，返回 AsyncGenerator<string>
 *
 * @param {Array} messages  标准消息数组
 * @param {object} options  { temperature?, maxTokens?, model?, signal? }
 */
export async function* chat(messages, options = {}) {
  const llmConfig = buildLLMConfig(options);
  const provider = getProvider(llmConfig.provider);
  const cacheStrategy = getPromptCacheStrategy(llmConfig.provider);
  const retry = getRetryPolicy();
  const summary = summarizeMessages(messages);
  const startedAt = Date.now();

  log.info(`CHAT START  ${formatMeta({
    callType: llmConfig.callType,
    provider: llmConfig.provider,
    model: llmConfig.model || '',
    msgs: summary.count,
    chars: summary.chars,
    roles: summary.roles,
    temperature: llmConfig.temperature,
    maxTokens: llmConfig.max_tokens,
    thinking: llmConfig.thinking_level,
    cacheStrategy,
    conversationId: llmConfig.conversationId,
  })}`);

  let lastError;
  let fullResponse = '';
  const spinnerId = spinnerAdd('流式响应中');

  try {
    for (let attempt = 0; attempt <= retry.max; attempt++) {
      let started = false;
      try {
        const gen = provider.streamChat(messages, llmConfig);
        for await (const chunk of gen) {
          started = true;
          fullResponse += chunk;
          yield chunk;
        }
        const meta = formatMeta({
          callType: llmConfig.callType,
          provider: llmConfig.provider,
          model: llmConfig.model || '',
          len: fullResponse.length,
          ms: Date.now() - startedAt,
          promptTokens: llmConfig.usageRef?.prompt_tokens,
          completionTokens: llmConfig.usageRef?.completion_tokens,
          cacheReadTokens: llmConfig.usageRef?.cache_read_tokens,
          cacheCreationTokens: llmConfig.usageRef?.cache_creation_tokens,
          cacheMissTokens: llmConfig.usageRef?.cache_miss_tokens,
        });
        if (shouldLogRaw('llm_raw')) {
          log.info(`CHAT DONE  ${meta}  preview=${JSON.stringify(previewText(fullResponse))}`);
        } else {
          log.info(`CHAT DONE  ${meta}`);
        }
        return;
      } catch (err) {
        // 已开始输出，不可重试（调用方已收到部分数据）
        if (started) {
          log.warn(`CHAT PARTIAL-FAIL  ${formatMeta({
            provider: llmConfig.provider,
            model: llmConfig.model || '',
            len: fullResponse.length,
            ms: Date.now() - startedAt,
            error: err.message,
          })}`);
          throw wrapError(err, llmConfig.provider);
        }
        if (err.name === 'AbortError') throw wrapError(err, llmConfig.provider);
        if (isNonRetryable(err)) throw wrapError(err, llmConfig.provider);

        lastError = err;
        log.warn(`CHAT RETRY  ${formatMeta({
          attempt: attempt + 1,
          provider: llmConfig.provider,
          model: llmConfig.model || '',
          error: err.message,
        })}`);
        if (attempt < retry.max) await sleep(retry.delayMs);
      }
    }
    throw wrapError(lastError, llmConfig.provider);
  } finally {
    spinnerRemove(spinnerId);
  }
}

function splitTools(tools = []) {
  const safeTools = Array.isArray(tools) ? tools : [];
  const defs = safeTools.map(({ execute: _execute, ...def }) => def);
  const handlers = Object.fromEntries(
    safeTools
      .filter((tool) => typeof tool.execute === 'function')
      .map((tool) => [tool.function.name, tool.execute]),
  );
  return { defs, handlers };
}

export const __testables = {
  getProvider,
  buildLLMConfig,
  splitTools,
  getRetryPolicy,
  wrapError,
  isNonRetryable,
  LLMError,
};

/**
 * 非流式调用（含 tool-use 循环），返回完整文本。
 * 若 provider 不支持 tool-use，静默降级为 complete()。
 */
export async function completeWithTools(messages, tools, options = {}) {
  const llmConfig = buildLLMConfig(options);
  const provider = getProvider(llmConfig.provider);
  const cacheStrategy = getPromptCacheStrategy(llmConfig.provider);
  const retry = getRetryPolicy();
  const summary = summarizeMessages(messages);
  const startedAt = Date.now();

  if (typeof provider.completeWithTools !== 'function') {
    log.info(`COMPLETE_TOOLS FALLBACK  ${formatMeta({ provider: llmConfig.provider, model: llmConfig.model || '', reason: 'provider-no-tool-use' })}`);
    return provider.complete(messages, llmConfig);
  }

  const { defs, handlers } = splitTools(tools);
  log.info(`COMPLETE_TOOLS START  ${formatMeta({
    callType: llmConfig.callType,
    provider: llmConfig.provider,
    model: llmConfig.model || '',
    msgs: summary.count,
    chars: summary.chars,
    tools: defs.map((tool) => tool.function.name),
    cacheStrategy,
  })}`);

  let lastError;
  const spinnerId = spinnerAdd('工具调用中');
  try {
    for (let attempt = 0; attempt <= retry.max; attempt++) {
      try {
        const result = await provider.completeWithTools(messages, defs, handlers, llmConfig);
        log.info(`COMPLETE_TOOLS DONE  ${formatMeta({
          callType: llmConfig.callType,
          provider: llmConfig.provider,
          model: llmConfig.model || '',
          len: result?.length ?? 0,
          ms: Date.now() - startedAt,
          promptTokens: llmConfig.usageRef?.prompt_tokens,
          completionTokens: llmConfig.usageRef?.completion_tokens,
          cacheReadTokens: llmConfig.usageRef?.cache_read_tokens,
          cacheCreationTokens: llmConfig.usageRef?.cache_creation_tokens,
          cacheMissTokens: llmConfig.usageRef?.cache_miss_tokens,
          preview: shouldLogRaw('llm_raw') ? previewText(result) : undefined,
        })}`);
        return result;
      } catch (err) {
        if (err.name === 'AbortError') throw wrapError(err, llmConfig.provider);
        if (isNonRetryable(err)) throw wrapError(err, llmConfig.provider);
        lastError = err;
        log.warn(`COMPLETE_TOOLS RETRY  ${formatMeta({
          attempt: attempt + 1,
          provider: llmConfig.provider,
          model: llmConfig.model || '',
          error: err.message,
        })}`);
        if (attempt < retry.max) await sleep(retry.delayMs);
      }
    }
    throw wrapError(lastError, llmConfig.provider);
  } finally {
    spinnerRemove(spinnerId);
  }
}

/**
 * 流式回复前的工具预检：允许 LLM 读取项目文件，返回注入了工具结果的 messages。
 * 若 provider 不支持或出错，静默降级返回原始 messages。
 */
export async function resolveToolContext(messages, tools, options = {}) {
  const llmConfig = buildLLMConfig(options);
  const provider = getProvider(llmConfig.provider);
  const summary = summarizeMessages(messages);

  if (typeof provider.resolveToolContext !== 'function') return messages;

  const { defs, handlers } = splitTools(tools);
  log.info(`RESOLVE_TOOLS START  ${formatMeta({
    callType: llmConfig.callType,
    provider: llmConfig.provider,
    model: llmConfig.model || '',
    msgs: summary.count,
    chars: summary.chars,
    tools: defs.map((tool) => tool.function.name),
  })}`);

  try {
    const enriched = await provider.resolveToolContext(messages, defs, handlers, llmConfig);
    const added = enriched.length - messages.length;
    // 从 enriched 消息里提取实际调用了哪些 tool
    const calledTools = enriched
      .filter((m) => m.role === 'assistant' && Array.isArray(m.tool_calls))
      .flatMap((m) => m.tool_calls.map((tc) => tc.function?.name))
      .filter(Boolean);
    log.info(`RESOLVE_TOOLS DONE  ${formatMeta({ callType: llmConfig.callType, provider: llmConfig.provider, model: llmConfig.model || '', added, calledTools: calledTools.length ? calledTools : undefined })}`);
    return enriched;
  } catch (err) {
    log.warn(`RESOLVE_TOOLS FAIL  ${formatMeta({ provider: llmConfig.provider, model: llmConfig.model || '', error: err.message })}`);
    throw wrapError(err, llmConfig.provider);
  }
}

/**
 * 非流式调用，返回完整文本
 *
 * @param {Array} messages  标准消息数组
 * @param {object} options  { temperature?, maxTokens?, model?, signal? }
 * @returns {Promise<string>}
 */
export async function complete(messages, options = {}) {
  const llmConfig = buildLLMConfig(options);
  const provider = getProvider(llmConfig.provider);
  const cacheStrategy = getPromptCacheStrategy(llmConfig.provider);
  const retry = getRetryPolicy();
  const summary = summarizeMessages(messages);
  const startedAt = Date.now();

  log.info(`COMPLETE START  ${formatMeta({
    callType: llmConfig.callType,
    provider: llmConfig.provider,
    model: llmConfig.model || '',
    msgs: summary.count,
    chars: summary.chars,
    roles: summary.roles,
    temperature: llmConfig.temperature,
    maxTokens: llmConfig.max_tokens,
    thinking: llmConfig.thinking_level,
    cacheStrategy,
    conversationId: llmConfig.conversationId,
  })}`);

  let lastError;
  const spinnerId = spinnerAdd('非流式响应中');
  try {
    for (let attempt = 0; attempt <= retry.max; attempt++) {
      try {
        const result = await provider.complete(messages, llmConfig);
        const meta = formatMeta({
          callType: llmConfig.callType,
          provider: llmConfig.provider,
          model: llmConfig.model || '',
          len: result?.length ?? 0,
          ms: Date.now() - startedAt,
          promptTokens: llmConfig.usageRef?.prompt_tokens,
          completionTokens: llmConfig.usageRef?.completion_tokens,
          cacheReadTokens: llmConfig.usageRef?.cache_read_tokens,
          cacheCreationTokens: llmConfig.usageRef?.cache_creation_tokens,
          cacheMissTokens: llmConfig.usageRef?.cache_miss_tokens,
        });
        if (shouldLogRaw('llm_raw')) {
          log.info(`COMPLETE DONE  ${meta}  preview=${JSON.stringify(previewText(result))}`);
        } else {
          log.info(`COMPLETE DONE  ${meta}`);
        }
        return result;
      } catch (err) {
        if (err.name === 'AbortError') throw wrapError(err, llmConfig.provider);
        if (isNonRetryable(err)) throw wrapError(err, llmConfig.provider);

        lastError = err;
        log.warn(`COMPLETE RETRY  ${formatMeta({
          attempt: attempt + 1,
          provider: llmConfig.provider,
          model: llmConfig.model || '',
          error: err.message,
        })}`);
        if (attempt < retry.max) await sleep(retry.delayMs);
      }
    }
    throw wrapError(lastError, llmConfig.provider);
  } finally {
    spinnerRemove(spinnerId);
  }
}
