import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseAnthropicPricingMarkdown,
  parseDeepSeekPricingPage,
  parseGeminiPricingPage,
  parseGrokPricingPage,
  parseKimiPricingMarkdown,
  parseMiniMaxPricingMarkdown,
  parseOpenAIPricingMarkdown,
  parseSiliconFlowPricingPage,
} from '../../services/model-pricing-parsers.js';

test('Anthropic 解析脚注、Fable/Mythos 名称，并保留按提示长度分档的首档', () => {
  const md = [
    '| Model | Base input tokens | 5m cache writes | 1h cache writes | Cache hits and refreshes | Output tokens |',
    '| :-- | :-- | :-- | :-- | :-- | :-- |',
    '| Claude Fable 5.1 | $10 / MTok | $12.50 / MTok | $20 / MTok | $0.25 / MTok<sup>1</sup> | $50 / MTok |',
    '| Claude Mythos 5 ([limited availability](https://example.com/a)) | $10 / MTok | $12.50 / MTok | $20 / MTok | $1 / MTok | $50 / MTok |',
    '| Claude Sonnet 5 | $2 / MTok<sup>3</sup> | $2.50 / MTok | $4 / MTok | $0.20 / MTok | $10 / MTok<sup>3</sup> |',
    '| Claude Haiku 5.5 (for prompts up to 100,000 tokens) | $0.10 / MTok | $0.125 / MTok | $0.20 / MTok | $0.01 / MTok | $0.50 / MTok |',
    '| Claude Haiku 5.5 (for prompts over 100,000 tokens) | $0.50 / MTok | $0.625 / MTok | $1 / MTok | $0.05 / MTok | $2.50 / MTok |',
  ].join('\n');
  const map = parseAnthropicPricingMarkdown(md);
  assert.deepEqual(map.get('claude-fable-5-1'), { inputPrice: 10, cacheWritePrice: 12.5, cacheReadPrice: 0.25, outputPrice: 50 });
  assert.deepEqual(map.get('claude-mythos-5'), { inputPrice: 10, cacheWritePrice: 12.5, cacheReadPrice: 1, outputPrice: 50 });
  assert.deepEqual(map.get('claude-sonnet-5'), { inputPrice: 2, cacheWritePrice: 2.5, cacheReadPrice: 0.2, outputPrice: 10 });
  assert.deepEqual(map.get('claude-haiku-5-5'), { inputPrice: 0.1, cacheWritePrice: 0.125, cacheReadPrice: 0.01, outputPrice: 0.5 });
});

test('OpenAI 只解析首张 Standard 表，映射缓存读写列并忽略长上下文列', () => {
  const md = [
    '### Standard pricing data',
    '',
    '| Model | Short context input | Short context cached input | Short context cache writes | Short context output | Long context input | Long context cached input | Long context cache writes | Long context output |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    '| gpt-6-sol | $2.00 | $0.20 | $2.50 | $10.00 | $4.00 | $0.40 | $5.00 | $15.00 |',
    '| gpt-5.5 (<272K context length) | $5.00 | $0.50 | - | $30.00 | $10.00 | $1.00 | - | $45.00 |',
    '| gpt-5-pro | $15.00 | - | - | $120.00 | - | - | - | - |',
    '',
    '### Batch pricing data',
    '',
    '| Model | Short context input | Short context cached input | Short context cache writes | Short context output | Long context input | Long context cached input | Long context cache writes | Long context output |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    '| gpt-6-sol | $1.00 | $0.10 | $1.25 | $5.00 | $2.00 | $0.20 | $2.50 | $7.50 |',
    '| gpt-batch-only | $1.00 | - | - | $5.00 | - | - | - | - |',
  ].join('\n');
  const map = parseOpenAIPricingMarkdown(md);
  assert.deepEqual(map.get('gpt-6-sol'), { inputPrice: 2, outputPrice: 10, cacheReadPrice: 0.2, cacheWritePrice: 2.5 });
  assert.deepEqual(map.get('gpt-5.5'), { inputPrice: 5, outputPrice: 30, cacheReadPrice: 0.5 });
  assert.deepEqual(map.get('gpt-5-pro'), { inputPrice: 15, outputPrice: 120 });
  assert.equal(map.has('gpt-batch-only'), false);
});

test('Grok 解析带 Long context 标注的行并取短上下文价，兼容 500k 与 1M 写法', () => {
  const html = '<table>Model Context Short context Long context Input Cached Output Input Cached Output '
    + 'grok-4.7 Long context ≥ 200k tokens 500k $2.00 $0.50 $6.00 $4.00 $1.00 $12.00 '
    + 'grok-4.3 Long context ≥ 200k tokens 1M $1.25 $0.20 $2.50 $2.50 $0.40 $5.00 '
    + 'grok-imagine-image Text, Image → Image $0.002 / img 1K $0.02 / img</table>';
  const map = parseGrokPricingPage(html);
  assert.deepEqual(map.get('grok-4.7'), { inputPrice: 2, cacheReadPrice: 0.5, outputPrice: 6 });
  assert.deepEqual(map.get('grok-4.3'), { inputPrice: 1.25, cacheReadPrice: 0.2, outputPrice: 2.5 });
  assert.equal(map.has('grok-imagine-image'), false);
});

test('Gemini 按页面里的模型 id 切分小节，覆盖新模型、并列标题，排除非文本模型', () => {
  const html = '<p>Gemini 3.8 Flash gemini-3.8-flash Try it Standard Free Tier Paid Tier, per 1M tokens in USD '
    + 'Input price Free of charge $0.75 through December 31, 2026. $1.50 starting January 1, 2027. '
    + 'Output price (including thinking tokens) Free of charge $3.75 through December 31, 2026. $7.50 starting January 1, 2027. '
    + 'Context caching price Free of charge $0.075 through December 31, 2026. $0.15 starting January 1, 2027. '
    + 'Gemini 3.1 Pro Preview gemini-3.1-pro-preview and gemini-3.1-pro-preview-customtools Try it Standard '
    + 'Input price Not available $2.00, prompts $4.00, prompts > 200k tokens '
    + 'Output price (including thinking tokens) Not available $12.00, prompts $18.00, prompts > 200k '
    + 'Context caching price Not available $0.20, prompts $0.40, prompts > 200k '
    + 'Gemini 2.5 Flash Image gemini-2.5-flash-image Try it Standard Input price Free of charge $0.30 Output price Not available $0.039 per image</p>';
  const map = parseGeminiPricingPage(html);
  assert.deepEqual(map.get('gemini-3.8-flash'), { inputPrice: 0.75, outputPrice: 3.75, cacheReadPrice: 0.075 });
  assert.deepEqual(map.get('gemini-3.1-pro-preview'), { inputPrice: 2, outputPrice: 12, cacheReadPrice: 0.2 });
  assert.deepEqual(map.get('gemini-3.1-pro-preview-customtools'), map.get('gemini-3.1-pro-preview'));
  assert.equal(map.has('gemini-2.5-flash-image'), false);
});

test('DeepSeek 取 OFF-PEAK 标准价，flash 同时以现行 id 与旧 id 入表', () => {
  const html = 'MODEL deepseek-flash deepseek-v4-pro PRICING '
    + '1M INPUT TOKENS (CACHE HIT) OFF-PEAK $0.003 $0.022 PEAK $0.006 $0.044 '
    + '1M INPUT TOKENS (CACHE MISS) OFF-PEAK $0.15 $0.66 PEAK $0.3 $1.32 '
    + '1M OUTPUT TOKENS OFF-PEAK $0.6 $1.98 PEAK $1.2 $3.96';
  const map = parseDeepSeekPricingPage(html);
  const flash = { inputPrice: 0.15, outputPrice: 0.6, cacheReadPrice: 0.003 };
  assert.deepEqual(map.get('deepseek-flash'), flash);
  assert.deepEqual(map.get('deepseek-v4-flash'), flash);
  assert.deepEqual(map.get('deepseek-v4-pro'), { inputPrice: 0.66, outputPrice: 1.98, cacheReadPrice: 0.022 });
});

test('Kimi 从定价页 Markdown 行解析，K3 带缓存写入，K2 系列无缓存写入', () => {
  const md = [
    'rows={[',
    '["kimi-k3", "1M tokens", "¥20.00", "¥40.00", "¥2.00", "¥20.00", "¥100.00", "1,048,576 tokens"],',
    ']}',
    'rows={[',
    '["kimi-k2.6", "1M tokens", "¥1.10", "¥6.50", "¥27.00", "262,144 tokens"],',
    ']}',
  ].join('\n');
  const map = parseKimiPricingMarkdown(md);
  assert.deepEqual(map.get('kimi-k3'), { inputPrice: 20, outputPrice: 100, cacheReadPrice: 2, cacheWritePrice: 20 });
  assert.deepEqual(map.get('kimi-k2.6'), { inputPrice: 6.5, outputPrice: 27, cacheReadPrice: 1.1 });
});

test('MiniMax 取删除线之后的现价，M3 多档时保留首个标准档', () => {
  const md = [
    '| **模型** | **输入价格** | **输出价格** | **缓存读取** |',
    '| :- | :-: | :-: | :-: |',
    '| **MiniMax-M3**<br />≤ 512k 输入 tokens <span className="x">永久五折</span> | ~~4.20~~ 2.10 | ~~16.80~~ 8.40 | ~~0.84~~ 0.42 |',
    '| **MiniMax-M3**<br />> 512k 输入 tokens\\* <span className="x">永久五折</span> | ~~8.40~~ 4.20 | ~~33.60~~ 16.80 | ~~1.68~~ 0.84 |',
    '| **MiniMax-M2.7** | 2.1 | 8.4 | 0.42 | 2.625 |',
  ].join('\n');
  const map = parseMiniMaxPricingMarkdown(md);
  assert.deepEqual(map.get('MiniMax-M3'), { inputPrice: 2.1, outputPrice: 8.4, cacheReadPrice: 0.42 });
  assert.deepEqual(map.get('MiniMax-M2.7'), { inputPrice: 2.1, outputPrice: 8.4, cacheReadPrice: 0.42, cacheWritePrice: 2.625 });
});

test('SiliconFlow 按完整模型 id 解析，分档取首档，时段计价与免费行不收录', () => {
  const html = '<div>对话模型 deepseek-ai DeepSeek-V3.2 deepseek-ai/DeepSeek-V3.2 ¥ 4.00 ¥ 6.00 ¥ 0.40 '
    + 'DeepSeek-V4.1-Flash deepseek-ai/DeepSeek-V4.1-Flash 费用发生时段: 0点～2点 ¥ 2.00 费用发生时段: 0点～2点 ¥ 8.00 '
    + 'Qwen3.5-27B Qwen/Qwen3.5-27B 输入 [0, 128k) ¥ 0.60 输入 [0, 128k) ¥ 4.80 - 输入 [128k, +∞) ¥ 1.80 输入 [128k, +∞) ¥ 14.40 - '
    + 'Hunyuan-MT-7B tencent/Hunyuan-MT-7B 免费 免费 -</div>';
  const map = parseSiliconFlowPricingPage(html);
  assert.deepEqual(map.get('deepseek-ai/DeepSeek-V3.2'), { inputPrice: 4, outputPrice: 6, cacheReadPrice: 0.4 });
  assert.deepEqual(map.get('Qwen/Qwen3.5-27B'), { inputPrice: 0.6, outputPrice: 4.8 });
  assert.equal(map.has('deepseek-ai/DeepSeek-V4.1-Flash'), false);
  assert.equal(map.has('tencent/Hunyuan-MT-7B'), false);
});
