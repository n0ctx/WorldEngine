import test from 'node:test';
import assert from 'node:assert/strict';

import { parseSSE } from '../../llm/providers/_shared/fetch-utils.js';
import { applyThinkingToOpenAICompatibleBody } from '../../llm/providers/openai-compatible/thinking.js';
import { OPENAI_COMPATIBLE, getBaseUrl } from '../../llm/providers/_shared/base-urls.js';
import { PROVIDER_THINKING_LEVELS, THINKING_BUDGET_HIGH } from '../../../shared/thinking-levels.mjs';

const LOCAL_PROVIDERS = ['ollama', 'lmstudio', 'llamacpp'];
// 这两家在 OPENAI_COMPATIBLE 集合里，但请求走 Anthropic 适配器（见 cloud-router.js），由 anthropic 的测试覆盖
const NAMED_ADAPTER_PROVIDERS = ['kimi-coding', 'minimax-coding'];

test('parseSSE 支持 Web ReadableStream 返回体', async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('event: content_block_delta\n'));
      controller.enqueue(encoder.encode('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"测试"}}\n\n'));
      controller.close();
    },
  });

  const events = [];
  for await (const evt of parseSSE(stream)) {
    events.push(evt);
  }

  assert.deepEqual(events, [
    {
      event: 'content_block_delta',
      data: '{"type":"content_block_delta","delta":{"type":"text_delta","text":"测试"}}',
    },
  ]);
});

test('parseSSE 会处理流结束前未以空行收尾的最后一个事件', async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('event: content_block_delta\n'));
      controller.enqueue(encoder.encode('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"尾块"}}'));
      controller.close();
    },
  });

  const events = [];
  for await (const evt of parseSSE(stream)) {
    events.push(evt);
  }

  assert.deepEqual(events, [
    {
      event: 'content_block_delta',
      data: '{"type":"content_block_delta","delta":{"type":"text_delta","text":"尾块"}}',
    },
  ]);
});

test('parseSSE 兼容冒号后无空格的 SSE 行格式', async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('event:content_block_delta\n'));
      controller.enqueue(encoder.encode('data:{"type":"content_block_delta","delta":{"type":"text_delta","text":"Kimi"}}\n\n'));
      controller.close();
    },
  });

  const events = [];
  for await (const evt of parseSSE(stream)) {
    events.push(evt);
  }

  assert.deepEqual(events, [
    {
      event: 'content_block_delta',
      data: '{"type":"content_block_delta","delta":{"type":"text_delta","text":"Kimi"}}',
    },
  ]);
});

function applyThinking(provider, thinking_level, body = {}) {
  const state = applyThinkingToOpenAICompatibleBody(body, { provider, thinking_level });
  return { body, state };
}

test('applyThinking: openai 写入 reasoning_effort，关闭发 none 并保留 temperature', () => {
  assert.deepEqual(applyThinking('openai', 'effort_xhigh'), { body: { reasoning_effort: 'xhigh' }, state: 'enabled' });
  assert.deepEqual(applyThinking('openai', 'thinking_disabled'), { body: { reasoning_effort: 'none' }, state: 'disabled' });
});

test('applyThinking: openrouter 强度档用 reasoning.effort，开关用 reasoning.enabled', () => {
  assert.deepEqual(applyThinking('openrouter', 'effort_max').body, { reasoning: { effort: 'max' } });
  assert.deepEqual(applyThinking('openrouter', 'thinking_enabled'), { body: { reasoning: { enabled: true } }, state: 'enabled' });
  assert.deepEqual(applyThinking('openrouter', 'thinking_disabled'), { body: { reasoning: { enabled: false } }, state: 'disabled' });
});

test('applyThinking: grok 强度原样下发', () => {
  assert.deepEqual(applyThinking('grok', 'effort_medium'), { body: { reasoning_effort: 'medium' }, state: 'enabled' });
});

test('xiaomi 未填接口地址时用 MiMo 官方地址，填了则用填写的', () => {
  assert.equal(getBaseUrl({ provider: 'xiaomi' }), 'https://api.xiaomimimo.com/v1');
  assert.equal(getBaseUrl({ provider: 'xiaomi', base_url: 'https://proxy.example/v1/' }), 'https://proxy.example/v1');
});

test('xiaomi-coding 未填接口地址时用 Token Plan 国内地址，填了则用所填地区地址', () => {
  assert.equal(getBaseUrl({ provider: 'xiaomi-coding' }), 'https://token-plan-cn.xiaomimimo.com/v1');
  assert.equal(getBaseUrl({ provider: 'xiaomi-coding', base_url: 'https://token-plan-ams.xiaomimimo.com/v1' }), 'https://token-plan-ams.xiaomimimo.com/v1');
});

test('applyThinking: xiaomi / xiaomi-coding 用 thinking.type 开关，不发 reasoning_effort', () => {
  for (const provider of ['xiaomi', 'xiaomi-coding']) {
    assert.deepEqual(applyThinking(provider, 'thinking_enabled'), { body: { thinking: { type: 'enabled' } }, state: 'enabled' });
    assert.deepEqual(applyThinking(provider, 'effort_high'), { body: {}, state: null });
  }
});

test('applyThinking: glm / glm-coding 开关写 thinking.type，强度档另加 reasoning_effort', () => {
  assert.deepEqual(applyThinking('glm', 'thinking_enabled').body, { thinking: { type: 'enabled' } });
  assert.deepEqual(applyThinking('glm-coding', 'thinking_disabled'), { body: { thinking: { type: 'disabled' } }, state: 'disabled' });
  assert.deepEqual(applyThinking('glm', 'effort_high').body, { thinking: { type: 'enabled' }, reasoning_effort: 'high' });
});

test('applyThinking: deepseek 关闭写 thinking.type，强度档开启并带 reasoning_effort', () => {
  assert.deepEqual(applyThinking('deepseek', 'thinking_disabled'), { body: { thinking: { type: 'disabled' } }, state: 'disabled' });
  assert.deepEqual(applyThinking('deepseek', 'effort_max').body, { thinking: { type: 'enabled' }, reasoning_effort: 'max' });
});

test('applyThinking: kimi 关闭写 thinking.type（K2.6），强度档写 reasoning_effort（K3）', () => {
  assert.deepEqual(applyThinking('kimi', 'thinking_disabled'), { body: { thinking: { type: 'disabled' } }, state: 'disabled' });
  assert.deepEqual(applyThinking('kimi', 'effort_low'), { body: { reasoning_effort: 'low' }, state: 'enabled' });
});

test('applyThinking: minimax 开启发 adaptive，关闭发 disabled', () => {
  assert.deepEqual(applyThinking('minimax', 'thinking_enabled').body, { thinking: { type: 'adaptive' } });
  assert.deepEqual(applyThinking('minimax', 'thinking_disabled'), { body: { thinking: { type: 'disabled' } }, state: 'disabled' });
});

test('applyThinking: qwen 预算档 → enable_thinking + thinking_budget', () => {
  assert.deepEqual(applyThinking('qwen', 'qwen_high'), {
    body: { enable_thinking: true, thinking_budget: THINKING_BUDGET_HIGH },
    state: 'enabled',
  });
});

test('applyThinking: siliconflow thinking_disabled → enable_thinking=false', () => {
  assert.deepEqual(applyThinking('siliconflow', 'thinking_disabled'), { body: { enable_thinking: false }, state: 'disabled' });
});

test('applyThinking: ollama 强度档写 reasoning_effort，关闭发 none', () => {
  assert.deepEqual(applyThinking('ollama', 'effort_low'), { body: { reasoning_effort: 'low' }, state: 'enabled' });
  assert.deepEqual(applyThinking('ollama', 'thinking_disabled'), { body: { reasoning_effort: 'none' }, state: 'disabled' });
});

test('applyThinking: llamacpp effort_* → reasoning_effort（Qwen3 模板按请求覆盖）', () => {
  const cases = [
    ['effort_low', 'low'],
    ['effort_medium', 'medium'],
    ['effort_high', 'xhigh'],
  ];
  for (const [lvl, expected] of cases) {
    assert.deepEqual(applyThinking('llamacpp', lvl), { body: { reasoning_effort: expected }, state: 'enabled' });
  }
});

test('applyThinking: llamacpp thinking_disabled → chat_template_kwargs.enable_thinking=false', () => {
  const { body, state } = applyThinking('llamacpp', 'thinking_disabled', { chat_template_kwargs: { other: 1 } });
  assert.equal(state, 'disabled');
  assert.deepEqual(body, { chat_template_kwargs: { other: 1, enable_thinking: false } });
});

test('applyThinking: 档位表里没有的档位不下发（换服务商带过来的旧档位、lmstudio）', () => {
  const cases = [
    ['openai', 'effort_minimal'],
    ['openai', 'budget_low'],
    ['grok', 'effort_max'],
    ['deepseek', 'effort_medium'],
    ['llamacpp', 'qwen_high'],
    ['lmstudio', 'effort_high'],
    ['openai', 'none'],
  ];
  for (const [provider, lvl] of cases) {
    assert.deepEqual(applyThinking(provider, lvl), { body: {}, state: null }, `${provider} ${lvl}`);
  }
});

test('applyThinking: thinking_level 为空时返回 null', () => {
  assert.deepEqual(applyThinking('openai', null), { body: {}, state: null });
});

test('applyThinking: openai-compatible 族档位表里的每个档位都写出了请求字段', () => {
  const otherAdapters = [];
  for (const [provider, options] of Object.entries(PROVIDER_THINKING_LEVELS)) {
    const viaThisFunction = (OPENAI_COMPATIBLE.has(provider) || LOCAL_PROVIDERS.includes(provider))
      && !NAMED_ADAPTER_PROVIDERS.includes(provider);
    if (!viaThisFunction) {
      otherAdapters.push(provider);
      continue;
    }
    for (const { value } of options) {
      const { body, state } = applyThinking(provider, value);
      assert.notEqual(state, null, `${provider} ${value}`);
      assert.ok(Object.keys(body).length > 0, `${provider} ${value}`);
    }
  }
  // 其余走 Anthropic / Gemini 适配器，由 thinking-request-body.test.js 逐档覆盖
  assert.deepEqual(otherAdapters.sort(), ['anthropic', 'gemini', 'kimi-coding', 'minimax-coding']);
});
