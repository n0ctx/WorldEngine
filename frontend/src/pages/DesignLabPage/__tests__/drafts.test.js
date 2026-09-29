import { describe, expect, it } from 'vitest';
import { DRAFTS, DRAFT_PREFIX, listDrafts } from '../drafts.js';

describe('草稿主题', () => {
  it('每个 drafts/*.css 成为一个「草稿 · 文件名」选项，按文件名排序，内容原样保留', () => {
    const drafts = listDrafts({
      './drafts/zeta.css': ':root { --we-color-accent: #f00; }',
      './drafts/alpha.css': ':root { --we-color-accent: #0f0; }',
    });
    expect(drafts.map((item) => item.key)).toEqual([`${DRAFT_PREFIX}alpha`, `${DRAFT_PREFIX}zeta`]);
    expect(drafts.map((item) => item.label)).toEqual(['草稿 · alpha', '草稿 · zeta']);
    expect(drafts[0].css).toContain('#0f0');
  });

  it('没有草稿文件时是空列表，主题一行只有正式主题', () => {
    expect(listDrafts({})).toEqual([]);
    expect(Array.isArray(DRAFTS)).toBe(true);
  });
});
