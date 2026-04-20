import { parseDataUrl } from './_utils.js';

/**
 * 内部格式 → Anthropic Messages API 格式
 * system 消息提取到顶层，content 数组转 Anthropic block 格式
 */
export function convertToAnthropicMessages(messages) {
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

export function convertContentToAnthropic(content) {
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

export function convertContentToGemini(content) {
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
