import test from 'node:test';
import assert from 'node:assert/strict';

import { parseSSE, applyThinkingToOpenAICompatibleBody } from '../../llm/providers/_utils.js';

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

test('applyThinking: openai 写入 reasoning_effort 顶层字段', () => {
  const body = {};
  const state = applyThinkingToOpenAICompatibleBody(body, { provider: 'openai', thinking_level: 'effort_medium' });
  assert.equal(body.reasoning_effort, 'medium');
  assert.equal(state, 'enabled');
});

test('applyThinking: openrouter 使用 reasoning.effort 对象', () => {
  const body = {};
  const state = applyThinkingToOpenAICompatibleBody(body, { provider: 'openrouter', thinking_level: 'effort_high' });
  assert.deepEqual(body.reasoning, { effort: 'high' });
  assert.equal(state, 'enabled');
});

test('applyThinking: openrouter 支持 thinking_enabled → reasoning.enabled', () => {
  const body = {};
  const state = applyThinkingToOpenAICompatibleBody(body, { provider: 'openrouter', thinking_level: 'thinking_enabled' });
  assert.deepEqual(body.reasoning, { enabled: true });
  assert.equal(state, 'enabled');
});

test('applyThinking: grok 把 medium 兜底为 high（grok 仅支持 low/high）', () => {
  const body = {};
  const state = applyThinkingToOpenAICompatibleBody(body, { provider: 'grok', thinking_level: 'effort_medium' });
  assert.equal(body.reasoning_effort, 'high');
  assert.equal(state, 'enabled');
});

test('applyThinking: glm 写入 thinking.type=enabled', () => {
  const body = {};
  const state = applyThinkingToOpenAICompatibleBody(body, { provider: 'glm', thinking_level: 'thinking_enabled' });
  assert.deepEqual(body.thinking, { type: 'enabled' });
  assert.equal(state, 'enabled');
});

test('applyThinking: glm-coding 与 glm 行为一致', () => {
  const body = {};
  const state = applyThinkingToOpenAICompatibleBody(body, { provider: 'glm-coding', thinking_level: 'thinking_disabled' });
  assert.deepEqual(body.thinking, { type: 'disabled' });
  assert.equal(state, 'disabled');
});

test('applyThinking: deepseek 写入 thinking.type', () => {
  const body = {};
  const state = applyThinkingToOpenAICompatibleBody(body, { provider: 'deepseek', thinking_level: 'thinking_enabled' });
  assert.deepEqual(body.thinking, { type: 'enabled' });
  assert.equal(state, 'enabled');
});

test('applyThinking: qwen qwen_high → enable_thinking + thinking_budget', () => {
  const body = {};
  const state = applyThinkingToOpenAICompatibleBody(body, { provider: 'qwen', thinking_level: 'qwen_high' });
  assert.equal(body.enable_thinking, true);
  assert.equal(typeof body.thinking_budget, 'number');
  assert.ok(body.thinking_budget > 0);
  assert.equal(state, 'enabled');
});

test('applyThinking: siliconflow thinking_disabled → enable_thinking=false', () => {
  const body = {};
  const state = applyThinkingToOpenAICompatibleBody(body, { provider: 'siliconflow', thinking_level: 'thinking_disabled' });
  assert.equal(body.enable_thinking, false);
  assert.equal(state, 'disabled');
});

test('applyThinking: kimi / minimax 模型驱动，不下发字段', () => {
  for (const provider of ['kimi', 'minimax']) {
    const body = {};
    const state = applyThinkingToOpenAICompatibleBody(body, { provider, thinking_level: 'effort_high' });
    assert.equal(state, null);
    assert.deepEqual(body, {});
  }
});

test('applyThinking: 不识别的命名空间静默忽略（如 deepseek 收到 effort_*）', () => {
  const body = {};
  const state = applyThinkingToOpenAICompatibleBody(body, { provider: 'deepseek', thinking_level: 'effort_high' });
  assert.equal(state, null);
  assert.deepEqual(body, {});
});

test('applyThinking: thinking_level 为空时返回 null', () => {
  const body = {};
  const state = applyThinkingToOpenAICompatibleBody(body, { provider: 'openai', thinking_level: null });
  assert.equal(state, null);
});
