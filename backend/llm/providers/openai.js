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

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === 'system') {
      const text = typeof msg.content === 'string' ? msg.content : (msg.content || []).map((p) => p.text || '').join('');
      if (text) systemParts.push(text);
      continue;
    }

    // OpenAI-format tool call → Anthropic tool_use blocks
    if (msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      const blocks = [];
      const text = typeof msg.content === 'string' ? msg.content : '';
      if (text) blocks.push({ type: 'text', text });
      for (const tc of msg.tool_calls) {
        let input = {};
        try { input = JSON.parse(tc.function?.arguments || '{}'); } catch { /* ignore */ }
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.function?.name || '', input });
      }
      converted.push({ role: 'assistant', content: blocks });
      continue;
    }

    // OpenAI-format tool result messages → Anthropic tool_result blocks（连续合并）
    if (msg.role === 'tool') {
      const toolResults = [];
      while (i < messages.length && messages[i].role === 'tool') {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: messages[i].tool_call_id,
          content: String(messages[i].content ?? ''),
        });
        i++;
      }
      i--; // 补偿 for 循环自增
      converted.push({ role: 'user', content: toolResults });
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
  // 预建 tool_call_id → function name 映射（供 tool result 消息使用）
  const toolCallMap = {};
  for (const msg of messages) {
    if (Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        if (tc.id && tc.function?.name) toolCallMap[tc.id] = tc.function.name;
      }
    }
  }

  const systemParts = [];
  const contents = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === 'system') {
      const text = typeof msg.content === 'string' ? msg.content : (msg.content || []).map((p) => p.text || '').join('');
      if (text) systemParts.push(text);
      continue;
    }

    // OpenAI-format tool call → Gemini functionCall parts
    if (msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      const parts = [];
      const text = typeof msg.content === 'string' ? msg.content : '';
      if (text) parts.push({ text });
      for (const tc of msg.tool_calls) {
        let args = {};
        try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { /* ignore */ }
        parts.push({ functionCall: { name: tc.function?.name || '', args } });
      }
      contents.push({ role: 'model', parts });
      continue;
    }

    // OpenAI-format tool result messages → Gemini functionResponse parts（连续合并）
    if (msg.role === 'tool') {
      const fnResponses = [];
      while (i < messages.length && messages[i].role === 'tool') {
        fnResponses.push({
          functionResponse: {
            name: toolCallMap[messages[i].tool_call_id] || 'unknown',
            response: { output: String(messages[i].content ?? '') },
          },
        });
        i++;
      }
      i--; // 补偿 for 循环自增
      contents.push({ role: 'user', parts: fnResponses });
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

  let inThinking = false;
  for await (const { data } of parseSSE(resp.body)) {
    try {
      const parsed = JSON.parse(data);
      const delta = parsed.choices?.[0]?.delta;
      if (!delta) continue;
      // OpenRouter 等 provider 将推理内容放在 reasoning / reasoning_content 字段
      const reasoning = delta.reasoning || delta.reasoning_content;
      if (reasoning) {
        if (!inThinking) { yield '<think>'; inThinking = true; }
        yield reasoning;
      }
      if (delta.content) {
        if (inThinking) { yield '</think>\n'; inThinking = false; }
        yield delta.content;
      }
    } catch {
      // 跳过无法解析的行
    }
  }
  if (inThinking) yield '</think>\n';
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
  const msg = data.choices?.[0]?.message;
  if (!msg) return '';
  const reasoning = msg.reasoning || msg.reasoning_content;
  const content = msg.content || '';
  return reasoning ? `<think>${reasoning}</think>\n${content}` : content;
}

// ============================================================
// Anthropic 原生实现
// ============================================================

/**
 * 将 thinking_level 映射为 thinking budget_tokens（Anthropic 和 Gemini 共用）
 * budget_low=1024, budget_medium=8192, budget_high=16384
 */
function resolveThinkingBudget(thinking_level) {
  const MAP = { budget_low: 1024, budget_medium: 8192, budget_high: 16384 };
  return MAP[thinking_level] ?? null;
}

/** @deprecated 兼容别名 */
function resolveAnthropicThinking(thinking_level) {
  return resolveThinkingBudget(thinking_level);
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

  const thinkingBudget = resolveThinkingBudget(config.thinking_level);
  if (thinkingBudget != null) {
    body.generationConfig.thinkingConfig = { thinkingBudget };
  }

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

  let inThinking = false;
  for await (const { data } of parseSSE(resp.body)) {
    try {
      const parsed = JSON.parse(data);
      const parts = parsed.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (!part.text) continue;
        if (part.thought) {
          if (!inThinking) { yield '<think>'; inThinking = true; }
          yield part.text;
        } else {
          if (inThinking) { yield '</think>\n'; inThinking = false; }
          yield part.text;
        }
      }
    } catch {
      // skip
    }
  }
  if (inThinking) yield '</think>\n';
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

  const thinkingBudget = resolveThinkingBudget(config.thinking_level);
  if (thinkingBudget != null) {
    body.generationConfig.thinkingConfig = { thinkingBudget };
  }

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
  const parts = data.candidates?.[0]?.content?.parts || [];
  let result = '';
  for (const part of parts) {
    if (!part.text) continue;
    if (part.thought) {
      result += `<think>${part.text}</think>\n`;
    } else {
      result += part.text;
    }
  }
  return result;
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

// ============================================================
// Tool-use 公共辅助
// ============================================================

/** 执行单个 tool call，返回字符串结果 */
async function executeToolCall(tc, toolHandlers) {
  const fn = toolHandlers[tc.function?.name];
  if (!fn) return `工具未定义：${tc.function?.name}`;
  try {
    const args = JSON.parse(tc.function.arguments || '{}');
    return String(await fn(args));
  } catch (e) {
    return `工具执行失败：${e.message}`;
  }
}

/** OpenAI tool def → Anthropic tool format */
function toAnthropicTools(toolDefs) {
  return toolDefs.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}

/** OpenAI tool def → Gemini functionDeclarations format */
function toGeminiTools(toolDefs) {
  return [{ functionDeclarations: toolDefs.map((t) => ({ name: t.function.name, description: t.function.description, parameters: t.function.parameters })) }];
}

// ============================================================
// OpenAI-compatible tool loop
// ============================================================

async function completeOpenAICompatibleWithTools(messages, toolDefs, toolHandlers, config) {
  const baseUrl = getBaseUrl(config);
  const url = `${baseUrl}/chat/completions`;
  let currentMessages = [...messages];

  for (let i = 0; i < 5; i++) {
    const effort = resolveReasoningEffort(config.thinking_level);
    const body = { model: config.model, messages: currentMessages, tools: toolDefs, tool_choice: 'auto', max_tokens: config.max_tokens, stream: false };
    if (effort) body.reasoning_effort = effort;
    else body.temperature = config.temperature;

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.api_key}` },
      body: JSON.stringify(body),
      signal: config.signal,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      if (resp.status === 400 || resp.status === 422) return completeOpenAICompatible(currentMessages, config);
      throw apiError(`${config.provider} API error: ${resp.status} ${text}`, resp.status);
    }

    const data = await resp.json();
    const message = data.choices?.[0]?.message;
    if (!message) return '';

    if (!message.tool_calls?.length) {
      const reasoning = message.reasoning || message.reasoning_content;
      const content = message.content || '';
      return reasoning ? `<think>${reasoning}</think>\n${content}` : content;
    }

    currentMessages.push({ role: 'assistant', content: message.content || null, tool_calls: message.tool_calls });
    for (const tc of message.tool_calls) {
      currentMessages.push({ role: 'tool', tool_call_id: tc.id, content: await executeToolCall(tc, toolHandlers) });
    }
  }

  return completeOpenAICompatible(currentMessages, config);
}

// ============================================================
// Anthropic tool loop
// ============================================================

async function completeAnthropicWithTools(messages, toolDefs, toolHandlers, config) {
  const baseUrl = getBaseUrl(config);
  const url = `${baseUrl}/v1/messages`;
  const headers = { 'Content-Type': 'application/json', 'x-api-key': config.api_key, 'anthropic-version': '2023-06-01' };
  let currentMessages = [...messages];

  for (let i = 0; i < 5; i++) {
    const { system, messages: anthropicMsgs } = convertToAnthropicMessages(currentMessages);
    const body = { model: config.model, messages: anthropicMsgs, tools: toAnthropicTools(toolDefs), max_tokens: config.max_tokens || 4096 };
    if (config.temperature != null) body.temperature = config.temperature;
    if (system) body.system = system;

    const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: config.signal });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      if (resp.status === 400 || resp.status === 422) return completeAnthropic(messages, config);
      throw apiError(`Anthropic API error: ${resp.status} ${text}`, resp.status);
    }

    const data = await resp.json();
    const content = data.content || [];
    const toolUseBlocks = content.filter((b) => b.type === 'tool_use');
    const textContent = content.filter((b) => b.type === 'text').map((b) => b.text).join('');

    if (!toolUseBlocks.length) return textContent;

    const openaiToolCalls = toolUseBlocks.map((b) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input) } }));
    currentMessages.push({ role: 'assistant', content: textContent || null, tool_calls: openaiToolCalls });
    for (const block of toolUseBlocks) {
      const fn = toolHandlers[block.name];
      let result;
      try { result = fn ? String(await fn(block.input)) : `工具未定义：${block.name}`; }
      catch (e) { result = `工具执行失败：${e.message}`; }
      currentMessages.push({ role: 'tool', tool_call_id: block.id, content: result });
    }
  }

  return completeAnthropic(currentMessages, config);
}

// ============================================================
// Gemini tool loop
// ============================================================

async function completeGeminiWithTools(messages, toolDefs, toolHandlers, config) {
  const baseUrl = getBaseUrl(config);
  const model = (config.model || 'gemini-pro').replace(/^models\//, '');
  const url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${config.api_key}`;
  let currentMessages = [...messages];

  for (let i = 0; i < 5; i++) {
    const { contents, systemInstruction } = convertToGeminiContents(currentMessages);
    const body = { contents, tools: toGeminiTools(toolDefs) };
    if (systemInstruction) body.systemInstruction = systemInstruction;
    body.generationConfig = {};
    if (config.temperature != null) body.generationConfig.temperature = config.temperature;
    if (config.max_tokens != null) body.generationConfig.maxOutputTokens = config.max_tokens;

    const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: config.signal });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      if (resp.status === 400 || resp.status === 422) return completeGemini(messages, config);
      throw apiError(`Gemini API error: ${resp.status} ${text}`, resp.status);
    }

    const data = await resp.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const functionCalls = parts.filter((p) => p.functionCall);
    const textContent = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('');

    if (!functionCalls.length) return textContent;

    const openaiToolCalls = functionCalls.map((p, idx) => ({ id: `gc_${i}_${idx}`, type: 'function', function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args || {}) } }));
    currentMessages.push({ role: 'assistant', content: textContent || null, tool_calls: openaiToolCalls });
    for (let j = 0; j < functionCalls.length; j++) {
      const fc = functionCalls[j].functionCall;
      const fn = toolHandlers[fc.name];
      let result;
      try { result = fn ? String(await fn(fc.args || {})) : `工具未定义：${fc.name}`; }
      catch (e) { result = `工具执行失败：${e.message}`; }
      currentMessages.push({ role: 'tool', tool_call_id: openaiToolCalls[j].id, content: result });
    }
  }

  return completeGemini(currentMessages, config);
}

// ============================================================
// resolveToolContext（流式预检）
// ============================================================

async function resolveToolContextOpenAI(messages, toolDefs, toolHandlers, config) {
  const baseUrl = getBaseUrl(config);
  const url = `${baseUrl}/chat/completions`;
  let currentMessages = [...messages];
  let enriched = false;

  for (let i = 0; i < 5; i++) {
    const effort = resolveReasoningEffort(config.thinking_level);
    const body = { model: config.model, messages: currentMessages, tools: toolDefs, tool_choice: 'auto', max_tokens: i === 0 ? 1000 : config.max_tokens, stream: false };
    if (effort) body.reasoning_effort = effort;
    else body.temperature = config.temperature ?? 0;

    let resp;
    try {
      resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.api_key}` }, body: JSON.stringify(body), signal: config.signal });
    } catch { return enriched ? currentMessages : messages; }
    if (!resp.ok) return enriched ? currentMessages : messages;

    const data = await resp.json();
    const message = data.choices?.[0]?.message;
    if (!message || !message.tool_calls?.length) return enriched ? currentMessages : messages;

    currentMessages.push({ role: 'assistant', content: message.content || null, tool_calls: message.tool_calls });
    for (const tc of message.tool_calls) {
      currentMessages.push({ role: 'tool', tool_call_id: tc.id, content: await executeToolCall(tc, toolHandlers) });
    }
    enriched = true;
  }

  return enriched ? currentMessages : messages;
}

async function resolveToolContextAnthropic(messages, toolDefs, toolHandlers, config) {
  const baseUrl = getBaseUrl(config);
  const url = `${baseUrl}/v1/messages`;
  const headers = { 'Content-Type': 'application/json', 'x-api-key': config.api_key, 'anthropic-version': '2023-06-01' };
  let currentMessages = [...messages];
  let enriched = false;

  for (let i = 0; i < 5; i++) {
    const { system, messages: anthropicMsgs } = convertToAnthropicMessages(currentMessages);
    const body = { model: config.model, messages: anthropicMsgs, tools: toAnthropicTools(toolDefs), max_tokens: i === 0 ? 1000 : (config.max_tokens || 4096), temperature: 0 };
    if (system) body.system = system;

    let resp;
    try { resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: config.signal }); }
    catch { return enriched ? currentMessages : messages; }
    if (!resp.ok) return enriched ? currentMessages : messages;

    const data = await resp.json();
    const content = data.content || [];
    const toolUseBlocks = content.filter((b) => b.type === 'tool_use');
    if (!toolUseBlocks.length) return enriched ? currentMessages : messages;

    const openaiToolCalls = toolUseBlocks.map((b) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input) } }));
    const textContent = content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    currentMessages.push({ role: 'assistant', content: textContent || null, tool_calls: openaiToolCalls });
    for (const block of toolUseBlocks) {
      const fn = toolHandlers[block.name];
      let result;
      try { result = fn ? String(await fn(block.input)) : `工具未定义：${block.name}`; }
      catch (e) { result = `工具执行失败：${e.message}`; }
      currentMessages.push({ role: 'tool', tool_call_id: block.id, content: result });
    }
    enriched = true;
  }

  return enriched ? currentMessages : messages;
}

async function resolveToolContextGemini(messages, toolDefs, toolHandlers, config) {
  const baseUrl = getBaseUrl(config);
  const model = (config.model || 'gemini-pro').replace(/^models\//, '');
  const url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${config.api_key}`;
  let currentMessages = [...messages];
  let enriched = false;

  for (let i = 0; i < 5; i++) {
    const { contents, systemInstruction } = convertToGeminiContents(currentMessages);
    const body = { contents, tools: toGeminiTools(toolDefs) };
    if (systemInstruction) body.systemInstruction = systemInstruction;
    body.generationConfig = { maxOutputTokens: i === 0 ? 1000 : config.max_tokens, temperature: 0 };

    let resp;
    try { resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: config.signal }); }
    catch { return enriched ? currentMessages : messages; }
    if (!resp.ok) return enriched ? currentMessages : messages;

    const data = await resp.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const functionCalls = parts.filter((p) => p.functionCall);
    if (!functionCalls.length) return enriched ? currentMessages : messages;

    const textContent = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('');
    const openaiToolCalls = functionCalls.map((p, idx) => ({ id: `gc_${i}_${idx}`, type: 'function', function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args || {}) } }));
    currentMessages.push({ role: 'assistant', content: textContent || null, tool_calls: openaiToolCalls });
    for (let j = 0; j < functionCalls.length; j++) {
      const fc = functionCalls[j].functionCall;
      const fn = toolHandlers[fc.name];
      let result;
      try { result = fn ? String(await fn(fc.args || {})) : `工具未定义：${fc.name}`; }
      catch (e) { result = `工具执行失败：${e.message}`; }
      currentMessages.push({ role: 'tool', tool_call_id: openaiToolCalls[j].id, content: result });
    }
    enriched = true;
  }

  return enriched ? currentMessages : messages;
}

// ============================================================
// 统一导出（tool-use）
// ============================================================

export async function completeWithTools(messages, toolDefs, toolHandlers, config) {
  if (config.provider === 'anthropic') {
    return completeAnthropicWithTools(messages, toolDefs, toolHandlers, config);
  } else if (config.provider === 'gemini') {
    return completeGeminiWithTools(messages, toolDefs, toolHandlers, config);
  } else if (OPENAI_COMPATIBLE.has(config.provider)) {
    return completeOpenAICompatibleWithTools(messages, toolDefs, toolHandlers, config);
  }
  throw apiError(`不支持的 provider: ${config.provider}`, 400);
}

export async function resolveToolContext(messages, toolDefs, toolHandlers, config) {
  if (config.provider === 'anthropic') {
    return resolveToolContextAnthropic(messages, toolDefs, toolHandlers, config);
  } else if (config.provider === 'gemini') {
    return resolveToolContextGemini(messages, toolDefs, toolHandlers, config);
  } else if (OPENAI_COMPATIBLE.has(config.provider)) {
    return resolveToolContextOpenAI(messages, toolDefs, toolHandlers, config);
  }
  return messages;
}
