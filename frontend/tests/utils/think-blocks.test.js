import { describe, expect, it } from 'vitest';

import { parseNextPromptStream } from '../../src/core/utils/next-prompt.js';
import { parseStreamingBlocks } from '../../src/core/utils/think-blocks.js';

describe('think blocks', () => {
  it('进入 think 后内层重复 <think> 增加深度,内层 </think> 减深但不闭合外层', () => {
    expect(parseStreamingBlocks('<think>思考内容<think>字面标签</think>')).toEqual([
      { type: 'thinking', content: '思考内容<think>字面标签</think>', open: true },
    ]);
  });

  it('未进入 think 时保留孤立闭合标签为普通文本', () => {
    expect(parseStreamingBlocks('正文</think>结尾')).toEqual([
      { type: 'text', content: '正文</think>结尾', open: false },
    ]);
  });

  it('深度归 0 立即闭合,多余 </think> 作为后续文本保留', () => {
    expect(parseStreamingBlocks('<think>思考内容</think>内层补充</think>正文')).toEqual([
      { type: 'thinking', content: '思考内容', open: false },
      { type: 'text', content: '内层补充</think>正文', open: false },
    ]);
  });

  it('未闭合 think 块保持 open 状态', () => {
    expect(parseStreamingBlocks('前文<think>思考中<think>标签')).toEqual([
      { type: 'text', content: '前文', open: false },
      { type: 'thinking', content: '思考中<think>标签', open: true },
    ]);
  });

  it('流式中间态:外层未闭合时内层 close 不提前闭合外层', () => {
    expect(parseStreamingBlocks('<think>A<think>B</think>')).toEqual([
      { type: 'thinking', content: 'A<think>B</think>', open: true },
    ]);
  });

  it('完整嵌套结构正确闭合,外层 close 后继续是正文', () => {
    expect(parseStreamingBlocks('<think>A<think>B</think>C</think>D')).toEqual([
      { type: 'thinking', content: 'A<think>B</think>C', open: false },
      { type: 'text', content: 'D', open: false },
    ]);
  });

  it('两个独立 think 块不被合并', () => {
    expect(parseStreamingBlocks('<think>A</think>B<think>C</think>D')).toEqual([
      { type: 'thinking', content: 'A', open: false },
      { type: 'text', content: 'B', open: false },
      { type: 'thinking', content: 'C', open: false },
      { type: 'text', content: 'D', open: false },
    ]);
  });
});

describe('next prompt stream', () => {
  it('不解析 think 块内的 next_prompt', () => {
    const raw = '<think>推理 <next_prompt>\n选项A\n</next_prompt></think>\n正文';
    expect(parseNextPromptStream(raw)).toEqual({ display: raw, options: [] });
  });

  it('think 块内出现多个 <next_prompt> 全部当字面剥除,不污染正文选项', () => {
    const raw = '<think>推理 <next_prompt>残A<next_prompt>残B</next_prompt></think>正文 <next_prompt>\n真选项\n</next_prompt>';
    const { display, options } = parseNextPromptStream(raw);
    expect(options).toEqual(['真选项']);
    expect(display).toBe('<think>推理 <next_prompt>残A<next_prompt>残B</next_prompt></think>正文 ');
  });

  it('嵌套 think 内的 next_prompt 不会因 think 提前闭合而漏出', () => {
    const raw = '<think>外A<think>内 <next_prompt>残</next_prompt></think>外B</think>正文';
    expect(parseNextPromptStream(raw)).toEqual({ display: raw, options: [] });
  });

  it('未闭合 think 内的 next_prompt 在流式中不被解析为正文选项', () => {
    const raw = '前文<think>思考 <next_prompt>残草稿';
    expect(parseNextPromptStream(raw)).toEqual({ display: raw, options: [] });
  });
});
