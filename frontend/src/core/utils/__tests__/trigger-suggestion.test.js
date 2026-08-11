import { describe, it, expect } from 'vitest';
import { suggestTrigger } from '../trigger-suggestion.js';

describe('suggestTrigger — 空输入', () => {
  it('空字符串不给建议', () => {
    expect(suggestTrigger('')).toBeNull();
    expect(suggestTrigger('   ')).toBeNull();
    expect(suggestTrigger(null)).toBeNull();
  });
});

describe('suggestTrigger — 状态条件规则', () => {
  it('提到已有状态字段 + 低于 + 数字 → 建议状态条件', () => {
    const r = suggestTrigger('当健康低于 20 时，角色会变得虚弱。', { stateFieldLabels: ['健康', '理智'] });
    expect(r.trigger_type).toBe('state');
    expect(r.prefill.conditions[0]).toEqual({ field_label: '健康', operator: '<', value: '20' });
  });

  it('识别"超过"映射为 >', () => {
    const r = suggestTrigger('金币超过1000时触发', { stateFieldLabels: ['金币'] });
    expect(r.trigger_type).toBe('state');
    expect(r.prefill.conditions[0].operator).toBe('>');
    expect(r.prefill.conditions[0].value).toBe('1000');
  });

  it('识别"不低于"映射为 >=（比"低于"更长，优先匹配）', () => {
    const r = suggestTrigger('好感度不低于50时', { stateFieldLabels: ['好感度'] });
    expect(r.trigger_type).toBe('state');
    expect(r.prefill.conditions[0].operator).toBe('>=');
  });

  it('数字条件但字段名不在世界已有字段里 → 不误判为状态条件', () => {
    const r = suggestTrigger('房间号低于20的都在一楼', { stateFieldLabels: ['健康', '理智'] });
    expect(r.trigger_type).not.toBe('state');
  });
});

describe('suggestTrigger — 关键词/专有名词规则', () => {
  it('正文出现已有角色名 → 建议关键词并预填', () => {
    const r = suggestTrigger('每当艾丽卡出现在对话里，都要提到她的红发。', { properNouns: ['艾丽卡', '路明非'] });
    expect(r.trigger_type).toBe('keyword');
    expect(r.prefill.keywords).toContain('艾丽卡');
  });

  it('正文出现世界内其它条目标题 → 建议关键词', () => {
    const r = suggestTrigger('这段历史与青云观的建立有关。', { properNouns: ['青云观'] });
    expect(r.trigger_type).toBe('keyword');
    expect(r.prefill.keywords).toContain('青云观');
  });

  it('直角引号包裹的短词被识别为候选关键词', () => {
    const r = suggestTrigger('当提到「青云观」时，描述其香火鼎盛。');
    expect(r.trigger_type).toBe('keyword');
    expect(r.prefill.keywords).toContain('青云观');
  });

  it('书名号包裹的短词被识别为候选关键词', () => {
    const r = suggestTrigger('如果对话提到《坠日录》，补充其背景设定。');
    expect(r.trigger_type).toBe('keyword');
    expect(r.prefill.keywords).toContain('坠日录');
  });

  it('引号里是整句对话（含人称代词）→ 不作为关键词候选', () => {
    const r = suggestTrigger('他忽然问「你爱我吗」，气氛一下子变得尴尬。');
    expect(r.prefill?.keywords ?? []).not.toContain('你爱我吗');
  });

  it('引号里含句末标点（完整短句）→ 不作为关键词候选', () => {
    const r = suggestTrigger('她小声说「快跑，他们来了。」然后转身离开。');
    expect(r.prefill?.keywords ?? []).not.toContain('快跑，他们来了。');
  });

  it('引号里以语气助词结尾（问句/感叹句）→ 不作为关键词候选', () => {
    const r = suggestTrigger('他喃喃道「这里到底是哪里啊」，四处张望。');
    expect(r.prefill?.keywords ?? []).not.toContain('这里到底是哪里啊');
  });

  it('去重且不超过 6 个候选', () => {
    const r = suggestTrigger('「甲村」「乙村」「丙村」「丁村」「戊村」「己村」「庚村」，「甲村」再提一次。', { properNouns: [] });
    expect(r.trigger_type).toBe('keyword');
    expect(new Set(r.prefill.keywords).size).toBe(r.prefill.keywords.length);
    expect(r.prefill.keywords.length).toBeLessThanOrEqual(6);
  });
});

describe('suggestTrigger — 一直生效（语气/基调）规则', () => {
  it('正文是世界观基调描述 → 建议一直生效', () => {
    const r = suggestTrigger('本世界观的基调是黑暗奇幻，写作风格偏克苏鲁。');
    expect(r.trigger_type).toBe('always');
  });

  it('提到"行为准则" → 建议一直生效', () => {
    const r = suggestTrigger('角色扮演的行为准则：始终保持第二人称叙事。');
    expect(r.trigger_type).toBe('always');
  });
});

describe('suggestTrigger — 兜底 AI 判断相关', () => {
  it('既无专有名词也无数值条件也无语气词 → 兜底 llm，且不给关键词建议', () => {
    const r = suggestTrigger('他推开了门。');
    expect(r.trigger_type).toBe('llm');
    expect(r.prefill).toEqual({});
  });

  it('普通描述性文字，没有可预填的高置信候选 → 抽不到关键词时不建议关键词', () => {
    const r = suggestTrigger('天色渐渐暗了下来，风也变得更冷了。');
    expect(r.trigger_type).not.toBe('keyword');
  });
});

describe('suggestTrigger — 优先级', () => {
  it('同时命中状态条件与关键词时，状态条件优先', () => {
    const r = suggestTrigger('在「青云观」，健康低于20时会触发虚弱效果。', { stateFieldLabels: ['健康'], properNouns: [] });
    expect(r.trigger_type).toBe('state');
  });
});
