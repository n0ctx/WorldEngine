/**
 * Ollama 原生接口 /api/chat 的请求体与响应解析，由 index.js 按 provider 选用。
 *
 * Ollama 的 OpenAI 兼容接口会丢掉 top_k、min_p、repeat_penalty 等采样参数，所以改走原生接口：
 * 生成参数写进 options，思考档位写 think，流式响应是逐行 JSON。
 */

import { isThinkingLevelSupported } from '../../../utils/constants.js';
import { apiError } from '../_shared/fetch-utils.js';
import { convertToOllamaMessages } from '../_shared/converters.js';
import { resolveSamplingFields } from '../_shared/sampling.js';
import { resolveThinkingEffort } from '../_shared/thinking-budget.js';

// think：关闭发 false，强度档发 low / medium / high；「自动」不下发，由模型决定
function resolveThink(config) {
  const level = config.thinking_level;
  if (!level || !isThinkingLevelSupported(config.provider, level)) return undefined;
  return level === 'thinking_disabled' ? false : resolveThinkingEffort(level);
}

function buildBody({ messages, stream, tools }, config) {
  const body = {
    model: config.model,
    messages: convertToOllamaMessages(messages),
    stream,
    options: {
      temperature: config.temperature,
      num_predict: config.max_tokens,
      ...resolveSamplingFields(config),
    },
  };
  if (tools) body.tools = tools;
  const think = resolveThink(config);
  if (think !== undefined) body.think = think;
  return body;
}

async function* parseNdjson(body) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (line.trim()) yield line;
    }
  }
  if (buffer.trim()) yield buffer;
}

async function* readDeltas(resp) {
  for await (const line of parseNdjson(resp.body)) {
    let chunk;
    try {
      chunk = JSON.parse(line);
    } catch {
      continue;
    }
    if (chunk.error) throw apiError(`ollama API error: ${chunk.error}`);
    yield {
      reasoning: chunk.message?.thinking,
      content: chunk.message?.content,
      ...(chunk.done
        ? { finishReason: chunk.done_reason, usage: { prompt_tokens: chunk.prompt_eval_count, completion_tokens: chunk.eval_count } }
        : {}),
    };
  }
}

function readResult(data) {
  const message = data.message && {
    content: data.message.content,
    reasoning: data.message.thinking,
    tool_calls: data.message.tool_calls,
  };
  return { message, finishReason: data.done_reason };
}

export const OLLAMA_NATIVE_PROTOCOL = { path: '/api/chat', buildBody, readDeltas, readResult };
