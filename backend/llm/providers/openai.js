/**
 * 云端 LLM Provider 适配
 *
 * 支持三种 API 风格：
 *   - OpenAI-compatible：OpenAI / OpenRouter / GLM / Kimi / MiniMax / DeepSeek / Grok / SiliconFlow
 *   - Anthropic 原生 Messages API
 *   - Gemini 原生 generateContent API
 */

// ============================================================
// 默认 Base URL
// ============================================================

const DEFAULT_BASE_URLS = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  glm: 'https://open.bigmodel.cn/api/paas/v4',
  kimi: 'https://api.moonshot.cn/v1',
  minimax: 'https://api.minimax.chat/v1',
  deepseek: 'https://api.deepseek.com',
  grok: 'https://api.x.ai/v1',
  siliconflow: 'https://api.siliconflow.cn/v1',
  anthropic: 'https://api.anthropic.com',
  gemini: 'https://generativelanguage.googleapis.com',
};

const OPENAI_COMPATIBLE = new Set([
  'openai', 'openrouter', 'glm', 'kimi', 'minimax', 'deepseek', 'grok', 'siliconflow',
]);

// ============================================================
// 工具函数
// ============================================================

function getBaseUrl(config) {
  return (config.base_url || DEFAULT_BASE_URLS[config.provider] || '').replace(/\/+$/, '');
}

/** 解析 data URL → { mimeType, data } */
function parseDataUrl(dataUrl) {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  return m ? { mimeType: m[1], data: m[2] } : null;
}

/** 创建带状态码的错误 */
function apiError(message, status, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

// ============================================================
// SSE 解析器
// ============================================================

async function* parseSSE(body) {
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';

  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;
        yield { event: currentEvent, data };
      } else if (line === '') {
        currentEvent = '';
      }
    }
  }
}

// ============================================================
// 消息格式转换
// ============================================================

/**
 * 内部格式 → Anthropic Messages API 格式
 * system 消息提取到顶层，content 数组转 Anthropic block 格式
 */
function convertToAnthropicMessages(messages) {
  const systemParts = [];
  const converted = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      const text = typeof msg.content === 'string' ? msg.content : msg.content.map((p) => p.text || '').join('');
      if (text) systemParts.push(text);
      continue;
    }

    const content = convertContentToAnthropic(msg.content);
    converted.push({ role: msg.role, content });
  }

  return { system: systemParts.join('\n\n') || undefined, messages: converted };
}

function convertContentToAnthropic(content) {
  if (typeof content === 'string') return content;
  return content.map((part) => {
    if (part.type === 'text') return { type: 'text', text: part.text };
    if (part.type === 'image_url') {
      const parsed = parseDataUrl(part.image_url.url);
      if (!parsed) return { type: 'text', text: '[unsupported image]' };
      return {
        type: 'image',
        source: { type: 'base64', media_type: parsed.mimeType, data: parsed.data },
      };
    }
    return { type: 'text', text: '' };
  });
}

/**
 * 内部格式 → Gemini generateContent 格式
 * system 消息提取到 systemInstruction，role 映射：assistant → model
 */
function convertToGeminiContents(messages) {
  const systemParts = [];
  const contents = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      const text = typeof msg.content === 'string' ? msg.content : msg.content.map((p) => p.text || '').join('');
      if (text) systemParts.push(text);
      continue;
    }

    const role = msg.role === 'assistant' ? 'model' : 'user';
    const parts = convertContentToGemini(msg.content);
    contents.push({ role, parts });
  }

  const result = { contents };
  if (systemParts.length) {
    result.systemInstruction = { parts: [{ text: systemParts.join('\n\n') }] };
  }
  return result;
}

function convertContentToGemini(content) {
  if (typeof content === 'string') return [{ text: content }];
  return content.map((part) => {
    if (part.type === 'text') return { text: part.text };
    if (part.type === 'image_url') {
      const parsed = parseDataUrl(part.image_url.url);
      if (!parsed) return { text: '[unsupported image]' };
      return { inlineData: { mimeType: parsed.mimeType, data: parsed.data } };
    }
    return { text: '' };
  });
}

// ============================================================
// OpenAI-compatible 实现
// ============================================================

/**
 * 将 thinking_level 映射为 OpenAI reasoning_effort 值
 * effort_low/medium/high → 'low'/'medium'/'high'
 */
function resolveReasoningEffort(thinking_level) {
  if (!thinking_level || !thinking_level.startsWith('effort_')) return null;
  return thinking_level.replace('effort_', '');
}

async function* streamOpenAICompatible(messages, config) {
  const baseUrl = getBaseUrl(config);
  const url = `${baseUrl}/chat/completions`;

  const effort = resolveReasoningEffort(config.thinking_level);
  const body = {
    model: config.model,
    messages,
    max_tokens: config.max_tokens,
    stream: true,
  };
  // reasoning_effort 不兼容 temperature，有 effort 时不传 temperature
  if (effort) {
    body.reasoning_effort = effort;
  } else {
    body.temperature = config.temperature;
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.api_key}`,
    },
    body: JSON.stringify(body),
    signal: config.signal,
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw apiError(`${config.provider} API error: ${resp.status} ${body}`, resp.status);
  }

  for await (const { data } of parseSSE(resp.body)) {
    try {
      const parsed = JSON.parse(data);
      const delta = parsed.choices?.[0]?.delta?.content;
      if (delta) yield delta;
    } catch {
      // 跳过无法解析的行
    }
  }
}

async function completeOpenAICompatible(messages, config) {
  const baseUrl = getBaseUrl(config);
  const url = `${baseUrl}/chat/completions`;

  const effort = resolveReasoningEffort(config.thinking_level);
  const body = {
    model: config.model,
    messages,
    max_tokens: config.max_tokens,
    stream: false,
  };
  if (effort) {
    body.reasoning_effort = effort;
  } else {
    body.temperature = config.temperature;
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.api_key}`,
    },
    body: JSON.stringify(body),
    signal: config.signal,
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw apiError(`${config.provider} API error: ${resp.status} ${body}`, resp.status);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

// ============================================================
// Anthropic 原生实现
// ============================================================

/**
 * 将 thinking_level 映射为 Anthropic thinking budget_tokens
 * budget_low=1024, budget_medium=8192, budget_high=16384
 */
function resolveAnthropicThinking(thinking_level) {
  const MAP = { budget_low: 1024, budget_medium: 8192, budget_high: 16384 };
  return MAP[thinking_level] ?? null;
}

async function* streamAnthropic(messages, config) {
  const baseUrl = getBaseUrl(config);
  const url = `${baseUrl}/v1/messages`;
  const { system, messages: converted } = convertToAnthropicMessages(messages);

  const budgetTokens = resolveAnthropicThinking(config.thinking_level);
  const body = {
    model: config.model,
    messages: converted,
    max_tokens: config.max_tokens || 4096,
    stream: true,
  };
  // extended thinking 不兼容 temperature（必须为 1），有 thinking 时不传 temperature
  if (!budgetTokens && config.temperature != null) body.temperature = config.temperature;
  if (budgetTokens) body.thinking = { type: 'enabled', budget_tokens: budgetTokens };
  if (system) body.system = system;

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': config.api_key,
    'anthropic-version': '2023-06-01',
  };
  if (budgetTokens) headers['anthropic-beta'] = 'interleaved-thinking-2025-05-14';

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: config.signal,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw apiError(`Anthropic API error: ${resp.status} ${text}`, resp.status);
  }

  // 跟踪当前是否在 thinking block 中（extended thinking 专用）
  let inThinkingBlock = false;

  for await (const { event, data } of parseSSE(resp.body)) {
    if (event === 'content_block_start') {
      try {
        const parsed = JSON.parse(data);
        if (parsed.content_block?.type === 'thinking') {
          inThinkingBlock = true;
          yield '<think>';
        } else if (parsed.content_block?.type === 'text' && inThinkingBlock) {
          yield '</think>';
          inThinkingBlock = false;
        }
      } catch { /* skip */ }
    } else if (event === 'content_block_stop') {
      if (inThinkingBlock) {
        yield '</think>';
        inThinkingBlock = false;
      }
    } else if (event === 'content_block_delta') {
      try {
        const parsed = JSON.parse(data);
        if (parsed.delta?.type === 'thinking_delta') {
          yield parsed.delta.thinking || '';
        } else if (parsed.delta?.type === 'text_delta') {
          const text = parsed.delta.text;
          if (text) yield text;
        }
      } catch { /* skip */ }
    }
  }

  // 安全兜底：确保 thinking block 已关闭
  if (inThinkingBlock) yield '</think>';
}

async function completeAnthropic(messages, config) {
  const baseUrl = getBaseUrl(config);
  const url = `${baseUrl}/v1/messages`;
  const { system, messages: converted } = convertToAnthropicMessages(messages);

  const budgetTokens = resolveAnthropicThinking(config.thinking_level);
  const body = {
    model: config.model,
    messages: converted,
    max_tokens: config.max_tokens || 4096,
  };
  if (!budgetTokens && config.temperature != null) body.temperature = config.temperature;
  if (budgetTokens) body.thinking = { type: 'enabled', budget_tokens: budgetTokens };
  if (system) body.system = system;

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': config.api_key,
    'anthropic-version': '2023-06-01',
  };
  if (budgetTokens) headers['anthropic-beta'] = 'interleaved-thinking-2025-05-14';

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: config.signal,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw apiError(`Anthropic API error: ${resp.status} ${text}`, resp.status);
  }

  const data = await resp.json();
  // 将 thinking block 包裹为 <think> 标签，text block 直接拼接
  return (data.content || []).map((block) => {
    if (block.type === 'thinking') return `<think>${block.thinking}</think>`;
    if (block.type === 'text') return block.text;
    return '';
  }).join('');
}

// ============================================================
// Gemini 原生实现
// ============================================================

async function* streamGemini(messages, config) {
  const baseUrl = getBaseUrl(config);
  const model = (config.model || 'gemini-pro').replace(/^models\//, '');
  const url = `${baseUrl}/v1beta/models/${model}:streamGenerateContent?key=${config.api_key}&alt=sse`;

  const { contents, systemInstruction } = convertToGeminiContents(messages);
  const body = { contents };
  if (systemInstruction) body.systemInstruction = systemInstruction;
  body.generationConfig = {};
  if (config.temperature != null) body.generationConfig.temperature = config.temperature;
  if (config.max_tokens != null) body.generationConfig.maxOutputTokens = config.max_tokens;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: config.signal,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw apiError(`Gemini API error: ${resp.status} ${text}`, resp.status);
  }

  for await (const { data } of parseSSE(resp.body)) {
    try {
      const parsed = JSON.parse(data);
      const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) yield text;
    } catch {
      // skip
    }
  }
}

async function completeGemini(messages, config) {
  const baseUrl = getBaseUrl(config);
  const model = (config.model || 'gemini-pro').replace(/^models\//, '');
  const url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${config.api_key}`;

  const { contents, systemInstruction } = convertToGeminiContents(messages);
  const body = { contents };
  if (systemInstruction) body.systemInstruction = systemInstruction;
  body.generationConfig = {};
  if (config.temperature != null) body.generationConfig.temperature = config.temperature;
  if (config.max_tokens != null) body.generationConfig.maxOutputTokens = config.max_tokens;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: config.signal,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw apiError(`Gemini API error: ${resp.status} ${text}`, resp.status);
  }

  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ============================================================
// 统一导出
// ============================================================

export async function* streamChat(messages, config) {
  if (config.provider === 'anthropic') {
    yield* streamAnthropic(messages, config);
  } else if (config.provider === 'gemini') {
    yield* streamGemini(messages, config);
  } else if (OPENAI_COMPATIBLE.has(config.provider)) {
    yield* streamOpenAICompatible(messages, config);
  } else {
    throw apiError(`不支持的 provider: ${config.provider}`, 400);
  }
}

export async function complete(messages, config) {
  if (config.provider === 'anthropic') {
    return completeAnthropic(messages, config);
  } else if (config.provider === 'gemini') {
    return completeGemini(messages, config);
  } else if (OPENAI_COMPATIBLE.has(config.provider)) {
    return completeOpenAICompatible(messages, config);
  } else {
    throw apiError(`不支持的 provider: ${config.provider}`, 400);
  }
}
