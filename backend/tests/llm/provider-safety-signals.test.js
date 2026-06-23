import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractOpenAICompatibleSignal,
  extractAnthropicSignal,
  extractGeminiSignal,
  extractProviderErrorSignal,
} from '../../llm/providers/_shared/provider-safety-signals.js';

const ctx = (overrides = {}) => ({
  provider: 'openai',
  model: 'gpt-4',
  mode: 'chat',
  stream: false,
  phase: 'complete_response',
  internalRequestId: 'req_test',
  ...overrides,
});

test('OpenAI: finish_reason=content_filter → safety/content_filter/high', () => {
  const s = extractOpenAICompatibleSignal(
    { choices: [{ finish_reason: 'content_filter', message: { content: '' } }] },
    ctx({ stream: true, phase: 'stream_stop' }),
  );
  assert.equal(s.signalFamily, 'safety');
  assert.equal(s.signalName, 'content_filter');
  assert.equal(s.severity, 'high');
  assert.equal(s.action, 'stream_stopped_by_provider');
  assert.equal(s.rawFinishReason, 'content_filter');
});

test('OpenAI: message.refusal → refusal/medium', () => {
  const s = extractOpenAICompatibleSignal(
    { choices: [{ finish_reason: 'stop', message: { refusal: 'I cannot help.' } }] },
    ctx(),
  );
  assert.equal(s.signalFamily, 'refusal');
  assert.equal(s.signalName, 'message_refusal');
  assert.ok(s.providerErrorMessageHash);
});

test('智谱: error.code=1301 → safety/zhipu_1301/high', () => {
  const s = extractProviderErrorSignal(
    { error: { code: '1301', message: 'sensitive' }, contentFilter: [{ role: 'user', level: 1 }] },
    ctx({ provider: 'glm', phase: 'request_error' }),
  );
  assert.equal(s.signalName, 'zhipu_1301');
  assert.equal(s.severity, 'high');
  assert.deepEqual(s.contentFilter, [{ role: 'user', level: 1 }]);
});

test('智谱: finish_reason=sensitive 流尾 chunk → safety/finish_reason_sensitive', () => {
  const s = extractOpenAICompatibleSignal(
    {
      choices: [{ delta: {}, finish_reason: 'sensitive' }],
      content_filter: [{ role: 'assistant', level: 2 }],
    },
    ctx({ provider: 'glm', stream: true, phase: 'stream_stop' }),
  );
  assert.equal(s.signalName, 'finish_reason_sensitive');
  assert.equal(s.severity, 'medium'); // level 2 → medium
  assert.equal(s.action, 'stream_stopped_by_provider');
});

test('Anthropic: stop_reason=refusal → refusal/anthropic_refusal/high', () => {
  const s = extractAnthropicSignal(
    { stop_reason: 'refusal', stop_details: { reason: 'policy' } },
    ctx({ provider: 'anthropic', model: 'claude-opus-4' }),
  );
  assert.equal(s.signalFamily, 'refusal');
  assert.equal(s.signalName, 'anthropic_refusal');
  assert.deepEqual(s.stopDetails, { reason: 'policy' });
});

test('Anthropic: stop_reason=pause_turn → operational', () => {
  const s = extractAnthropicSignal({ stop_reason: 'pause_turn' }, ctx({ provider: 'anthropic' }));
  assert.equal(s.signalFamily, 'operational');
  assert.equal(s.signalName, 'anthropic_pause_turn');
});

test('Gemini: finishReason=SAFETY → safety/gemini_safety_finish/high', () => {
  const s = extractGeminiSignal(
    {
      candidates: [{
        finishReason: 'SAFETY',
        safetyRatings: [{ category: 'HARM_CATEGORY_DANGEROUS_CONTENT', probability: 'HIGH', blocked: true }],
      }],
    },
    ctx({ provider: 'gemini', model: 'gemini-2.5-pro' }),
  );
  assert.equal(s.signalName, 'gemini_safety_finish');
  assert.equal(s.severity, 'high');
  assert.equal(s.geminiSafetyRatings[0].blocked, true);
});

test('Gemini: promptFeedback.blockReason → request_blocked_by_provider', () => {
  const s = extractGeminiSignal(
    { promptFeedback: { blockReason: 'SAFETY' } },
    ctx({ provider: 'gemini' }),
  );
  assert.equal(s.signalName, 'gemini_prompt_blocked');
  assert.equal(s.action, 'request_blocked_by_provider');
});

test('MiniMax: output_sensitive=true → safety/minimax_output_sensitive/high', () => {
  const s = extractOpenAICompatibleSignal(
    {
      input_sensitive: false,
      output_sensitive: true,
      output_sensitive_type: 2,
      output_sensitive_int: 2,
      choices: [{ finish_reason: 'stop' }],
    },
    ctx({ provider: 'minimax' }),
  );
  assert.equal(s.signalName, 'minimax_output_sensitive');
  assert.equal(s.severity, 'high');
  assert.equal(s.minimaxSensitiveMeta.output_sensitive_int, 2);
});

test('正常 finish_reason=stop 不产生 signal', () => {
  const s = extractOpenAICompatibleSignal(
    { choices: [{ finish_reason: 'stop', message: { content: 'hi' } }] },
    ctx(),
  );
  assert.equal(s, null);
});

test('OpenRouter native_finish_reason 含 safety → signal', () => {
  const s = extractOpenAICompatibleSignal(
    { choices: [{ finish_reason: 'stop', native_finish_reason: 'content_safety', message: {} }] },
    ctx({ provider: 'openrouter', stream: true, phase: 'stream_stop' }),
  );
  assert.ok(s);
  assert.equal(s.signalFamily, 'safety');
  assert.equal(s.nativeFinishReason, 'content_safety');
});
