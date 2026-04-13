/**
 * LLM 接入层 — 统一入口
 *
 * 对外暴露：
 *   chat(messages, options)    — 流式，返回 AsyncGenerator<string>
 *   complete(messages, options) — 非流式，返回 string
 */

import { getConfig } from '../services/config.js';
import { LLM_RETRY_MAX, LLM_RETRY_DELAY_MS } from '../utils/constants.js';
import * as cloudProvider from './providers/openai.js';
import * as localProvider from './providers/ollama.js';

// ============================================================
// Provider 路由
// ============================================================

const LOCAL_PROVIDERS = new Set(['ollama', 'lmstudio']);

function getProvider(providerName) {
  return LOCAL_PROVIDERS.has(providerName) ? localProvider : cloudProvider;
}

// ============================================================
// 配置合并
// ============================================================

/**
 * 合并 config.llm 与调用方 options，调用方优先
 */
function buildLLMConfig(options = {}) {
  const config = getConfig();
  const llm = config.llm;

  return {
    provider: llm.provider,
    api_key: llm.api_key,
    base_url: llm.base_url,
    model: options.model || llm.model,
    temperature: options.temperature ?? llm.temperature,
    max_tokens: options.maxTokens ?? llm.max_tokens,
    signal: options.signal || undefined,
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

  let lastError;
  for (let attempt = 0; attempt <= LLM_RETRY_MAX; attempt++) {
    let started = false;
    try {
      const gen = provider.streamChat(messages, llmConfig);
      for await (const chunk of gen) {
        started = true;
        yield chunk;
      }
      return;
    } catch (err) {
      // 已开始输出，不可重试（调用方已收到部分数据）
      if (started) throw wrapError(err, llmConfig.provider);
      if (err.name === 'AbortError') throw wrapError(err, llmConfig.provider);
      if (isNonRetryable(err)) throw wrapError(err, llmConfig.provider);

      lastError = err;
      if (attempt < LLM_RETRY_MAX) await sleep(LLM_RETRY_DELAY_MS);
    }
  }
  throw wrapError(lastError, llmConfig.provider);
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

  let lastError;
  for (let attempt = 0; attempt <= LLM_RETRY_MAX; attempt++) {
    try {
      return await provider.complete(messages, llmConfig);
    } catch (err) {
      if (err.name === 'AbortError') throw wrapError(err, llmConfig.provider);
      if (isNonRetryable(err)) throw wrapError(err, llmConfig.provider);

      lastError = err;
      if (attempt < LLM_RETRY_MAX) await sleep(LLM_RETRY_DELAY_MS);
    }
  }
  throw wrapError(lastError, llmConfig.provider);
}
