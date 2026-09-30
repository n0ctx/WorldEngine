// 视觉主题包：frontend/src/visual/<id>/{theme.json, theme.css}，由 Vite 打包，以 _ 开头的目录（模板）不收。
export const DEFAULT_THEME_ID = 'nocturne';

const metas = import.meta.glob(['../../visual/*/theme.json', '!../../visual/_*/theme.json'], { eager: true, import: 'default' });
const styles = import.meta.glob(['../../visual/*/theme.css', '!../../visual/_*/theme.css'], {
  eager: true, query: '?raw', import: 'default',
});

const packs = Object.entries(metas)
  .map(([file, meta]) => ({ meta, css: styles[file.replace(/theme\.json$/, 'theme.css')] }))
  .sort((a, b) => a.meta.name.localeCompare(b.meta.name, 'zh-CN'));

export const VISUAL_THEMES = packs.map((pack) => pack.meta);

const cssById = new Map(packs.map((pack) => [pack.meta.id, pack.css]));

export function resolveThemeId(id) {
  return cssById.has(id) ? id : DEFAULT_THEME_ID;
}

// 把一份 theme.css 套到页面上。设计实验室的草稿主题也走这里，草稿不会成为「当前主题」
export function applyThemeCss(css, id) {
  let el = document.getElementById('we-theme-css');
  if (!el) {
    el = document.createElement('style');
    el.id = 'we-theme-css';
    const customCss = document.getElementById('we-custom-css');
    document.head.insertBefore(el, customCss || null);
  }
  el.textContent = css;
  window.dispatchEvent(new CustomEvent('we:theme-updated', { detail: { id } }));
}

// 配置里的主题 id 已不存在时回落默认主题
export function applyVisualTheme(id) {
  const themeId = resolveThemeId(id);
  applyThemeCss(cssById.get(themeId), themeId);
}
