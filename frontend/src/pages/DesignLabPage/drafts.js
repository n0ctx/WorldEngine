/**
 * 草稿主题：pages/DesignLabPage/drafts/*.css，每个文件是一份完整的 theme.css（从 themes/_template/theme.css 复制起步）。
 * 实验室的「主题」一行会多出「草稿 · 文件名」，选中即临时套用，不写配置、不进 themes/；改文件立即热更新。
 * 用户在浏览器里确认后，再把它搬进 themes/<id>/ 并补 theme.json。
 */
export const DRAFT_PREFIX = 'draft:';

export function listDrafts(modules) {
  return Object.entries(modules)
    .map(([file, css]) => {
      const name = file.split('/').pop().replace(/\.css$/, '');
      return { key: `${DRAFT_PREFIX}${name}`, label: `草稿 · ${name}`, css };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

export const DRAFTS = listDrafts(import.meta.glob('./drafts/*.css', { query: '?raw', import: 'default', eager: true }));
