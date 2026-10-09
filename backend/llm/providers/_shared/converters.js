import { parseDataUrl, safeParseJson } from './fetch-utils.js';

/** 字符串 content 原样返回；part 数组拼接各 part 的文本 */
function contentText(content) {
  return typeof content === 'string' ? content : (content || []).map((p) => p.text || '').join('');
}

function collectSystemMessage(msg, systemParts) {
  if (msg.role !== 'system') return false;
  const text = contentText(msg.content);
  if (text) systemParts.push(text);
  return true;
}

/**
 * 内部格式 → Anthropic Messages API 格式
 * system 消息提取到顶层，content 数组转 Anthropic block 格式
 */
export function convertToAnthropicMessages(messages) {
  const systemParts = [];
  const converted = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (collectSystemMessage(msg, systemParts)) continue;

    // OpenAI-format tool call → Anthropic tool_use blocks
    if (msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      const blocks = [];
      const text = typeof msg.content === 'string' ? msg.content : '';
      if (text) blocks.push({ type: 'text', text });
      for (const tc of msg.tool_calls) {
        const input = safeParseJson(tc.function?.arguments || '{}');
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
export function convertToGeminiContents(messages) {
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

    if (collectSystemMessage(msg, systemParts)) continue;

    // OpenAI-format tool call → Gemini functionCall parts
    if (msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      if (msg._geminiParts) {
        // 优先使用原始 Gemini parts，保留 thought_signature 等思考模型字段
        contents.push({ role: 'model', parts: msg._geminiParts });
      } else {
        const parts = [];
        const text = typeof msg.content === 'string' ? msg.content : '';
        if (text) parts.push({ text });
        for (const tc of msg.tool_calls) {
          const args = safeParseJson(tc.function?.arguments || '{}');
          parts.push({ functionCall: { name: tc.function?.name || '', args } });
        }
        contents.push({ role: 'model', parts });
      }
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

/**
 * 内部格式 → Ollama 原生 /api/chat 格式
 * content 数组拆成文本 + images（base64），工具调用参数转回对象，工具结果补 tool_name
 */
export function convertToOllamaMessages(messages) {
  const toolNames = new Map();
  return messages.map((msg) => {
    const converted = { role: msg.role, content: msg.role === 'tool' ? String(msg.content ?? '') : contentText(msg.content) };
    if (Array.isArray(msg.content)) {
      const images = msg.content
        .filter((part) => part.type === 'image_url')
        .map((part) => parseDataUrl(part.image_url.url)?.data)
        .filter(Boolean);
      if (images.length) converted.images = images;
    }
    if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      converted.tool_calls = msg.tool_calls.map((tc) => {
        toolNames.set(tc.id, tc.function?.name);
        return { id: tc.id, function: { name: tc.function?.name || '', arguments: safeParseJson(tc.function?.arguments || '{}') } };
      });
    }
    if (msg.role === 'tool') {
      converted.tool_call_id = msg.tool_call_id;
      const name = toolNames.get(msg.tool_call_id);
      if (name) converted.tool_name = name;
    }
    return converted;
  });
}

const ARGUMENTS_ERROR_PREVIEW_CHARS = 200;

/**
 * 解析一个工具调用的 arguments，返回 { value, text, error? }：
 *   value 给 handler 用，text 是回写 assistant 消息用的 JSON 字符串。
 *   已是对象直接用；空串或缺省视为 {}；JSON 非法时 error 带原文前 200 字符，text 回写成 '{}'（非法 JSON 留在历史里会被部分接口拒收）。
 */
function parseToolArguments(raw) {
  if (raw !== null && typeof raw === 'object') return { value: raw, text: JSON.stringify(raw) };
  const str = raw === undefined || raw === null ? '' : String(raw);
  if (!str.trim()) return { value: {}, text: '{}' };
  try {
    return { value: JSON.parse(str), text: str };
  } catch (err) {
    const preview = str.slice(0, ARGUMENTS_ERROR_PREVIEW_CHARS);
    return { value: {}, text: '{}', error: `${err.message}；收到的参数开头：${preview}` };
  }
}

/**
 * OpenAI 格式的 tool_calls → 工具循环用的调用列表，并给出回写 assistant 消息用的 tool_calls。
 *
 * @returns {{ toolCalls: Array<{id, name, arguments, argumentsError?}>, assistantToolCalls: Array }}
 *   - toolCalls：解析失败的项带 argumentsError，循环层不会执行它；
 *   - assistantToolCalls：缺 id 的补成 call_<iter>_<idx>（与 toolCalls 的 id 一致），arguments 一律是字符串。
 */
export function normalizeOpenAIToolCalls(rawCalls, iter) {
  const toolCalls = [];
  const assistantToolCalls = [];
  (rawCalls || []).forEach((tc, idx) => {
    const id = tc.id || `call_${iter}_${idx}`;
    const name = tc.function?.name;
    const parsed = parseToolArguments(tc.function?.arguments);
    const call = { id, name, arguments: parsed.value };
    if (parsed.error) call.argumentsError = parsed.error;
    toolCalls.push(call);
    assistantToolCalls.push({ ...tc, id, type: tc.type || 'function', function: { ...tc.function, name, arguments: parsed.text } });
  });
  return { toolCalls, assistantToolCalls };
}

/** 工具循环：按 OpenAI 格式把 assistant 块和各工具结果追加到消息列表 */
export function appendOpenAIToolTurn(state, turn, results) {
  const toolMessages = turn.toolCalls.map((c, i) => ({
    role: 'tool',
    tool_call_id: c.id,
    content: results[i],
  }));
  return {
    messages: [...state.messages, turn.assistantBlock, ...toolMessages],
  };
}
