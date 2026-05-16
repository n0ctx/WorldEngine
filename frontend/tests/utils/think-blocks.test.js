import { describe, expect, it } from 'vitest';

import { parseNextPromptStream } from '../../src/core/utils/next-prompt.js';
import { parseStreamingBlocks } from '../../src/core/utils/think-blocks.js';

describe('think blocks', () => {
  it('进入 think 后忽略内部重复出现的 think 开标签', () => {
    expect(parseStreamingBlocks('<think>思考内容<think>字面标签</think>')).toEqual([
      { type: 'thinking', content: '思考内容<think>字面标签', open: false },
    ]);
  });

  it('未进入 think 时保留孤立闭合标签为普通文本', () => {
    expect(parseStreamingBlocks('正文</think>结尾')).toEqual([
      { type: 'text', content: '正文</think>结尾', open: false },
    ]);
  });

  it('进入 think 后忽略内部重复出现的 think 闭合标签', () => {
    expect(parseStreamingBlocks('<think>思考内容</think>内层补充</think>正文')).toEqual([
      { type: 'thinking', content: '思考内容</think>内层补充', open: false },
      { type: 'text', content: '正文', open: false },
    ]);
  });

  it('未闭合 think 块保持 open 状态', () => {
    expect(parseStreamingBlocks('前文<think>思考中<think>标签')).toEqual([
      { type: 'text', content: '前文', open: false },
      { type: 'thinking', content: '思考中<think>标签', open: true },
    ]);
  });
});

describe('next prompt stream', () => {
  it('不解析 think 块内的 next_prompt', () => {
    const raw = '<think>推理 <next_prompt>\n选项A\n</next_prompt></think>\n正文';
    expect(parseNextPromptStream(raw)).toEqual({ display: raw, options: [] });
  });
});
