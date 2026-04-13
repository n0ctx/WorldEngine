/**
 * 本地 LLM Provider 适配 — Ollama / LM Studio
 *
 * 两者均使用 OpenAI-compatible /v1/chat/completions 接口
 */

const DEFAULT_BASE_URLS = {
  ollama: 'http://localhost:11434',
  lmstudio: 'http://localhost:1234',
};

function getBaseUrl(config) {
  return (config.base_url || DEFAULT_BASE_URLS[config.provider] || '').replace(/\/+$/, '');
}

function apiError(message, status, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

async function* parseSSE(body) {
  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;
        yield data;
      }
    }
  }
}

export async function* streamChat(messages, config) {
  const baseUrl = getBaseUrl(config);
  const url = `${baseUrl}/v1/chat/completions`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature,
      max_tokens: config.max_tokens,
      stream: true,
    }),
    signal: config.signal,
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw apiError(`${config.provider} API error: ${resp.status} ${body}`, resp.status);
  }

  for await (const data of parseSSE(resp.body)) {
    try {
      const parsed = JSON.parse(data);
      const delta = parsed.choices?.[0]?.delta?.content;
      if (delta) yield delta;
    } catch {
      // skip
    }
  }
}

export async function complete(messages, config) {
  const baseUrl = getBaseUrl(config);
  const url = `${baseUrl}/v1/chat/completions`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature,
      max_tokens: config.max_tokens,
      stream: false,
    }),
    signal: config.signal,
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw apiError(`${config.provider} API error: ${resp.status} ${body}`, resp.status);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}
