import { describe, expect, it } from 'vitest';
import { describeGenerationError } from '../../src/core/utils/generation-error.js';

describe('describeGenerationError', () => {
  it('密钥错误翻成用户能处理的说法，原文留作详情，并提示去设置', () => {
    const raw = 'DeepSeek API error: 401 {"error":{"message":"Authentication Fails"}}';
    expect(describeGenerationError(raw)).toEqual({
      text: 'API Key 无效或没有权限，检查设置里的密钥',
      detail: raw,
      fixInSettings: true,
    });
  });

  it('余额不足：402 或报错原文提到额度，改设置解决不了', () => {
    expect(describeGenerationError('OpenAI API error: 402 Payment Required')).toMatchObject({ text: '服务商账户余额或额度不足', fixInSettings: false });
    expect(describeGenerationError('OpenAI API error: 400 Insufficient Balance')).toMatchObject({ text: '服务商账户余额或额度不足', fixInSettings: false });
  });

  it('模型名错、限流、服务商故障、超时、网络各归一类', () => {
    expect(describeGenerationError('Gemini API error: 404 model not found')).toMatchObject({ fixInSettings: true });
    expect(describeGenerationError('Anthropic API error: 429 rate limited').text).toBe('请求太频繁，稍等一会再重新生成');
    expect(describeGenerationError('Anthropic API error: 529 overloaded').text).toBe('服务商暂时出错，稍后再重新生成');
    expect(describeGenerationError('LLM chat timed out after 120000ms').text).toBe('模型太久没有回应，稍后再重新生成');
    expect(describeGenerationError('fetch failed')).toMatchObject({ text: '连不上模型服务，检查网络或设置里的接口地址', fixInSettings: true });
  });

  it('认不出的报错原样显示，不给去设置', () => {
    expect(describeGenerationError('当前会话没有可续写的用户-助手轮次')).toEqual({
      text: '当前会话没有可续写的用户-助手轮次',
      detail: null,
      fixInSettings: false,
    });
    expect(describeGenerationError(undefined).text).toBe('生成失败');
  });
});
